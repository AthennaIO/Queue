/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Exec, Path } from '@athenna/common'
import { LoggerProvider } from '@athenna/logger'
import { QueueProvider, WorkerProvider } from '#src'
import { PRODUCTS } from '#tests/fixtures/constants/products'
import { Test, AfterEach, BeforeEach, type Context } from '@athenna/test'

export class WorkerProviderTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    new QueueProvider().register()
    new LoggerProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    ioc.reconstruct()
    Config.clear()
  }

  @Test()
  public async shouldBeAbleToRegisterWorkersFromRcFile({ assert }: Context) {
    const workerProvider = new WorkerProvider()

    await workerProvider.boot()

    assert.isTrue(ioc.has('annotatedWorker'))
    assert.isTrue(ioc.has('App/Workers/HelloWorker'))
    assert.isTrue(ioc.has('App/Workers/ProductWorker'))

    assert.lengthOf(workerProvider.intervals, 3)

    await workerProvider.shutdown()
  }

  @Test()
  public async shouldBeAbleToProcessEventsOfQueueUsingWorker({ assert }: Context) {
    const workerProvider = new WorkerProvider()

    await workerProvider.boot()

    const productWorker = ioc.safeUse('App/Workers/ProductWorker')

    for (let i = 1; i <= 10; i++) {
      await productWorker.queue().add({ name: 'iPhone' + ' ' + i })
    }

    await Exec.sleep(2000)

    assert.lengthOf(PRODUCTS, 10)
    assert.deepEqual(PRODUCTS[0], { name: 'iPhone 1' })

    await workerProvider.shutdown()
  }
}
