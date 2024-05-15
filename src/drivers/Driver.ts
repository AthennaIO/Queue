/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Config } from '@athenna/config'
import type { ConnectionOptions } from '#src/types'

export abstract class Driver<Client = any> {
  /**
   * Set if this instance is connected.
   */
  public isConnected = false

  /**
   * Set if the connection will be saved on factory.
   */
  public isSavedOnFactory = false

  /**
   * The connection name used for this instance.
   */
  public connection: string = null

  /**
   * Set the client of this driver.
   */
  public client: Client

  /**
   * Set the default queue of the driver.
   */
  public queueName: string

  /**
   * Set the default deadletter queue of the driver.
   */
  public deadletter: string

  /**
   * Creates a new instance of the Driver.
   */
  public constructor(connection: string | any, client: Client = null) {
    const config = Config.get(`queue.connections.${connection}`)

    this.queueName = config.queue
    this.deadletter = config.deadletter
    this.connection = connection

    if (client) {
      this.client = client
      this.isConnected = true
      this.isSavedOnFactory = true
    }
  }

  /**
   * Clone the driver instance.
   */
  public clone(): this {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return new this.constructor(this.connection, this.client)
  }

  /**
   * Return the client of driver.
   */
  public getClient(): Client {
    return this.client
  }

  /**
   * Set a client in driver.
   */
  public setClient(client: Client) {
    this.client = client

    return this
  }

  /**
   * Connect to client.
   */
  public abstract connect(options?: ConnectionOptions): void

  /**
   * Close the connection with the client in this instance.
   */
  public abstract close(): Promise<void>

  /**
   * Reset all data defined inside queues.
   */
  public abstract truncate(): Promise<void>

  /**
   * Set the queue that this driver will work with.
   */
  public queue(name: string): this {
    this.queueName = name

    return this
  }

  /**
   * Add a item to the queue.
   */
  public abstract add(item: unknown): Promise<void>

  /**
   * Remove the first item from the queue and return.
   */
  public abstract pop<T = any>(): Promise<T>

  /**
   * Get the first item from the queue without removing
   * and return.
   */
  public abstract peek<T = any>(): Promise<T>

  /**
   * Return the length of items inside the queue.
   */
  public abstract length(): Promise<number>

  /**
   * Verify if the queue is empty.
   */
  public abstract isEmpty(): Promise<boolean>

  /**
   * Process the next item in the queue.
   */
  public abstract process(
    processor: (item: unknown) => any | Promise<any>
  ): Promise<void>
}
