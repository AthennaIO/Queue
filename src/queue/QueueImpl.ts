/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { Driver } from '#src/drivers/Driver'

export class QueueImpl {
  public driver: Driver

  // public connection(name: string) {}

  public async truncate() {
    await this.driver.truncate()

    return this
  }

  public queue(name: string) {
    this.driver.queue(name)

    return this
  }

  public async add(item: unknown) {
    await this.driver.add(item)
  }

  public async pop() {
    return this.driver.pop()
  }

  public async peek() {
    return this.driver.peek()
  }

  public async length() {
    return this.driver.length()
  }

  public async isEmpty() {
    return this.driver.isEmpty()
  }

  public async process(cb: (item: unknown) => any | Promise<any>) {
    return this.driver.process(cb)
  }
}
