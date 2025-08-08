/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Queue } from '#src'
import { Path, Sleep } from '@athenna/common'
import { LoggerProvider } from '@athenna/logger'
import { WorkerImpl } from '#src/worker/WorkerImpl'
import { QueueProvider } from '#src/providers/QueueProvider'
import { WorkerProvider } from '#src/providers/WorkerProvider'
import { Test, BeforeEach, AfterEach, type Context } from '@athenna/test'
import { NotFoundWorkerTaskException } from '#src/exceptions/NotFoundWorkerTaskException'

export class WorkerImplTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    new LoggerProvider().register()
    new QueueProvider().register()
    new WorkerProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    WorkerImpl.loggerIsSet = false
    WorkerImpl.rTracerPlugin = undefined

    await new QueueProvider().shutdown()
    await new WorkerProvider().shutdown()

    ioc.reconstruct()
    Config.clear()
  }

  @Test()
  public async shouldBeAbleToCreateAWorkerTask({ assert }: Context) {
    let hasRun = false

    await Queue.add({ test: 1 })

    Queue.worker()
      .task()
      .name('test')
      .handler(() => (hasRun = true))
      .start()

    await Sleep.for(1500).milliseconds().wait()

    assert.isTrue(hasRun)
  }

  @Test()
  public async shouldBeAbleToGetWorkerTaskByName({ assert }: Context) {
    Queue.worker()
      .task()
      .name('getByName')
      .handler(() => {})

    const task = Queue.worker().getWorkerTaskByName('getByName')

    assert.isDefined(task)
  }

  @Test()
  public async shouldBeAbleToListAllWorkerTasks({ assert }: Context) {
    Queue.worker()
      .task()
      .name('listAll')
      .handler(() => {})

    const tasks = Queue.worker().getWorkerTasks()

    assert.isTrue(tasks.length >= 1)
  }

  @Test()
  public async shouldBeAbleToStopAllWorkerTasks({ assert }: Context) {
    let hasRun = false

    Queue.worker()
      .task()
      .name('stopAll')
      .handler(() => (hasRun = true))
      .start()

    const task = Queue.worker().getWorkerTaskByName('stopAll')

    assert.isTrue(task?.worker.isRegistered)

    Queue.worker().close()

    assert.isFalse(hasRun)
  }

  @Test()
  public async shouldBeAbleToCreateAWorkerTaskWithName({ assert }: Context) {
    Queue.worker()
      .task()
      .name('myTask')
      .handler(() => {})
      .start()

    const task = Queue.worker().getWorkerTaskByName('myTask')

    assert.isDefined(task)
  }

  @Test()
  public async shouldBeAbleToManuallyRunAWorkerTaskByName({ assert }: Context) {
    let hasRun = false

    await Queue.add({ test: 1 })

    Queue.worker()
      .task()
      .name('manual_run')
      .handler(() => (hasRun = true))

    await Queue.worker().runByName('manual_run')

    assert.isTrue(hasRun)
  }

  @Test()
  public async shouldThrowNotFoundWorkerTaskExceptionIfTryingToManuallyRunAWorkerThatDoesNotExist({ assert }: Context) {
    await assert.rejects(() => Queue.worker().runByName('not_found'), NotFoundWorkerTaskException)
  }

  @Test()
  public async shouldBeAbleToStartAWorkerTaskByName({ assert }: Context) {
    let hasRun = false

    await Queue.add({ test: 1 })

    Queue.worker()
      .task()
      .name('manual_run')
      .handler(() => (hasRun = true))

    Queue.worker().startTaskByName('manual_run')

    await Sleep.for(1500).milliseconds().wait()

    assert.isTrue(hasRun)
  }

  @Test()
  public async shouldThrowNotFoundWorkerTaskExceptionIfTryingToStartAWorkerThatDoesNotExist({ assert }: Context) {
    await assert.rejects(() => Queue.worker().startTaskByName('not_found'), NotFoundWorkerTaskException)
  }

  @Test()
  public async shouldBeAbleToCreateAWorkerTaskWithCustomConnection({ assert }: Context) {
    Queue.worker()
      .task()
      .name('custom_connection')
      .connection('fake')
      .handler(() => {})

    const task = Queue.worker().getWorkerTaskByName('custom_connection')

    assert.deepEqual(task?.worker.connection, 'fake')
  }

  @Test()
  public async shouldBeAbleToCreateAWorkerTaskWithCustomOptions({ assert }: Context) {
    Queue.worker()
      .task()
      .name('custom_options')
      .options({
        workerInterval: 1000,
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 100,
          jitter: 0.5
        }
      })
      .handler(() => {})

    const task = Queue.worker().getWorkerTaskByName('custom_options')

    assert.deepEqual(task.worker.options.workerInterval, 1000)
    assert.deepEqual(task.worker.options.attempts, 2)
    assert.deepEqual(task.worker.options.backoff.type, 'fixed')
    assert.deepEqual(task.worker.options.backoff.delay, 100)
    assert.deepEqual(task.worker.options.backoff.jitter, 0.5)
  }

  @Test()
  public async shouldBeAbleToOverwriteSchedulersIfUsingSameName({ assert }: Context) {
    let value = -1

    await Queue.add({ test: 1 })

    await Queue.worker()
      .task()
      .name('overwriteScheduler')
      .handler(() => (value = 0))
      .run()

    await Queue.add({ test: 1 })

    await Queue.worker()
      .task()
      .name('overwriteScheduler')
      .handler(() => (value = 1))
      .run()

    const tasks = Queue.worker()
      .getWorkerTasks()
      .filter(task => task.worker.name === 'overwriteScheduler')

    assert.lengthOf(tasks, 1)
    assert.deepEqual(value, 1)
  }
}
