/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Queue } from '#src/facades/Queue'

export class BaseJob {
  /**
   * Define the connection queue that is going to be
   * used by you job class to process the data from
   * your queue.
   *
   * @default 'default'
   */
  public static connection() {
    return 'default'
  }

  /**
   * Define the queue from where your job will
   * retrieve data from. By default, the `queue`
   * option from your connection will be used.
   *
   * @default Config.get(`queue.connections.${connection}.queue`)
   */
  public static queue() {
    const connection = this.connection()

    return Config.get(`queue.connections.${connection}.queue`)
  }

  /**
   * Return an instance of the `Queue` facade. This
   * is the same of doing:
   *
   * @example
   * ```ts
   * const queue = Queue.connection(Job.connection()).queue(Job.queue())
   * ```
   */
  public queue() {
    const Job = this.constructor as typeof BaseJob

    return Queue.connection(Job.connection()).queue(Job.queue())
  }
}
