/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path } from '@athenna/common'
import { Config } from '@athenna/config'
import { Queue, QueueProvider, WorkerProvider } from '#src'
import { Test, Mock, BeforeEach, AfterEach, type Context } from '@athenna/test'

export class WorkerProviderTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))
  }

  @AfterEach()
  public async afterEach() {
    Mock.restoreAll()
    ioc.reconstruct()
    Config.clear()
  }

  @Test()
  public async shouldBeAbleToRegisterWorkerImplementationInTheContainer({ assert }: Context) {
    new WorkerProvider().register()

    assert.isTrue(ioc.has('Athenna/Core/Worker'))
  }

  @Test()
  public async shouldBeAbleToUseWorkerImplementationFromFacade({ assert }: Context) {
    new QueueProvider().register()
    new WorkerProvider().register()

    assert.deepEqual(Queue.worker().facadeAccessor, 'Athenna/Core/Worker')
  }

  @Test()
  public async shouldBeAbleToShutdownOpenWorkers({ assert }: Context) {
    new QueueProvider().register()
    new WorkerProvider().register()

    new QueueProvider().shutdown()
    new WorkerProvider().shutdown()

    assert.isTrue(
      Queue.worker()
        .getWorkerTasks()
        .every(worker => worker.worker.isRegistered === false)
    )
  }

  @Test()
  public async shouldNotThrowErrorIfProviderIsNotRegisteredWhenShuttingDown({ assert }: Context) {
    await assert.doesNotReject(() => new WorkerProvider().shutdown())
  }
}
