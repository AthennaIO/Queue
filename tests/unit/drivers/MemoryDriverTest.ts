/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Queue, QueueProvider, type MemoryDriver } from '#src'
import { Path, Sleep } from '@athenna/common'
import { Otel, OtelProvider } from '@athenna/otel'
import { Log, LoggerProvider } from '@athenna/logger'
import { context, createContextKey } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { Test, type Context, BeforeEach, AfterEach, Mock } from '@athenna/test'
import { InvalidJobDelayException } from '#src/exceptions/InvalidJobDelayException'

export class MemoryDriverTest {
  @BeforeEach()
  public async beforeEach() {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
    await Config.loadAll(Path.fixtures('config'))

    new OtelProvider().register()
    Otel.start()
    new QueueProvider().register()
    new LoggerProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    context.disable()

    await Queue.connection('memory').truncate()
    await Queue.connection('memoryBackoff').truncate()
    await Queue.connection('memoryTimeout').truncate()
    await Queue.closeAll()
    await new OtelProvider().shutdown()

    ioc.reconstruct()

    Config.clear()
    Mock.restoreAll()
  }

  @Test()
  public async shouldBeAbleToConnectToDriver({ assert }: Context) {
    Queue.connection('memory')

    assert.isTrue(Queue.isConnected())
  }

  @Test()
  public async shouldBeAbleToCloseTheConnectionWithDriver({ assert }: Context) {
    const queue = Queue.connection('memory')

    await queue.close()

    assert.isFalse(queue.isConnected())
  }

  @Test()
  public async shouldBeAbleToCloneTheQueueInstance({ assert }: Context) {
    const driver = Queue.connection('memory').driver
    const otherDriver = driver.clone()

    driver.isConnected = false

    assert.isTrue(otherDriver.isConnected)
  }

  @Test()
  public async shouldBeAbleToGetDriverClient({ assert }: Context) {
    const client = Queue.connection('memory').driver.getClient()

    assert.isDefined(client)
  }

  @Test()
  public async shouldBeAbleToSetDifferentClientForDriver({ assert }: Context) {
    const driver = Queue.connection('memory').driver

    driver.setClient({ hello: 'world' } as any)

    assert.deepEqual(driver.client, { hello: 'world' })
  }

  @Test()
  public async shouldBeAbleToSeeHowManyJobsAreInsideTheQueue({ assert }: Context) {
    const length = await Queue.connection('memory').length()

    assert.deepEqual(length, 0)
  }

  @Test()
  public async shouldBeAbleToAddJobsToTheQueue({ assert }: Context) {
    const queue = Queue.connection('memory')

    await queue.add({ hello: 'world' })

    const length = await queue.length()
    const isEmpty = await queue.isEmpty()

    assert.isFalse(isEmpty)
    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldBeAbleToAddJobsToADifferentQueue({ assert }: Context) {
    const queue = Queue.connection('memory')

    await queue.queue('other').add({ hello: 'world' })

    const length = await queue.length()
    const isEmpty = await queue.isEmpty()

    assert.isFalse(isEmpty)
    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldBeAbleToVerifyIfTheQueueIsEmpty({ assert }: Context) {
    const queue = Queue.connection('memory')

    const isEmpty = await queue.isEmpty()

    assert.isTrue(isEmpty)
  }

  @Test()
  public async shouldBeAbleToPeekTheNextJobWithoutRemovingItFromTheQueue({ assert }: Context) {
    const queue = Queue.connection('memory')

    await queue.add({ name: 'lenon' })

    const job = await queue.peek()
    const length = await queue.length()

    assert.deepEqual(length, 1)
    assert.containSubset(job, {
      attempts: 1,
      data: { name: 'lenon' }
    })
  }

  @Test()
  public async shouldBeAbleToPopTheNextJobRemovingItFromTheQueue({ assert }: Context) {
    const queue = Queue.connection('memory')

    await queue.add({ name: 'lenon' })

    const job = await queue.pop()
    const length = await queue.length()

    assert.deepEqual(length, 0)
    assert.containSubset(job, {
      attempts: 1,
      data: { name: 'lenon' }
    })
  }

  @Test()
  public async shouldBeAbleToProcessTheNextJobFromTheQueueWithAProcessor({ assert }: Context) {
    const queue = Queue.connection('memory')

    await queue.add({ name: 'lenon' })

    let data: any = {}
    let attempts: number

    await queue.process(async job => {
      data = job.data
      attempts = job.attempts
    })

    assert.equal(attempts, 0)
    assert.equal(data.name, 'lenon')
  }

  @Test()
  public async shouldBeAbleToSendTheJobToDeadletterQueueIfProcessorFails({ assert }: Context) {
    const queue = Queue.connection('memory')

    await queue.add({ name: 'lenon' })

    await queue.process(async () => {
      throw new Error('testing')
    })

    const length = await queue.queue('deadletter').length()

    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldAbandonAHangingProcessorAfterWorkerTimeoutMsAndDeadletterIt({ assert }: Context) {
    const queue = Queue.connection('memoryTimeout')

    await queue.add({ name: 'lenon' })

    const startedAt = Date.now()

    /**
     * A handler that never resolves — without `workerTimeoutMs` this would
     * wedge `process()` forever (a hung HTTP/DB await). With it, the job is
     * abandoned after 200ms and routed to the deadletter so the consumer
     * loop is freed. `process()` returning at all is the proof it no longer
     * wedges; the deadletter is the proof the job was treated as failed (a
     * job that completes normally is acked and removed, not deadlettered).
     */
    await queue.process(() => new Promise(() => {}))

    const elapsed = Date.now() - startedAt

    assert.isAbove(elapsed, 150)
    assert.isBelow(elapsed, 5000)

    const length = await queue.queue('deadletter').length()

    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldBeAbleToRetryTheJobIfBackoffIsConfiguredToQueue({ assert }: Context) {
    const queue = Queue.connection('memoryBackoff')

    await queue.add({ name: 'lenon' })

    await queue.process(async () => {
      throw new Error('testing')
    })

    await Sleep.for(1500).milliseconds().wait()

    const jobFirstAttempt = await queue.peek()

    assert.containSubset(jobFirstAttempt, {
      attempts: 1,
      data: { name: 'lenon' }
    })

    await queue.process(async () => {
      throw new Error('testing')
    })

    await Sleep.for(1000).milliseconds().wait()

    const jobSecondAttempt = await queue.peek()

    assert.isNull(jobSecondAttempt)

    const length = await queue.queue('deadletter').length()

    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldRunFallbackProcessorsInsideOtelContext({ assert }: Context) {
    const queue = Queue.connection('memory')
    const connectionKey = createContextKey('memory.driver.connection')
    const attemptsKey = createContextKey('memory.driver.attempts')
    const values = {
      connection: null,
      attempts: null
    }

    Config.set('worker.otel.contextEnabled', true)
    Config.set('worker.otel.contextBindings', [
      { key: connectionKey, resolve: ctx => ctx.connection },
      { key: attemptsKey, resolve: ctx => ctx.job.attempts }
    ])

    await queue.add({ name: 'lenon' })

    await queue.process(async () => {
      values.connection = context.active().getValue(connectionKey) as any
      values.attempts = context.active().getValue(attemptsKey) as any
    })

    assert.equal(values.connection, 'memory')
    assert.equal(values.attempts, 0)
  }

  @Test()
  public async shouldKeepOtelContextActiveDuringFallbackProcessorExceptionLogging({ assert }: Context) {
    const queue = Queue.connection('memory')
    const connectionKey = createContextKey('memory.driver.exception.connection')
    const attemptsKey = createContextKey('memory.driver.exception.attempts')
    const values = {
      connection: null,
      attempts: null
    }

    Config.set('worker.otel.contextEnabled', true)
    Config.set('worker.otel.contextBindings', [
      { key: connectionKey, resolve: ctx => ctx.connection },
      { key: attemptsKey, resolve: ctx => ctx.job.attempts }
    ])
    Config.set('worker.logger.prettifyException', false)

    Log.when('channelOrVanilla').return({
      error: () => {
        values.connection = context.active().getValue(connectionKey) as any
        values.attempts = context.active().getValue(attemptsKey) as any
      }
    })

    await queue.add({ name: 'lenon' })

    await queue.process(async () => {
      throw new Error('testing')
    })

    assert.equal(values.connection, 'memory')
    assert.equal(values.attempts, 0)
  }

  @Test()
  public async shouldNotPopAJobAddedWithLaterBeforeItsTime({ assert }: Context) {
    const queue = Queue.connection('memory')

    await queue.later(300, { name: 'lenon' })

    const jobBefore = await queue.pop()
    const lengthBefore = await queue.length()

    assert.isNull(jobBefore)
    assert.deepEqual(lengthBefore, 1)

    await Sleep.for(400).milliseconds().wait()

    const jobAfter = await queue.pop()
    const lengthAfter = await queue.length()

    assert.deepEqual(lengthAfter, 0)
    assert.containSubset(jobAfter, {
      attempts: 1,
      data: { name: 'lenon' }
    })
  }

  @Test()
  public async shouldNotPeekOrProcessAJobAddedWithLaterBeforeItsTime({ assert }: Context) {
    const queue = Queue.connection('memory')

    await queue.later(300, { name: 'lenon' })

    let processed = 0

    assert.isNotOk(await queue.peek())

    await queue.process(async () => {
      processed++
    })

    assert.equal(processed, 0)

    await Sleep.for(400).milliseconds().wait()

    assert.containSubset(await queue.peek(), { data: { name: 'lenon' } })

    await queue.process(async job => {
      processed++

      assert.deepEqual(job.data, { name: 'lenon' })
    })

    assert.equal(processed, 1)
  }

  @Test()
  public async shouldBeAbleToAddJobsWithLaterUsingAnExactDate({ assert }: Context) {
    const queue = Queue.connection('memory')
    const date = new Date(Date.now() + 300)

    await queue.later(date, { name: 'lenon' })

    const [job] = (queue.driver as MemoryDriver).client.queues.default

    assert.equal(job.availableAt, date.getTime())
    assert.isNull(await queue.pop())

    await Sleep.for(400).milliseconds().wait()

    assert.containSubset(await queue.pop(), { data: { name: 'lenon' } })
  }

  @Test()
  public async shouldMakeTheJobAvailableNowWhenTheLaterDelayIsZeroNegativeOrAPastDate({ assert }: Context) {
    const queue = Queue.connection('memory')

    await queue.later(0, { name: 'zero' })
    await queue.later(-1000, { name: 'negative' })
    await queue.later(new Date(Date.now() - 60000), { name: 'past' })

    const zero = await queue.pop()
    const negative = await queue.pop()
    const past = await queue.pop()

    assert.deepEqual(zero.data, { name: 'zero' })
    assert.deepEqual(negative.data, { name: 'negative' })
    assert.deepEqual(past.data, { name: 'past' })
    assert.isTrue(await queue.isEmpty())
  }

  @Test()
  public async shouldPopJobsAddedWithAddWhileADelayedJobIsWaiting({ assert }: Context) {
    const queue = Queue.connection('memory')

    await queue.later(60000, { name: 'later' })
    await queue.add({ name: 'now' })

    const job = await queue.pop()

    assert.deepEqual(job.data, { name: 'now' })
    assert.deepEqual(await queue.length(), 1)
    assert.isNull(await queue.pop())
  }

  @Test()
  public async shouldBeAbleToUseLaterFromTheFacadeDefaultConnectionAndANamedQueue({ assert }: Context) {
    await Queue.later(60000, { name: 'facade' })
    await Queue.connection('memory').queue('mail').later(0, { name: 'mail' })

    assert.deepEqual(await Queue.length(), 1)
    assert.isNull(await Queue.pop())

    const job = await Queue.connection('memory').queue('mail').pop()

    assert.deepEqual(job.data, { name: 'mail' })
  }

  @Test()
  public async shouldThrowInvalidJobDelayExceptionWhenTheLaterDelayIsInvalid({ assert }: Context) {
    const queue = Queue.connection('memory')

    await assert.rejects(() => queue.later(NaN, { name: 'lenon' }), InvalidJobDelayException)
    await assert.rejects(() => queue.later(Infinity, { name: 'lenon' }), InvalidJobDelayException)
    await assert.rejects(() => queue.later('1000' as any, { name: 'lenon' }), InvalidJobDelayException)
    await assert.rejects(() => queue.later(null as any, { name: 'lenon' }), InvalidJobDelayException)
    await assert.rejects(() => queue.later(new Date('invalid'), { name: 'lenon' }), InvalidJobDelayException)
    await assert.rejects(() => queue.driver.later(NaN, { name: 'lenon' }), InvalidJobDelayException)

    assert.isTrue(await queue.isEmpty())
  }

  @Test()
  public async shouldApplyThePropagationEnvelopeToJobsAddedWithLaterLikeAdd({ assert }: Context) {
    const queue = Queue.connection('memory')

    Config.set('otel.enabled', true)

    await Otel.withContext(async () => {
      Otel.setCurrentContextValue('tenantId', 'tenant-1')

      await queue.add({ name: 'add' })
      await queue.later(0, { name: 'later' })
    })

    const [added, delayed] = (queue.driver as MemoryDriver).client.queues.default

    assert.deepEqual(added.data.__athenna_queue__.currentContextValues, { tenantId: 'tenant-1' })
    assert.deepEqual(delayed.data.__athenna_queue__.currentContextValues, { tenantId: 'tenant-1' })
    assert.deepEqual(delayed.data.payload, { name: 'later' })

    await queue.pop()

    const job = await queue.pop()

    assert.deepEqual(job.data, { name: 'later' })
  }

  @Test()
  public async shouldBeAbleToTruncateAllJobs({ assert }: Context) {
    const queue = Queue.connection('memory')

    await queue.add({ name: 'lenon' })

    await queue.truncate()

    const isEmpty = await queue.isEmpty()

    assert.isTrue(isEmpty)
  }
}
