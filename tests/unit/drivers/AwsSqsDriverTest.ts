/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Is, Path } from '@athenna/common'
import { EnvHelper } from '@athenna/config'
import { Otel, OtelProvider } from '@athenna/otel'
import { BaseTest } from '#tests/helpers/BaseTest'
import { Log, LoggerProvider } from '@athenna/logger'
import { Queue, WorkerProvider, QueueProvider } from '#src'
import { context, createContextKey } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { Test, type Context, BeforeEach, AfterEach, Skip, AfterAll, Mock } from '@athenna/test'

export class AwsSqsDriverTest extends BaseTest {
  @BeforeEach()
  public async beforeEach() {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
    EnvHelper.resolveFilePath(Path.pwd('.env'))
    await Config.loadAll(Path.fixtures('config'))

    new OtelProvider().register()
    Otel.start()
    new QueueProvider().register()
    new WorkerProvider().register()
    new LoggerProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    context.disable()

    await Queue.closeAll()
    await new OtelProvider().shutdown()

    Queue.worker().close()

    ioc.reconstruct()

    Config.clear()
    Mock.restoreAll()
  }

  @AfterAll()
  public async afterAll() {
    await Config.loadAll(Path.fixtures('config'))

    new QueueProvider().register()
    new WorkerProvider().register()
    new LoggerProvider().register()

    await Queue.connection('aws_sqs').truncate().catch()

    await Queue.closeAll()

    Queue.worker().close()

    ioc.reconstruct()

    Config.clear()
  }

  @Test()
  public async shouldBeAbleToConnectToDriver({ assert }: Context) {
    Queue.connection('aws_sqs')

    assert.isTrue(Queue.isConnected())
  }

  @Test()
  public async shouldBeAbleToCloseTheConnectionWithDriver({ assert }: Context) {
    const queue = Queue.connection('aws_sqs')

    await queue.close()

    assert.isFalse(queue.isConnected())
  }

  @Test()
  public async shouldBeAbleToCloneTheQueueInstance({ assert }: Context) {
    const driver = Queue.connection('aws_sqs').driver
    const otherDriver = driver.clone()

    driver.isConnected = false

    assert.isTrue(otherDriver.isConnected)
  }

  @Test()
  public async shouldBeAbleToGetDriverClient({ assert }: Context) {
    const client = Queue.connection('aws_sqs').driver.getClient()

    assert.isDefined(client)
  }

  @Test()
  public async shouldBeAbleToSetDifferentClientForDriver({ assert }: Context) {
    const driver = Queue.connection('aws_sqs').driver

    driver.setClient({ hello: 'world' } as any)

    assert.deepEqual(driver.client, { hello: 'world' })
  }

  @Test()
  public async shouldBeAbleToSeeHowManyJobsAreInsideTheQueue({ assert }: Context) {
    const length = await Queue.connection('aws_sqs').length()

    assert.isTrue(Is.Number(length))
  }

  @Test()
  public async shouldBeAbleToAddJobsToTheQueue({ assert }: Context) {
    const queue = Queue.connection('aws_sqs')

    await queue.add({ hello: 'world' })

    const job = await queue.pop()

    assert.containSubset(job, {
      data: { hello: 'world' }
    })
  }

  @Test()
  public async shouldBeAbleToVerifyIfTheQueueIsEmpty({ assert }: Context) {
    const queue = Queue.connection('aws_sqs')

    const isEmpty = await queue.isEmpty()

    assert.isTrue(Is.Boolean(isEmpty))
  }

  @Test()
  @Skip('Peek is not supported in SQS.')
  public async shouldBeAbleToPeekTheNextJobWithoutRemovingItFromTheQueue({ assert }: Context) {
    const queue = Queue.connection('aws_sqs')

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
    const queue = Queue.connection('aws_sqs')

    await queue.add({ name: 'lenon' })

    const job = await queue.pop()

    assert.containSubset(job, {
      data: { name: 'lenon' }
    })
  }

  @Test()
  public async shouldBeAbleToProcessTheNextJobFromTheQueueWithAProcessor({ assert }: Context) {
    const queue = Queue.connection('aws_sqs')

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
    const queue = Queue.connection('aws_sqs')

    await queue.add({ name: 'lenon' })

    await queue.process(async () => {
      throw new Error('testing')
    })

    const isEmpty = await queue.queue(Config.get('queue.connections.aws_sqs.deadletter')).isEmpty()

    assert.isFalse(isEmpty)
  }

  @Test()
  public async shouldBeAbleToRetryTheJobIfBackoffIsConfiguredToQueue({ assert }: Context) {
    assert.plan(3)

    const queue = Queue.connection('awsSqsBackoff')

    await queue.add({ name: 'lenon' })

    await queue.process(async job => {
      assert.containSubset(job, {
        attempts: 1,
        data: { name: 'lenon' }
      })

      throw new Error('testing')
    })

    await queue.process(async job => {
      assert.containSubset(job, {
        attempts: 0,
        data: { name: 'lenon' }
      })

      throw new Error('testing')
    })

    const isEmpty = await queue.queue(Config.get('queue.connections.aws_sqs.deadletter')).isEmpty()

    assert.isFalse(isEmpty)
  }

  @Test()
  public async shouldRunFallbackProcessorsInsideOtelContext({ assert }: Context) {
    const queue = Queue.connection('aws_sqs')
    const connectionKey = createContextKey('aws.driver.connection')
    const attemptsKey = createContextKey('aws.driver.attempts')
    const values = {
      connection: null,
      attempts: null
    }

    Config.set('worker.otel.contextEnabled', true)
    Config.set('worker.otel.contextBindings', [
      { key: connectionKey, resolve: ctx => ctx.connection },
      { key: attemptsKey, resolve: ctx => ctx.job.attempts }
    ])

    Mock.when(queue.driver, 'pop').resolve({
      id: 'receipt-1',
      attempts: 0,
      data: { name: 'lenon' },
      metadata: { Attributes: { ApproximateReceiveCount: '1' } }
    })

    Mock.when(queue.driver, 'changeJobVisibility').resolve()

    await queue.process(async () => {
      values.connection = context.active().getValue(connectionKey) as any
      values.attempts = context.active().getValue(attemptsKey) as any
    })

    assert.equal(values.connection, 'aws_sqs')
    assert.equal(values.attempts, 0)
  }

  @Test()
  public async shouldKeepOtelContextActiveDuringFallbackProcessorExceptionLogging({ assert }: Context) {
    const queue = Queue.connection('aws_sqs')
    const connectionKey = createContextKey('aws.driver.exception.connection')
    const attemptsKey = createContextKey('aws.driver.exception.attempts')
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

    Mock.when(queue.driver, 'pop').resolve({
      id: 'receipt-2',
      attempts: 0,
      data: { name: 'lenon' },
      metadata: { Attributes: { ApproximateReceiveCount: '1' } }
    })
    Mock.when(queue.driver, 'sendJobToDLQ').resolve()
    Mock.when(queue.driver, 'ack').resolve()
    Log.when('channelOrVanilla').return({
      error: () => {
        values.connection = context.active().getValue(connectionKey) as any
        values.attempts = context.active().getValue(attemptsKey) as any
      }
    })

    await queue.process(async () => {
      throw new Error('testing')
    })

    assert.equal(values.connection, 'aws_sqs')
    assert.equal(values.attempts, 0)
  }

  @Test()
  public async shouldReenterCapturedScopeForHeartbeatCallbacks({ assert }: Context) {
    const queue = Queue.connection('aws_sqs')
    const connectionKey = createContextKey('aws.driver.heartbeat.connection')
    const calls: string[] = []

    Config.set('worker.otel.contextEnabled', true)
    Config.set('worker.otel.contextBindings', [{ key: connectionKey, resolve: ctx => ctx.connection }])

    Mock.when(queue.driver, 'pop').resolve({
      id: 'receipt-3',
      attempts: 0,
      data: { name: 'lenon' },
      metadata: { Attributes: { ApproximateReceiveCount: '1' } }
    })
    Mock.when(queue.driver, 'calculateHeartbeatDelay').return(5)
    Mock.stub(queue.driver, 'changeJobVisibility').callsFake(async () => {
      calls.push(context.active().getValue(connectionKey) as string)
    })

    await queue.process(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })

    assert.isTrue(calls.length >= 1)
    assert.isTrue(calls.every(value => value === 'aws_sqs'))
  }

  @Test()
  @Skip('PurgeQueue can only be called every 60 seconds.')
  public async shouldBeAbleToTruncateAllJobs({ assert }: Context) {
    const queue = Queue.connection('aws_sqs')

    await queue.add({ name: 'lenon' })

    await queue.truncate()

    const isEmpty = await queue.isEmpty()

    assert.isTrue(isEmpty)
  }
}
