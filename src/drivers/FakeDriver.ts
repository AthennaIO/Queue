/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Log } from '@athenna/logger'
import { Json, Options } from '@athenna/common'
import type { ConnectionOptions } from '#src/types'
import { ConnectionFactory } from '#src/factories/ConnectionFactory'

export class FakeDriver {
  public constructor(connection?: string, client?: any) {
    FakeDriver.connection = connection

    if (client) {
      FakeDriver.client = client
      FakeDriver.isConnected = true
      FakeDriver.isSavedOnFactory = true
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return FakeDriver
  }

  public static queueName = 'fake'
  public static deadletter = 'fake-deadletter'
  public static isConnected = false
  public static isSavedOnFactory = false
  public static connection = 'fake'
  public static client: unknown = null
  public static attempts: number = 1
  public static backoff: {
    type: 'fixed' | 'exponential'
    delay: number
    jitter: number
  } = null

  /**
   * Clone the driver instance.
   */
  public static clone() {
    return Json.copy(FakeDriver)
  }

  /**
   * Return the client of driver.
   */
  public static getClient() {
    return this.client
  }

  /**
   * Set a client in driver.
   */
  public static setClient(client: unknown) {
    this.client = client

    return this
  }

  /**
   * Calculate the backoff delay.
   */
  public static calculateBackoffDelay() {
    return 0
  }

  /**
   * Connect to client.
   *
   * @example
   * ```ts
   * Queue.connection('my-con').connect()
   * ```
   */
  public static connect(options: ConnectionOptions = {}): void {
    options = Options.create(options, {
      force: false,
      saveOnFactory: true,
      connect: true
    })

    if (!options.connect) {
      return
    }

    if (this.isConnected && !options.force) {
      return
    }

    this.isConnected = true
    this.isSavedOnFactory = options.saveOnFactory
  }

  /**
   * Close the connection with queue in this instance.
   *
   * @example
   * ```ts
   * await Queue.connection('my-con').close()
   * ```
   */
  public static async close(): Promise<void> {
    if (!this.isConnected) {
      return
    }

    this.isConnected = false

    ConnectionFactory.setClient(this.connection, null)
  }

  /**
   * Delete all the data of queues.
   *
   * @example
   * ```ts
   * await Queue.truncate()
   * ```
   */
  public static async truncate() {}

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
  public static queue(name: string) {
    this.queueName = name

    return this
  }

  /**
   * Add a new job to the queue.
   *
   * @example
   * ```ts
   * await Queue.add({ name: 'lenon' })
   * ```
   */
  public static async add() {}

  /**
   * Remove an job from the queue and return.
   *
   * @example
   * ```ts
   * await Queue.add({ name: 'lenon' })
   *
   * const user = await Queue.pop()
   * ```
   */
  public static async pop(): Promise<any> {
    return {}
  }

  /**
   * Remove an job from the queue and return.
   *
   * @example
   * ```ts
   * await Queue.add({ name: 'lenon' })
   *
   * const user = await Queue.pop()
   * ```
   */
  public static async peek(): Promise<any> {
    return {}
  }

  /**
   * Return how many jobs are defined inside the queue.
   *
   * @example
   * ```ts
   * await Queue.add({ name: 'lenon' })
   *
   * const length = await Queue.length()
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  public static async length() {
    return 0
  }

  /**
   * Verify if there are jobs on the queue.
   *
   * @example
   * ```ts
   * if (await Queue.isEmpty()) {
   * }
   * ```
   */
  public static async isEmpty() {
    return true
  }

  /**
   * Acknowledge the job removing it from the queue.
   */
  public static async ack() {}

  /**
   * Process the next job of the queue with a handler.
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
  public static async process(
    processor: (data: unknown) => any | Promise<any>
  ) {
    const data = await this.pop()

    try {
      await processor(data)
    } catch (err) {
      Log.channelOrVanilla('exception').error({
        msg: `failed to process job: ${err.message}`,
        queue: this.queueName,
        deadletter: this.deadletter,
        name: err.name,
        code: err.code,
        help: err.help,
        details: err.details,
        metadata: err.metadata,
        stack: err.stack,
        job: data
      })
    }
  }
}
