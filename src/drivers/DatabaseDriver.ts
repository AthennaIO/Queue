/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Log } from '@athenna/logger'
import { Config } from '@athenna/config'
import { Driver } from '#src/drivers/Driver'
import type { DatabaseImpl } from '@athenna/database'

export class DatabaseDriver extends Driver {
  /**
   * Database instance that will be used to save the
   * queue data.
   */
  public DB: DatabaseImpl

  /**
   * The `connection` database that is being used.
   */
  public dbConnection: string

  /**
   * The table responsible to save the data and queues.
   */
  public table: string

  public constructor(con: string, client: any = null) {
    super(con, client)

    const { table, connection } = Config.get(`queue.connections.${con}`)

    this.table = table
    this.dbConnection = connection
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
    await this.DB.truncate(this.table)
  }

  /**
   * Connect to client.
   *
   * @example
   * ```ts
   * Queue.connection('my-con').connect()
   * ```
   */
  public async connect() {
    this.DB = ioc.safeUse('Athenna/Core/Database').connection(this.dbConnection)
  }

  /**
   * Close the connection with queue in this instance.
   *
   * @example
   * ```ts
   * await Queue.connection('my-con').close()
   * ```
   */
  public async close() {
    if (!this.DB) {
      return
    }

    await this.DB.close()
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
    await this.DB.table(this.table).create({
      queue: this.queueName,
      item
    })
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
    const data = await this.DB.table(this.table)
      .where('queue', this.queueName)
      .latest()
      .find()

    if (!data) {
      return
    }

    await this.DB.table(this.table).where('id', data.id).delete()

    return data.item
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
    const data = await this.DB.table(this.table)
      .where('queue', this.queueName)
      .latest()
      .find()

    if (!data) {
      return null
    }

    return data.item
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
    const count = await this.DB.table(this.table)
      .where('queue', this.queueName)
      .count()

    return parseInt(count)
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
    const count = await this.DB.table(this.table)
      .where('queue', this.queueName)
      .count()

    return parseInt(count) <= 0
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

      await this.DB.table(this.table).create({
        queue: this.deadletter,
        formerQueue: this.queueName,
        item: data
      })
    }
  }
}
