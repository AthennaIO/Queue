/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Is } from '@athenna/common'
import { Log } from '@athenna/logger'
import { Queue } from '#src/facades/Queue'
import { WorkerImpl } from '#src/worker/WorkerImpl'
import type { Context, ConnectionOptions } from '#src/types'
import type { WorkerHandler } from '#src/types/WorkerHandler'

export class WorkerTaskBuilder {
  public worker: {
    /**
     * The name of the worker task.
     */
    name?: string

    /**
     * The queue connection of the worker task.
     */
    connection?: string

    /**
     * The interval instance of the worker task.
     */
    interval?: NodeJS.Timeout

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

    /**
     * Define if the worker task is running.
     */
    isRunning?: boolean
  } = {}

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
    const getCtx = (job: any) => ({
      name: this.worker.name,
      traceId: WorkerImpl.rTracerPlugin ? WorkerImpl.rTracerPlugin.id() : null,
      connection: this.worker.connection,
      options: this.worker.options,
      job
    })

    const logIfEnabled = (ctx: any) => {
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

    this.worker.handler = async (job: any) => {
      if (WorkerImpl.rTracerPlugin) {
        return WorkerImpl.rTracerPlugin.runWithId(async (job: any) => {
          const ctx = getCtx(job)

          await handler(ctx)

          logIfEnabled(ctx)
        })
      }

      const ctx = getCtx(job)

      await handler(ctx)

      logIfEnabled(ctx)
    }

    const task = WorkerImpl.tasks.find(
      task => task.worker.name === this.worker.name
    )

    if (task) {
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
   * new WorkerTaskBuilder().connection('vanilla')
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
   *   .connection('vanilla')
   *   .handler((ctx) => console.log(`worker ${ctx.name} is running`))
   *   .run()
   * ```
   */
  public async run() {
    const queue = Queue.connection(this.worker.connection, {
      options: this.worker.options
    })

    await queue.process(this.worker.handler)
  }

  /**
   * Start the worker task.
   *
   * @example
   * ```ts
   * new WorkerTaskBuilder()
   *   .name('my_worker')
   *   .connection('vanilla')
   *   .handler((ctx) => console.log(`worker ${ctx.name} is running`))
   *   .start()
   * ```
   */
  public start() {
    if (!this.worker.isRegistered) {
      return
    }

    const intervalToRun =
      this.worker.options?.workerInterval ||
      Config.get(
        `queue.connections.${this.worker.connection}.workerInterval`,
        1000
      )

    const initialOffset = this.computeInitialOffset(intervalToRun)

    this.worker.interval = setTimeout(async () => {
      if (!this.worker.isRunning) {
        this.worker.isRunning = true

        await this.run()
        this.worker.isRunning = false
      }

      this.scheduleNext(intervalToRun)
    }, initialOffset)
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

    if (!this.worker.interval) {
      return
    }

    this.worker.isRegistered = false
    this.worker.isRunning = false

    if (this.worker.interval) {
      clearTimeout(this.worker.interval)
      this.worker.interval = undefined
    }
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

  /**
   * Schedule the next worker task.
   */
  private scheduleNext(baseMs: number) {
    if (!this.worker.isRegistered) {
      return
    }

    const delay = baseMs + this.computeJitter(baseMs)

    this.worker.interval = setTimeout(async () => {
      if (this.worker.isRunning) {
        return this.scheduleNext(baseMs)
      }

      this.worker.isRunning = true

      await this.run()

      this.worker.isRunning = false

      this.scheduleNext(baseMs)
    }, delay)
  }
}
