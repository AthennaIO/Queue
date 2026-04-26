/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Queue, QueueProvider } from '#src'
import { Path, Sleep } from '@athenna/common'
import { OtelProvider } from '@athenna/otel'
import { Log, LoggerProvider } from '@athenna/logger'
import { context, createContextKey } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { Test, type Context, BeforeEach, AfterEach, Mock } from '@athenna/test'

export class MemoryDriverTest {
  @BeforeEach()
  public async beforeEach() {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
    await Config.loadAll(Path.fixtures('config'))

    new OtelProvider().register()
    new QueueProvider().register()
    new LoggerProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    context.disable()

    await Queue.connection('memory').truncate()
    await Queue.connection('memoryBackoff').truncate()
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
  public async shouldBeAbleToTruncateAllJobs({ assert }: Context) {
    const queue = Queue.connection('memory')

    await queue.add({ name: 'lenon' })

    await queue.truncate()

    const isEmpty = await queue.isEmpty()

    assert.isTrue(isEmpty)
  }
}
