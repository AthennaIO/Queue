/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path, Sleep } from '@athenna/common'
import { LoggerProvider } from '@athenna/logger'
import { constants } from '#tests/fixtures/constants/index'
import { Queue, QueueProvider, WorkerProvider } from '#src'
import { Test, AfterEach, BeforeEach, type Context } from '@athenna/test'

export class WorkerProviderTest {
  public workerProvider: WorkerProvider = new WorkerProvider()

  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    new QueueProvider().register()
    new LoggerProvider().register()

    await this.workerProvider.boot()
  }

  @AfterEach()
  public async afterEach() {
    const productWorker = ioc.safeUse('App/Workers/ProductWorker')

    await productWorker.queue().truncate()
    await productWorker.queue().queue('products-deadletter').truncate()

    constants.PRODUCTS = []

    await this.workerProvider.shutdown()

    ioc.reconstruct()
    Config.clear()
  }

  @Test()
  public async shouldBeAbleToRegisterWorkersFromRcFile({ assert }: Context) {
    assert.isTrue(ioc.has('annotatedWorker'))
    assert.isTrue(ioc.has('App/Workers/HelloWorker'))
    assert.isTrue(ioc.has('App/Workers/ProductWorker'))

    assert.lengthOf(this.workerProvider.intervals, 3)
  }

  @Test()
  public async shouldBeAbleToProcessEventsOfQueueUsingWorker({ assert }: Context) {
    const productWorker = ioc.safeUse('App/Workers/ProductWorker')

    for (let i = 1; i <= 10; i++) {
      await productWorker.queue().add({ name: 'iPhone' + ' ' + i })
    }

    await Sleep.for(2).seconds().wait()

    assert.lengthOf(constants.PRODUCTS, 10)
    assert.deepEqual(constants.PRODUCTS[0], { name: 'iPhone 1' })
  }

  @Test()
  public async shouldBeAbleToRetryTheJobConfiguredInTheWorkerIfWorkerFailsToProcessIt({ assert }: Context) {
    const productWorker = ioc.safeUse('App/Workers/ProductWorker')

    await productWorker.queue().add({ name: 'iPhone 1', failOnFirstAttemptOnly: true })

    await Sleep.for(3).seconds().wait()

    const deadletterSize = await productWorker.queue().queue('products-deadletter').length()

    assert.lengthOf(constants.PRODUCTS, 1)
    assert.deepEqual(deadletterSize, 0)
    assert.deepEqual(constants.PRODUCTS[0], { name: 'iPhone 1', failOnFirstAttemptOnly: true })
  }

  @Test()
  public async shouldBeAbleToSendJobToDeadletterIfWorkerFailsToProcessItInAllAttempts({ assert }: Context) {
    const productWorker = ioc.safeUse('App/Workers/ProductWorker')

    await productWorker.queue().add({ name: 'iPhone 1', failOnAllAttempts: true })

    await Sleep.for(3).seconds().wait()

    const jobInDeadletter = await Queue.connection('vanilla').queue('products-deadletter').peek()

    assert.containSubset(jobInDeadletter, {
      attemptsLeft: 0,
      status: 'pending',
      queue: 'products-deadletter',
      formerQueue: 'products',
      data: { name: 'iPhone 1', failOnAllAttempts: true }
    })
  }
}
