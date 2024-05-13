/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { debug } from '#src/debug'
import { Driver } from '#src/drivers/Driver'

export class VanillaDriver extends Driver {
  public connection: string
  private queues: Record<string, any[]>

  private defineQueue() {
    if (!this.queues[this.queueName]) {
      this.queues[this.queueName] = []
    }
  }

  public async connect() {}

  public async close() {}

  public async truncate() {
    Object.keys(this.queues).forEach(key => (this.queues[key] = []))
  }

  public async add(item: unknown) {
    this.defineQueue()

    this.queues[this.queueName].push(item)
  }

  public async pop() {
    this.defineQueue()

    if (!this.queues[this.queueName].length) {
      return null
    }

    return this.queues[this.queueName].shift()
  }

  public async peek() {
    this.defineQueue()

    if (!this.queues[this.queueName].length) {
      return null
    }

    return this.queues[this.queueName][0]
  }

  public async length() {
    this.defineQueue()

    return this.queues[this.queueName].length
  }

  public async isEmpty() {
    this.defineQueue()

    return !this.queues[this.queueName].length
  }

  public async process(processor: (item: unknown) => any | Promise<any>) {
    const data = await this.pop()

    try {
      await processor(data)
    } catch (err) {
      debug(
        'adding data of %s to deadletter queue due to: %o',
        this.queueName,
        err
      )

      this.queues[this.deadletter].push({ queue: this.queueName, data })
    }
  }
}
