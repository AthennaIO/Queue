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

export class VanillaDriver extends Driver {
  private defineQueue() {
    if (!this.client.queues[this.queueName]) {
      this.client.queues[this.queueName] = []
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
      saveOnFactory: true,
      connect: true
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
  public async add(item: unknown) {
    this.defineQueue()

    this.client.queues[this.queueName].push(item)
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
    this.defineQueue()

    if (!this.client.queues[this.queueName].length) {
      return null
    }

    return this.client.queues[this.queueName].shift()
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
    this.defineQueue()

    if (!this.client.queues[this.queueName].length) {
      return null
    }

    return this.client.queues[this.queueName][0]
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
    this.defineQueue()

    return this.client.queues[this.queueName].length
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
    this.defineQueue()

    return !this.client.queues[this.queueName].length
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
    const data = await this.pop()

    try {
      await processor(data)
    } catch (err) {
      Log.channelOrVanilla('application').error(
        'adding data of %s to deadletter queue due to: %o',
        this.queueName,
        err
      )

      this.client.queues[this.deadletter].push({ queue: this.queueName, data })
    }
  }
}
