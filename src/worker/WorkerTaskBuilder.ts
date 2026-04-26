/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Log } from '@athenna/logger'
import { Queue } from '#src/facades/Queue'
import { Is, Parser } from '@athenna/common'
import { WorkerImpl } from '#src/worker/WorkerImpl'
import type { Context, ConnectionOptions } from '#src/types'
import type { WorkerHandler } from '#src/types/WorkerHandler'
import { RUN_WITH_WORKER_CONTEXT } from '#src/drivers/Driver'
import { QueueExecutionScope } from '#src/worker/QueueExecutionScope'
import { WorkerTimeoutException } from '#src/exceptions/WorkerTimeoutException'

export class WorkerTaskBuilder {
  public worker: {
    /**
     * The name of the worker task.
     */
    name?: string

    /**
     * Define the maximum number of concurrent processes of the same worker.
     */
    concurrency?: number

    /**
     * The queue connection of the worker task.
     */
    connection?: string

    /**
     * Define if the worker task is registered.
     */
    isRegistered?: boolean

    /**
     * The custom options of the worker task.
     */
    options?: ConnectionOptions['options']

    /**
     * The handler of the worker task.
     */
    handler?: (ctx: Context) => any | Promise<any>
  } = {}

  private timers: NodeJS.Timeout[] = []
  private rawHandler?: WorkerHandler

  public constructor() {
    this.worker.connection = Config.get('queue.default')
  }

  /**
   * Set the name of the worker task.
   *
   * @example
   * ```ts
   * new WorkerTaskBuilder().name('my_worker_task')
   * ```
   */
  public name(name: string) {
    this.worker.name = name

    return this
  }

  /**
   * Set the max number of concurrent worker tasks.
   *
   * @example
   * ```ts
   * new WorkerTaskBuilder().name('my_worker_task').concurrency(5)
   * ```
   */
  public concurrency(concurrency: number) {
    this.worker.concurrency = concurrency

    return this
  }

  /**
   * Set the handler of the worker task.
   *
   * @example
   * ```ts
   * new WorkerTaskBuilder()
   *   .name('my_worker')
   *   .handler((ctx) => {
   *     console.log(ctx)
   *   })
   *   .start()
   * ```
   */
  public handler(handler: WorkerHandler) {
    this.rawHandler = handler

    this.worker.handler = async ctx => {
      return new QueueExecutionScope(ctx, {
        rTracerPlugin: WorkerImpl.rTracerPlugin
      }).run(() => this.executeHandler(ctx))
    }

    const task = WorkerImpl.tasks.find(
      task => task.worker.name === this.worker.name
    )

    if (task) {
      task.rawHandler = this.rawHandler
      task.worker.isRegistered = true
      task.worker.handler = this.worker.handler

      return this
    }

    this.worker.isRegistered = true

    WorkerImpl.tasks.push(this)

    return this
  }

  /**
   * Set the custom options of the worker task.
   *
   * @example
   * ```ts
   * new WorkerTaskBuilder().options({ queue: 'my_queue_name' })
   * ```
   */
  public options(options: ConnectionOptions['options']) {
    this.worker.options = options

    return this
  }

  /**
   * Set the connection of the worker task.
   *
   * @example
   * ```ts
   * new WorkerTaskBuilder().connection('memory')
   * ```
   */
  public connection(connection: string) {
    this.worker.connection = connection

    return this
  }

  /**
   * Force run the worker task.
   *
   * @example
   * ```ts
   * new WorkerTaskBuilder()
   *   .name('my_worker')
   *   .connection('memory')
   *   .handler((ctx) => console.log(`worker ${ctx.name} is running`))
   *   .run()
   * ```
   */
  public async run() {
    const queue = Queue.connection(this.worker.connection, {
      options: this.worker.options
    })

    const processor = this.createScopedProcessor()

    await queue.process(processor)
  }

  /**
   * Start the worker task.
   *
   * @example
   * ```ts
   * new WorkerTaskBuilder()
   *   .name('my_worker')
   *   .connection('memory')
   *   .handler((ctx) => console.log(`worker ${ctx.name} is running`))
   *   .start()
   * ```
   */
  public start() {
    if (!this.worker.isRegistered) {
      return
    }

    if (this.timers.length) {
      return
    }

    const n = this.worker.concurrency ?? 1

    for (let i = 0; i < n; i++) {
      this.spawn()
    }
  }

  /**
   * Use spawn to force a worker instance to run.
   */
  private spawn() {
    const intervalToRun =
      this.worker.options?.workerInterval ||
      Config.get(
        `queue.connections.${this.worker.connection}.workerInterval`,
        1000
      )

    const timeoutMs =
      this.worker.options?.workerTimeoutMs ??
      Config.get(
        `queue.connections.${this.worker.connection}.workerTimeoutMs`,
        Parser.timeToMs('5m')
      )

    const initialOffset = this.computeInitialOffset(intervalToRun)

    const loop = async () => {
      if (!this.worker.isRegistered) {
        return
      }

      try {
        await Promise.race([
          this.run(),
          new Promise((resolve, reject) =>
            setTimeout(
              () => reject(new WorkerTimeoutException(this.worker.name)),
              timeoutMs
            )
          )
        ])
      } catch (err) {
        Log.channelOrVanilla('exception').error(err)
      } finally {
        const delay = intervalToRun + this.computeJitter(intervalToRun)

        this.timers.push(setTimeout(loop, delay))
      }
    }

    this.timers.push(setTimeout(loop, initialOffset))
  }

  /**
   * Stop the worker task.
   *
   * @example
   * ```ts
   * new WorkerTaskBuilder().stop()
   * ```
   */
  public stop() {
    if (!this.worker.isRegistered) {
      return
    }

    this.worker.isRegistered = false

    this.timers.forEach(t => clearTimeout(t))

    this.timers = []
  }

  /**
   * Create the hash code of the worker task.
   */
  private hashCode(s: string) {
    let h = 0

    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0

    return Math.abs(h)
  }

  /**
   * Compute the initial offset of the worker task.
   */
  private computeInitialOffset(baseMs: number) {
    const configured =
      this.worker.options?.workerInitialOffsetMs ??
      Config.get(
        `queue.connections.${this.worker.connection}.workerInitialOffsetMs`,
        null
      )

    if (Is.Number(configured)) {
      return Math.max(0, configured)
    }

    const seed = `${this.worker.name}|${this.worker.connection}|${process.pid}`

    return this.hashCode(seed) % Math.max(1, baseMs)
  }

  /**
   * Compute the jitter of the worker task.
   */
  private computeJitter(baseMs: number) {
    const maxDefault = Math.min(250, Math.floor(baseMs / 2))
    const max =
      this.worker.options?.workerJitterMaxMs ??
      Config.get(
        `queue.connections.${this.worker.connection}.workerJitterMaxMs`,
        maxDefault
      )

    if (!max || max <= 0) {
      return 0
    }

    return Math.floor(Math.random() * (max + 1))
  }

  private createScopedProcessor(): (data: unknown) => any | Promise<any> {
    let currentCtx: Context | null = null

    const processor: (data: unknown) => any | Promise<any> = async job => {
      const ctx = currentCtx || this.createContext(job as Context['job'])

      return this.executeHandler(ctx)
    }

    processor[RUN_WITH_WORKER_CONTEXT] = async (
      job,
      callback,
      captureScope
    ) => {
      const ctx = this.createContext(job)
      const scope = new QueueExecutionScope(ctx, {
        beforeRun: () => {
          currentCtx = ctx
        },
        afterRun: () => {
          currentCtx = null
        },
        rTracerPlugin: WorkerImpl.rTracerPlugin
      })

      captureScope?.(scope)

      return scope.run(callback)
    }

    return processor
  }

  private createContext(job: Context['job']): Context {
    return {
      name: this.worker.name,
      traceId: null,
      connection: this.worker.connection,
      options: this.worker.options,
      job
    }
  }

  private async executeHandler(ctx: Context) {
    await this.rawHandler(ctx)

    this.logIfEnabled(ctx)
  }

  private logIfEnabled(ctx: any) {
    if (WorkerImpl.loggerIsSet) {
      const channel = Config.get('worker.logger.channel', 'worker')
      const isToLogRequest = Config.get('worker.logger.isToLogRequest')

      if (!isToLogRequest) {
        return Log.channelOrVanilla(channel).info(ctx)
      }

      if (isToLogRequest(ctx)) {
        return Log.channelOrVanilla(channel).info(ctx)
      }
    }
  }
}
