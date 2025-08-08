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
import { LoggerProvider } from '@athenna/logger'
import { BaseTest } from '#tests/helpers/BaseTest'
import { Queue, QueueProvider, WorkerProvider } from '#src'
import { Test, type Context, BeforeEach, AfterEach, Skip } from '@athenna/test'

export class AwsSqsDriverTest extends BaseTest {
  @BeforeEach()
  public async beforeEach() {
    EnvHelper.resolveFilePath(Path.pwd('.env'))
    await Config.loadAll(Path.fixtures('config'))

    new QueueProvider().register()
    new WorkerProvider().register()
    new LoggerProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    await Queue.closeAll()

    Queue.worker().close()

    ioc.reconstruct()

    Config.clear()
  }

  @Test()
  public async shouldBeAbleToConnectToDriver({ assert }: Context) {
    Queue.connection('awsSqs')

    assert.isTrue(Queue.isConnected())
  }

  @Test()
  public async shouldBeAbleToCloseTheConnectionWithDriver({ assert }: Context) {
    const queue = Queue.connection('awsSqs')

    await queue.close()

    assert.isFalse(queue.isConnected())
  }

  @Test()
  public async shouldBeAbleToCloneTheQueueInstance({ assert }: Context) {
    const driver = Queue.connection('awsSqs').driver
    const otherDriver = driver.clone()

    driver.isConnected = false

    assert.isTrue(otherDriver.isConnected)
  }

  @Test()
  public async shouldBeAbleToGetDriverClient({ assert }: Context) {
    const client = Queue.connection('awsSqs').driver.getClient()

    assert.isDefined(client)
  }

  @Test()
  public async shouldBeAbleToSetDifferentClientForDriver({ assert }: Context) {
    const driver = Queue.connection('awsSqs').driver

    driver.setClient({ hello: 'world' } as any)

    assert.deepEqual(driver.client, { hello: 'world' })
  }

  @Test()
  public async shouldBeAbleToSeeHowManyJobsAreInsideTheQueue({ assert }: Context) {
    const length = await Queue.connection('awsSqs').length()

    assert.isTrue(Is.Number(length))
  }

  @Test()
  public async shouldBeAbleToAddJobsToTheQueue({ assert }: Context) {
    const queue = Queue.connection('awsSqs')

    await queue.add({ hello: 'world' })

    const isEmpty = await queue.isEmpty()

    assert.isFalse(isEmpty)
  }

  @Test()
  public async shouldBeAbleToVerifyIfTheQueueIsEmpty({ assert }: Context) {
    const queue = Queue.connection('awsSqs')

    const isEmpty = await queue.isEmpty()

    assert.isTrue(Is.Boolean(isEmpty))
  }

  @Test()
  @Skip('Peek is not supported in SQS.')
  public async shouldBeAbleToPeekTheNextJobWithoutRemovingItFromTheQueue({ assert }: Context) {
    const queue = Queue.connection('awsSqs')

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
    const queue = Queue.connection('awsSqs')

    await queue.add({ name: 'lenon' })

    const job = await queue.pop()

    assert.containSubset(job, {
      data: { name: 'lenon' }
    })
  }

  @Test()
  public async shouldBeAbleToProcessTheNextJobFromTheQueueWithAProcessor({ assert }: Context) {
    assert.plan(1)

    const queue = Queue.connection('awsSqs')

    await queue.add({ name: 'lenon' })

    await queue.process(async job => {
      assert.containSubset(job, {
        attempts: 1,
        queue: 'default',
        data: { name: 'lenon' }
      })
    })
  }

  @Test()
  public async shouldBeAbleToSendTheJobToDeadletterQueueIfProcessorFails({ assert }: Context) {
    const queue = Queue.connection('awsSqs')

    await queue.add({ name: 'lenon' })

    await queue.process(async () => {
      throw new Error('testing')
    })

    const isEmpty = await queue.queue(Config.get('queue.connections.awsSqs.deadletter')).isEmpty()

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

    const isEmpty = await queue.queue(Config.get('queue.connections.awsSqs.deadletter')).isEmpty()

    assert.isFalse(isEmpty)
  }

  @Test()
  @Skip('PurgeQueue can only be called every 60 seconds.')
  public async shouldBeAbleToTruncateAllJobs({ assert }: Context) {
    const queue = Queue.connection('awsSqs')

    await queue.add({ name: 'lenon' })

    await queue.truncate()

    const isEmpty = await queue.isEmpty()

    assert.isTrue(isEmpty)
  }
}
