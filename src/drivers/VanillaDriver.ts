/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Log } from '@athenna/logger'
import { Options } from '@athenna/common'
import { Driver } from '#src/drivers/Driver'
import type { ConnectionOptions } from '#src/types'
import { ConnectionFactory } from '#src/factories/ConnectionFactory'

export class VanillaDriver extends Driver {
  private defineQueue() {
    if (!this.client.queues[this.queueName]) {
      this.client.queues[this.queueName] = []
    }

    if (!this.client.queues[this.deadletter]) {
      this.client.queues[this.deadletter] = []
    }
  }

  /**
   * Connect to client.
   *
   * @example
   * ```ts
   * Queue.connection('my-con').connect()
   * ```
   */
  public connect(options: ConnectionOptions = {}): void {
    options = Options.create(options, {
      force: false,
      connect: true,
      saveOnFactory: true
    })

    if (!options.connect) {
      return
    }

    if (this.isConnected && !options.force) {
      return
    }

    this.client = { queues: {} }
    this.isConnected = true
    this.isSavedOnFactory = options.saveOnFactory

    if (options.saveOnFactory) {
      ConnectionFactory.setClient(this.connection, this.client)
    }
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
  public async truncate() {
    Object.keys(this.client.queues).forEach(
      key => (this.client.queues[key] = [])
    )
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
  public async add(data: unknown) {
    this.defineQueue()

    this.client.queues[this.queueName].push(data)
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
  public async pop() {
    this.defineQueue()

    if (!this.client.queues[this.queueName].length) {
      return null
    }

    return this.client.queues[this.queueName].shift()
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
  public async peek() {
    this.defineQueue()

    if (!this.client.queues[this.queueName].length) {
      return null
    }

    return this.client.queues[this.queueName][0]
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
  public async length() {
    this.defineQueue()

    return this.client.queues[this.queueName].length
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
  public async isEmpty() {
    this.defineQueue()

    return !this.client.queues[this.queueName].length
  }

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
  public async process(processor: (data: unknown) => any | Promise<any>) {
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

      this.client.queues[this.deadletter].push({ queue: this.queueName, data })
    }
  }
}
