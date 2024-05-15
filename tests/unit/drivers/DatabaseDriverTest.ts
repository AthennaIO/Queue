/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path } from '@athenna/common'
import { Queue, QueueProvider } from '#src'
import { LoggerProvider } from '@athenna/logger'
import { Test, type Context, BeforeEach, AfterEach } from '@athenna/test'
import { Database, DatabaseProvider } from '@athenna/database'

export class DatabaseDriverTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    new DatabaseProvider().register()
    new QueueProvider().register()
    new LoggerProvider().register()

    await Database.createTable('jobs', builder => {
      builder.increments('id')
      builder.string('queue').notNullable()
      builder.string('formerQueue').nullable()
      builder.string('data').notNullable()
      builder.timestamps(true, true, true)
    })
  }

  @AfterEach()
  public async afterEach() {
    await Database.dropTable('jobs')
    await Queue.closeAll()
    ioc.reconstruct()

    Config.clear()
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

    assert.deepEqual(job, { name: 'lenon' })
    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldBeAbleToPopTheNextJobRemovingItFromTheQueue({ assert }: Context) {
    const queue = Queue.connection('database')

    await queue.add({ name: 'lenon' })

    const job = await queue.pop()
    const length = await queue.length()

    assert.deepEqual(job, { name: 'lenon' })
    assert.deepEqual(length, 0)
  }

  @Test()
  public async shouldBeAbleToProcessTheNextJobFromTheQueueWithAProcessor({ assert }: Context) {
    assert.plan(2)

    const queue = Queue.connection('database')

    await queue.add({ name: 'lenon' })

    await queue.process(async job => {
      const length = await queue.length()

      assert.deepEqual(job, { name: 'lenon' })
      assert.deepEqual(length, 0)
    })
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
}
