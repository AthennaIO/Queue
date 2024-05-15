/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { ConnectionOptions } from '#src/types'
import type { FakeDriver } from '#src/drivers/FakeDriver'
import type { Driver as DriverImpl } from '#src/drivers/Driver'
import type { VanillaDriver } from '#src/drivers/VanillaDriver'
import type { DatabaseDriver } from '#src/drivers/DatabaseDriver'
import { ConnectionFactory } from '#src/factories/ConnectionFactory'

export class QueueImpl<Driver extends DriverImpl = any> {
  /**
   * The connection name used for this instance.
   */
  public connectionName = Config.get('queue.default')

  /**
   * The drivers responsible for handling queue operations.
   */
  public driver: VanillaDriver | DatabaseDriver | typeof FakeDriver = null

  /**
   * Creates a new instance of QueueImpl.
   */
  public constructor(athennaQueueOpts?: ConnectionOptions) {
    this.driver = ConnectionFactory.fabricate(this.connectionName)

    this.connect(athennaQueueOpts)
  }

  public connection(
    con: 'vanilla',
    options?: ConnectionOptions
  ): QueueImpl<VanillaDriver>

  public connection(
    con: 'database',
    options?: ConnectionOptions
  ): QueueImpl<DatabaseDriver>

  public connection(
    con: 'fake',
    options?: ConnectionOptions
  ): QueueImpl<typeof FakeDriver>

  public connection(
    con: 'fake' | 'vanilla' | 'database' | string,
    options?: ConnectionOptions
  ):
    | QueueImpl<VanillaDriver>
    | QueueImpl<DatabaseDriver>
    | QueueImpl<typeof FakeDriver>

  /**
   * Change the queue connection.
   *
   * @example
   * ```ts
   * await Queue.connection('redis').queue('hello').add({ name: 'lenon' })
   * ```
   */
  public connection(
    con: 'fake' | 'vanilla' | 'database' | string,
    options?: ConnectionOptions
  ): QueueImpl<Driver> {
    const driver = ConnectionFactory.fabricate(con)
    const queue = new QueueImpl<typeof driver>(options)

    queue.connectionName = con
    queue.driver = driver

    return queue.connect(options)
  }

  /**
   * Verify if client is already connected.
   */
  public isConnected(): boolean {
    return this.driver.isConnected
  }

  /**
   * Connect to client.
   *
   * @example
   * ```ts
   * Queue.connection('my-con').connect()
   * ```
   */
  public connect(options?: ConnectionOptions) {
    this.driver.connect(options)

    return this
  }

  /**
   * Close the connection with queue in this instance.
   *
   * @example
   * ```ts
   * await Queue.connection('my-con').close()
   * ```
   */
  public async close(): Promise<void> {
    await this.driver.close()
  }

  /**
   * Close all the open connections of queue.
   *
   * @example
   * ```ts
   * await Queue.closeAll()
   * ```
   */
  public async closeAll(): Promise<void> {
    const cons = ConnectionFactory.availableConnections()
    const promises = cons.map(con => {
      const driver = ConnectionFactory.fabricate(con)

      return driver
        .close()
        .then(() => ConnectionFactory.connections.delete(con))
    })

    await Promise.all(promises)
  }

  /**
   * Delete all the data of queues.
   */
  public async truncate() {
    await this.driver.truncate()

    return this
  }

  /**
   * Define which queue is going to be used to
   * perform operations. If not defined, the default
   * set on the connection configuration will be used.
   *
   * @example
   * ```ts
   * await Queue.queue('mail').add({ email: 'lenon@athenna.io' })
   * ```
   */
  public queue(name: string) {
    this.driver.queue(name)

    return this
  }

  /**
   * Add a new item to the queue.
   *
   * @example
   * ```ts
   * await Queue.add({ name: 'lenon' })
   * ```
   */
  public async add(item: unknown) {
    await this.driver.add(item)
  }

  /**
   * Remove an item from the queue and return.
   *
   * @example
   * ```ts
   * await Queue.add({ name: 'lenon' })
   *
   * const user = await Queue.pop()
   * ```
   */
  public async pop() {
    return this.driver.pop()
  }

  /**
   * Remove an item from the queue and return.
   *
   * @example
   * ```ts
   * await Queue.add({ name: 'lenon' })
   *
   * const user = await Queue.pop()
   * ```
   */
  public async peek() {
    return this.driver.peek()
  }

  /**
   * Return how many items are defined inside the queue.
   *
   * @example
   * ```ts
   * await Queue.add({ name: 'lenon' })
   *
   * const length = await Queue.length()
   * ```
   */
  public async length() {
    return this.driver.length()
  }

  /**
   * Verify if there are items on the queue.
   *
   * @example
   * ```ts
   * if (await Queue.isEmpty()) {
   * }
   * ```
   */
  public async isEmpty() {
    return this.driver.isEmpty()
  }

  /**
   * Process the next item of the queue with a handler.
   *
   * @example
   * ```ts
   * await Queue.add({ email: 'lenon@athenna.io' })
   *
   * await Queue.process(async (user) => {
   *   await Mail.to(user.email).subject('Hello!').send()
   * })
   * ```
   */
  public async process(processor: (item: unknown) => any | Promise<any>) {
    return this.driver.process(processor)
  }
}
