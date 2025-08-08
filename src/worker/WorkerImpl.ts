/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { WorkerTaskBuilder } from '#src/worker/WorkerTaskBuilder'
import { NotFoundWorkerTaskException } from '#src/exceptions/NotFoundWorkerTaskException'

export class WorkerImpl {
  public static loggerIsSet = false
  public static rTracerPlugin: any
  public static tasks: WorkerTaskBuilder[] = []

  /**
   * Create a new worker task.
   *
   * @example
   * ```ts
   * Worker.task().name('my_worker')
   *   .connection('memory')
   *   .handler((ctx) => console.log(`worker ${ctx.name} is running`))
   *   .start()
   * ```
   */
  public task() {
    return new WorkerTaskBuilder()
  }

  /**
   * Set if the worker logger should be set or not.
   *
   * @example
   * ```ts
   * Worker.setLogger(true)
   * ```
   */
  public setLogger(isToSetLogger: boolean) {
    WorkerImpl.loggerIsSet = isToSetLogger

    return this
  }

  /**
   * Set if the rTracer plugin should be set or not.
   *
   * @example
   * ```ts
   * Worker.setRTracerPlugin(true)
   * ```
   */
  public setRTracerPlugin(rTracerPlugin: any) {
    WorkerImpl.rTracerPlugin = rTracerPlugin

    return this
  }

  /**
   * Returns a map with all worker tasks that has been registered.
   *
   * @example
   * ```ts
   * const tasks = Worker.getWorkerTasks()
   *
   * tasks.map(task => task.stop())
   * ```
   */
  public getWorkerTasks(): WorkerTaskBuilder[] {
    return WorkerImpl.tasks
  }

  /**
   * Get a worker task by name.
   *
   * @example
   * ```ts
   * const task = Worker.getWorkerTaskByName('my_worker')
   * ```
   */
  public getWorkerTaskByName(name: string): WorkerTaskBuilder | undefined {
    return WorkerImpl.tasks.find(task => task.worker.name === name)
  }

  /**
   * Start all worker tasks.
   *
   * @example
   * ```ts
   * Worker.start()
   * ```
   */
  public start() {
    const workerTasks = this.getWorkerTasks()

    workerTasks.forEach(workerTask => workerTask.start())

    return this
  }

  /**
   * Close all worker tasks.
   *
   * @example
   * ```ts
   * Worker.close()
   * ```
   */
  public close() {
    const workerTasks = this.getWorkerTasks()

    workerTasks.forEach(workerTask => workerTask.stop())

    return this
  }

  /**
   * Force run a worker task by name.
   *
   * @example
   * ```ts
   * Worker.runByName('my_worker')
   * ```
   */
  public async runByName(name: string) {
    const workerTask = WorkerImpl.tasks.find(task => task.worker.name === name)

    if (!workerTask) {
      throw new NotFoundWorkerTaskException(name)
    }

    await workerTask.run()
  }

  /**
   * Start a worker task by name.
   *
   * @example
   * ```ts
   * Worker.startTaskByName('my_worker')
   * ```
   */
  public startTaskByName(name: string) {
    const workerTask = WorkerImpl.tasks.find(task => task.worker.name === name)

    if (!workerTask) {
      throw new NotFoundWorkerTaskException(name)
    }

    workerTask.start()

    return this
  }

  /**
   * Close a worker task by name.
   *
   * @example
   * ```ts
   * Worker.closeTaskByName('my_worker')
   * ```
   */
  public closeTaskByName(name: string) {
    const workerTask = WorkerImpl.tasks.find(task => task.worker.name === name)

    if (!workerTask) {
      throw new NotFoundWorkerTaskException(name)
    }

    workerTask.stop()

    return this
  }

  /**
   * Delete all worker tasks.
   *
   * @example
   * ```ts
   * Worker.truncate()
   * ```
   */
  public truncate() {
    const workerTasks = this.getWorkerTasks()

    workerTasks.forEach(workerTask => workerTask.stop())

    WorkerImpl.tasks = []

    return this
  }
}
