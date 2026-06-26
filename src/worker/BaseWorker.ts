/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import 'reflect-metadata'

import { Queue } from '#src/facades/Queue'
import { Annotation } from '@athenna/ioc'
import type { QueueImpl } from '#src/queue/QueueImpl'

/**
 * Base class for workers. Extend it to get a queue instance already bound to
 * the worker's own connection, so you don't need to call `Queue.connection()`
 * on every operation.
 *
 * @example
 * ```ts
 * @Worker()
 * export class HelloWorker extends BaseWorker {
 *   public async handle(ctx: Context) {
 *     await this.queue.add({ hello: 'world' })
 *   }
 * }
 * ```
 */
export class BaseWorker {
  /**
   * Cached queue instance bound to this worker's connection.
   */
  private _queue?: QueueImpl

  /**
   * The queue connection name of this worker. It is resolved from the
   * worker's `@Worker({ connection })` metadata, falling back to the default
   * connection (`queue.default`) when the worker is not annotated.
   */
  public get connection() {
    const meta = Annotation.getMeta(this.constructor)

    return meta?.connection ?? Config.get('queue.default')
  }

  /**
   * A queue instance already bound to this worker's connection. Use it to
   * enqueue or inspect jobs without calling `Queue.connection(...)` on every
   * operation.
   *
   * @example
   * ```ts
   * await this.queue.add({ email: 'lenon@athenna.io' })
   * ```
   */
  public get queue() {
    if (!this._queue) {
      this._queue = Queue.connection(this.connection)
    }

    return this._queue
  }
}
