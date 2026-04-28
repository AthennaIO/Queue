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
import { Otel, OtelProvider } from '@athenna/otel'
import { Log, LoggerProvider } from '@athenna/logger'
import { context, createContextKey } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { Test, type Context, BeforeEach, AfterEach, Mock } from '@athenna/test'
import { Database, DatabaseImpl, DatabaseProvider } from '@athenna/database'

export class DatabaseDriverTest {
  @BeforeEach()
  public async beforeEach() {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
    await Config.loadAll(Path.fixtures('config'))

    new OtelProvider().register()
    Otel.start()
    new DatabaseProvider().register()
    new QueueProvider().register()
    new LoggerProvider().register()

    await Database.createTable('jobs', builder => {
      builder.increments('id')
      builder.string('queue').notNullable().index()
      builder.string('data').notNullable()
      builder.tinyint('attempts').defaultTo(1).unsigned()
      builder.integer('availableAt').nullable().unsigned()
      builder.integer('reservedUntil').nullable().unsigned()
      builder.integer('createdAt').nullable().unsigned()
    })
  }

  @AfterEach()
  public async afterEach() {
    context.disable()

    await Database.dropTable('jobs')
    await Queue.closeAll()
    await new OtelProvider().shutdown()
    ioc.reconstruct()

    Config.clear()
    Mock.restoreAll()
  }

  @Test()
  public async shouldBeAbleToConnectToDriver({ assert }: Context) {
    Queue.connection('database')

    assert.isTrue(Queue.isConnected())
  }

  @Test()
  public async shouldBeAbleToCloseTheConnectionWithDriver({ assert }: Context) {
    const queue = Queue.connection('database')

    await queue.close()

    assert.isFalse(queue.isConnected())
  }

  @Test()
  public async shouldBeAbleToCloneTheQueueInstance({ assert }: Context) {
    const driver = Queue.connection('database').driver
    const otherDriver = driver.clone()

    driver.isConnected = false

    assert.isTrue(otherDriver.isConnected)
  }

  @Test()
  public async shouldBeAbleToGetDriverClient({ assert }: Context) {
    const client = Queue.connection('database').driver.getClient()

    assert.instanceOf(client, DatabaseImpl)
  }

  @Test()
  public async shouldBeAbleToSetDifferentClientForDriver({ assert }: Context) {
    const driver = Queue.connection('database').driver

    driver.setClient({} as any)

    assert.notInstanceOf(driver.client, DatabaseImpl)
  }

  @Test()
  public async shouldBeAbleToSeeHowManyJobsAreInsideTheQueue({ assert }: Context) {
    const length = await Queue.connection('database').length()

    assert.deepEqual(length, 0)
  }

  @Test()
  public async shouldBeAbleToAddJobsToTheQueue({ assert }: Context) {
    const queue = Queue.connection('database')

    await queue.add({ hello: 'world' })

    const length = await queue.length()
    const isEmpty = await queue.isEmpty()

    assert.isFalse(isEmpty)
    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldBeAbleToAddJobsToADifferentQueue({ assert }: Context) {
    const queue = Queue.connection('database')

    await queue.queue('other').add({ hello: 'world' })

    const length = await queue.length()
    const isEmpty = await queue.isEmpty()

    assert.isFalse(isEmpty)
    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldBeAbleToVerifyIfTheQueueIsEmpty({ assert }: Context) {
    const queue = Queue.connection('database')

    const isEmpty = await queue.isEmpty()

    assert.isTrue(isEmpty)
  }

  @Test()
  public async shouldBeAbleToPeekTheNextJobWithoutRemovingItFromTheQueue({ assert }: Context) {
    const queue = Queue.connection('database')

    await queue.add({ name: 'lenon' })

    const job = await queue.peek()
    const length = await queue.length()

    assert.deepEqual(length, 1)
    assert.containSubset(job, {
      attempts: 1,
      queue: 'default',
      data: { name: 'lenon' }
    })
  }

  @Test()
  public async shouldBeAbleToPopTheNextJobRemovingItFromTheQueue({ assert }: Context) {
    const queue = Queue.connection('database')

    await queue.add({ name: 'lenon' })

    const job = await queue.pop()
    const length = await queue.length()

    assert.deepEqual(length, 0)
    assert.containSubset(job, {
      attempts: 1,
      queue: 'default',
      data: { name: 'lenon' }
    })
  }

  @Test()
  public async shouldBeAbleToProcessTheNextJobFromTheQueueWithAProcessor({ assert }: Context) {
    const queue = Queue.connection('database')

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
    const queue = Queue.connection('database')

    await queue.add({ name: 'lenon' })

    await queue.process(async () => {
      throw new Error('testing')
    })

    const length = await queue.queue('deadletter').length()

    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldBeAbleToRetryTheJobIfBackoffIsConfiguredToQueue({ assert }: Context) {
    assert.plan(3)
    const queue = Queue.connection('databaseBackoff')

    await queue.add({ name: 'lenon' })

    await queue.process(async job => {
      assert.containSubset(job, {
        attempts: 1,
        data: { name: 'lenon' }
      })

      throw new Error('testing')
    })

    await Sleep.for(2000).milliseconds().wait()

    await queue.process(async job => {
      assert.containSubset(job, {
        attempts: 0,
        data: { name: 'lenon' }
      })

      throw new Error('testing')
    })

    const length = await queue.queue('deadletter').length()

    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldRunFallbackProcessorsInsideOtelContext({ assert }: Context) {
    const queue = Queue.connection('database')
    const connectionKey = createContextKey('database.driver.connection')
    const attemptsKey = createContextKey('database.driver.attempts')
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

    assert.equal(values.connection, 'database')
    assert.equal(values.attempts, 0)
  }

  @Test()
  public async shouldKeepOtelContextActiveDuringFallbackProcessorExceptionLogging({ assert }: Context) {
    const queue = Queue.connection('database')
    const connectionKey = createContextKey('database.driver.exception.connection')
    const attemptsKey = createContextKey('database.driver.exception.attempts')
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

    assert.equal(values.connection, 'database')
    assert.equal(values.attempts, 0)
  }

  @Test()
  public async shouldBeAbleToTruncateAllJobs({ assert }: Context) {
    const queue = Queue.connection('database')

    await queue.add({ name: 'lenon' })

    await queue.truncate()

    const isEmpty = await queue.isEmpty()

    assert.isTrue(isEmpty)
  }
}
