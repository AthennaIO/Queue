/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

export type WorkerOptions = {
  /**
   * The name of the worker.
   *
   * @default target.name
   */
  name?: string

  /**
   * The queue connection that will be used to get the configurations.
   *
   * @default Config.get('queue.default')
   */
  connection?: string

  /**
   * The alias that will be used to register the worker inside
   * the service container.
   *
   * @default App/Worker/YourJobClassName
   */
  alias?: string

  /**
   * The camel alias that will be used as an alias of the real
   * worker alias. Camel alias is important when you want to
   * work with constructor injection. By default, Athenna doesn't
   * create camel alias for workers.
   *
   * @default undefined
   */
  camelAlias?: string

  /**
   * The registration type that will be used to register your worker
   * inside the service container.
   *
   * @default 'transient'
   */
  type?: 'fake' | 'scoped' | 'singleton' | 'transient'
}
