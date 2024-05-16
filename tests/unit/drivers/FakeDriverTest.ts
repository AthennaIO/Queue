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
import { Test, type Context, Mock, BeforeEach, AfterEach } from '@athenna/test'

export class FakeDriverTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    new QueueProvider().register()
    new LoggerProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    await Queue.closeAll()
    ioc.reconstruct()

    Config.clear()
    Mock.restoreAll()
  }

  @Test()
  public async shouldBeAbleToConnectToDriver({ assert }: Context) {
    Queue.connection('fake')

    assert.isTrue(Queue.isConnected())
  }

  @Test()
  public async shouldBeAbleToCloseTheConnectionWithDriver({ assert }: Context) {
    const queue = Queue.connection('fake')

    await queue.close()

    assert.isFalse(queue.isConnected())
  }

  @Test()
  public async shouldBeAbleToCloneTheQueueInstance({ assert }: Context) {
    const driver = Queue.connection('fake').driver
    const otherDriver = driver.clone()

    driver.isConnected = false

    assert.isTrue(otherDriver.isConnected)
  }

  @Test()
  public async shouldBeAbleToGetDriverClient({ assert }: Context) {
    const client = Queue.connection('fake').driver.getClient()

    assert.isDefined(client)
  }

  @Test()
  public async shouldBeAbleToSetDifferentClientForDriver({ assert }: Context) {
    const driver = Queue.connection('fake').driver

    driver.setClient({ hello: 'world' } as any)

    assert.deepEqual(driver.client, { hello: 'world' })
  }

  @Test()
  public async shouldBeAbleToSeeHowManyJobsAreInsideTheQueue({ assert }: Context) {
    const length = await Queue.connection('fake').length()

    assert.deepEqual(length, 0)
  }

  @Test()
  public async shouldBeAbleToAddJobsToTheQueue({ assert }: Context) {
    const queue = Queue.connection('fake')

    Mock.when(queue.driver, 'length').resolve(1)
    Mock.when(queue.driver, 'isEmpty').resolve(false)

    await queue.add({ hello: 'world' })

    const length = await queue.length()
    const isEmpty = await queue.isEmpty()

    assert.isFalse(isEmpty)
    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldBeAbleToAddJobsToADifferentQueue({ assert }: Context) {
    const queue = Queue.connection('fake')

    Mock.when(queue.driver, 'length').resolve(1)
    Mock.when(queue.driver, 'isEmpty').resolve(false)

    await queue.queue('other').add({ hello: 'world' })

    const length = await queue.length()
    const isEmpty = await queue.isEmpty()

    assert.isFalse(isEmpty)
    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldBeAbleToVerifyIfTheQueueIsEmpty({ assert }: Context) {
    const queue = Queue.connection('fake')

    const isEmpty = await queue.isEmpty()

    assert.isTrue(isEmpty)
  }

  @Test()
  public async shouldBeAbleToPeekTheNextJobWithoutRemovingItFromTheQueue({ assert }: Context) {
    const queue = Queue.connection('fake')

    Mock.when(queue.driver, 'peek').resolve({ name: 'lenon' })
    Mock.when(queue.driver, 'length').resolve(1)

    await queue.add({ name: 'lenon' })

    const job = await queue.peek()
    const length = await queue.length()

    assert.deepEqual(job, { name: 'lenon' })
    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldBeAbleToPopTheNextJobRemovingItFromTheQueue({ assert }: Context) {
    const queue = Queue.connection('fake')

    Mock.when(queue.driver, 'pop').resolve({ name: 'lenon' })
    Mock.when(queue.driver, 'length').resolve(0)

    await queue.add({ name: 'lenon' })

    const job = await queue.pop()
    const length = await queue.length()

    assert.deepEqual(job, { name: 'lenon' })
    assert.deepEqual(length, 0)
  }

  @Test()
  public async shouldBeAbleToProcessTheNextJobFromTheQueueWithAProcessor({ assert }: Context) {
    assert.plan(2)

    const queue = Queue.connection('fake')

    Mock.when(queue.driver, 'pop').resolve({ name: 'lenon' })
    Mock.when(queue.driver, 'length').resolve(0)

    await queue.add({ name: 'lenon' })

    await queue.process(async job => {
      const length = await queue.length()

      assert.deepEqual(job, { name: 'lenon' })
      assert.deepEqual(length, 0)
    })
  }

  @Test()
  public async shouldBeAbleToSendTheJobToDeadletterQueueIfProcessorFails({ assert }: Context) {
    const queue = Queue.connection('fake')

    Mock.when(queue.driver, 'pop').resolve({ name: 'lenon' })
    Mock.when(queue.driver, 'length').resolve(1)

    await queue.add({ name: 'lenon' })

    await queue.process(async () => {
      throw new Error('testing')
    })

    const length = await queue.queue('deadletter').length()

    assert.deepEqual(length, 1)
  }

  @Test()
  public async shouldBeAbleToTruncateAllJobs({ assert }: Context) {
    const queue = Queue.connection('fake')

    Mock.when(queue.driver, 'isEmpty').resolve(true)

    await queue.truncate()

    const isEmpty = await queue.isEmpty()

    assert.isTrue(isEmpty)
  }
}
