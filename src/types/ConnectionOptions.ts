/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

export type ConnectionOptions = {
  /**
   * Force the connection to be created even if the
   * connection is already opened. This option is
   * useful to create a connection from scratch, meaning
   * that your driver will not use the default one. This
   * also means that is your responsibility to close this
   * connection.
   *
   * @default false
   */
  force?: boolean

  /**
   * Save your connection in the DriverFactory class.
   * If this is true, all the drivers will have a shared
   * connection to use.
   *
   * @default true
   */
  saveOnFactory?: boolean

  /**
   * Since we are using the constructor method to create
   * the connection, it could create the connection when
   * we don't really want to. To avoid creating the
   * connection is certain scenarios where you want to
   * manipulate the driver client, set this option to `false`.
   *
   * @default true
   */
  connect?: boolean

  /**
   * Define the options for your connection.
   */
  options?: {
    /**
     * Define the number of attempts that your worker will
     * try to process a job. By default, the `attempts` option
     * from your connection will be used and if not defined,
     * the default value will be `1`.
     *
     * @default Config.get(`queue.connections.${connection}.attempts`, 1)
     */
    attempts?: number

    /**
     * Define the backoff configuration for your worker re-attempts.
     * By default, the `backoff` option from your connection
     * will be used and if not defined, the default value
     * will be `null`.
     */
    backoff?: {
      type: 'fixed' | 'exponential'
      delay: number
      jitter: number
    }

    /**
     * Define the interval in milliseconds where the worker will
     * try to look for data in the queue.
     *
     * @default Config.get(`queue.connections.${connection}.workerInterval`, 1000)
     */
    interval?: number

    /**
     * Define the deadletter queue of your worker. If any
     * problem happens when trying to consume your event,
     * it will be added to the deadletter queue.
     *
     * @default Config.get(`queue.connections.${connection}.deadletter`)
     */
    deadletter?: string

    /**
     * Define the queue that your worker will use to
     * perform operations.
     *
     * @default Config.get(`queue.connections.${connection}.queue`)
     */
    queue?: string
  }
}
