/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Queue } from '#src/facades/Queue'

export class BaseWorker {
  /**
   * Define the connection queue that is going to be
   * used by your worker class to process the data from
   * your queue.
   *
   * @default Config.get('queue.default')
   */
  public static connection() {
    return Config.get('queue.default')
  }

  /**
   * Define the queue from where your worker will retrieve
   * data from. By default, the `queue` option from your
   * connection will be used.
   *
   * @default Config.get(`queue.connections.${connection}.queue`)
   */
  public static queue() {
    const connection = this.connection()

    return Config.get(`queue.connections.${connection}.queue`)
  }

  /**
   * Define the number of attempts that your worker will
   * try to process a job. By default, the `attempts` option
   * from your connection will be used and if not defined,
   * the default value will be `1`.
   *
   * @default Config.get(`queue.connections.${connection}.attempts`, 1)
   */
  public static attempts() {
    const connection = this.connection()

    return Config.get(`queue.connections.${connection}.attempts`, 1)
  }

  /**
   * Define the backoff configuration for your worker re-attempts.
   * By default, the `backoff` option from your connection
   * will be used and if not defined, the default value
   * will be `null`.
   *
   * @default Config.get(`queue.connections.${connection}.backoff`, null)
   */
  public static backoff() {
    const connection = this.connection()

    return Config.get(`queue.connections.${connection}.backoff`, null)
  }

  /**
   * Define the deadletter queue of your worker. If any
   * problem happens when trying to consume your event,
   * it will be added to the deadletter queue.
   *
   * @default Config.get(`queue.connections.${connection}.deadletter`)
   */
  public static deadletter() {
    const connection = this.connection()

    return Config.get(`queue.connections.${connection}.deadletter`, null)
  }

  /**
   * Define the interval in milliseconds where the worker will
   * try to look for data in the queue.
   *
   * @default Config.get(`queue.connections.${connection}.workerInterval`, 1000)
   */
  public static interval() {
    const connection = this.connection()

    return Config.get(`queue.connections.${connection}.workerInterval`, 1000)
  }

  /**
   * Return an instance of the `Queue` facade. This
   * is the same of doing:
   *
   * @example
   * ```ts
   * const queue = Queue.connection(Job.connection()).queue(Job.queue())
   *
   * await queue.add({ hello: 'world' })
   * ```
   */
  public queue() {
    const Job = this.constructor as typeof BaseWorker

    return Queue.connection(Job.connection(), {
      options: {
        queue: Job.queue(),
        backoff: Job.backoff(),
        attempts: Job.attempts(),
        interval: Job.interval(),
        deadletter: Job.deadletter()
      }
    })
  }
}
