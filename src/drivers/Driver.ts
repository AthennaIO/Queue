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
   * Set the default number of attempts of the driver.
   */
  public attempts: number

  /**
   * Set the driver backoff of the driver.
   */
  public backoff?: {
    type: 'fixed' | 'exponential'
    delay: number
    jitter: number
  }

  /**
   * Creates a new instance of the Driver.
   */
  public constructor(
    connection: string | any,
    client: Client = null,
    options?: ConnectionOptions['options']
  ) {
    const config = Config.get(`queue.connections.${connection}`)

    this.queueName = options?.queue || config.queue
    this.backoff = options?.backoff || config.backoff || null
    this.attempts = options?.attempts || config.attempts || 1
    this.deadletter = options?.deadletter || config.deadletter
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
   * Calculate the backoff delay.
   */
  public calculateBackoffDelay(attemptsLeft: number) {
    if (!this.backoff) {
      return 0
    }

    const { type, delay, jitter } = this.backoff

    const baseDelay =
      type === 'fixed'
        ? delay
        : Math.pow(2, this.attempts - attemptsLeft) * delay

    const max = baseDelay * jitter
    const random = Math.floor(Math.random() * (max - baseDelay + 1)) + baseDelay

    return random
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
   * Add a job to the queue.
   */
  public abstract add(data: unknown): Promise<void>

  /**
   * Remove the first job from the queue and return.
   */
  public abstract pop<T = any>(): Promise<T>

  /**
   * Get the first job from the queue without removing
   * and return.
   */
  public abstract peek<T = any>(): Promise<T>

  /**
   * Acknowledge the job removing it from the queue.
   */
  public abstract ack(jobId: string): Promise<void>

  /**
   * Return the length of jobs inside the queue.
   */
  public abstract length(): Promise<number>

  /**
   * Verify if the queue is empty.
   */
  public abstract isEmpty(): Promise<boolean>

  /**
   * Process the next data in the queue.
   */
  public abstract process(
    processor: (data: unknown) => any | Promise<any>
  ): Promise<void>
}
