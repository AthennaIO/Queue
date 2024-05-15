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
import { Is, Options } from '@athenna/common'
import { Driver } from '#src/drivers/Driver'
import type { DatabaseImpl } from '@athenna/database'
import { ConnectionFactory } from '#src/factories/ConnectionFactory'
import type { ConnectionOptions } from '#src/types/ConnectionOptions'

export class DatabaseDriver extends Driver<DatabaseImpl> {
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
    await this.client.truncate(this.table)
  }

  /**
   * Connect to client.
   *
   * @example
   * ```ts
   * Queue.connection('my-con').connect()
   * ```
   */
  public async connect(options: ConnectionOptions = {}) {
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

    this.client = ioc
      .safeUse('Athenna/Core/Database')
      .connection(this.dbConnection)
    this.isConnected = true
    this.isSavedOnFactory = options.saveOnFactory

    if (this.isSavedOnFactory) {
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
  public async close() {
    if (!this.client || !this.isConnected) {
      return
    }

    await this.client.close()

    this.client = null
    this.isConnected = false

    ConnectionFactory.setClient(this.connection, null)
  }

  /**
   * Add a new job to the queue.
   *
   * @example
   * ```ts
   * await Queue.queue('mail').add({ email: 'lenon@athenna.io' })
   * ```
   */
  public async add(data: unknown) {
    await this.client.table(this.table).create({
      queue: this.queueName,
      data
    })
  }

  /**
   * Remove a job from the queue and return.
   *
   * @example
   * ```ts
   * await Queue.add({ name: 'lenon' })
   *
   * const user = await Queue.pop()
   * ```
   */
  public async pop() {
    const data = await this.client
      .table(this.table)
      .where('queue', this.queueName)
      .latest()
      .find()

    if (!data) {
      return
    }

    if (Is.Json(data.data)) {
      data.data = JSON.parse(data.data)
    }

    await this.client.table(this.table).where('id', data.id).delete()

    return data.data
  }

  /**
   * Peek the next job from the queue without removing it
   * and return.
   *
   * @example
   * ```ts
   * await Queue.add({ name: 'lenon' })
   *
   * const user = await Queue.pop()
   * ```
   */
  public async peek() {
    const data = await this.client
      .table(this.table)
      .where('queue', this.queueName)
      .latest()
      .find()

    if (!data) {
      return null
    }

    if (Is.Json(data.data)) {
      data.data = JSON.parse(data.data)
    }

    return data.data
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
    const count = await this.client
      .table(this.table)
      .where('queue', this.queueName)
      .count()

    return parseInt(count)
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
    const count = await this.client
      .table(this.table)
      .where('queue', this.queueName)
      .count()

    return parseInt(count) <= 0
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
    let data = await this.pop()

    try {
      await processor(data)
    } catch (err) {
      if (Config.is('rc.bootLogs', true)) {
        Log.channelOrVanilla('application').error(
          'adding data of %s to deadletter queue due to: %o',
          this.queueName,
          err
        )
      }

      if (!Is.String(data)) {
        data = JSON.stringify(data)
      }

      await this.client.table(this.table).create({
        queue: this.deadletter,
        formerQueue: this.queueName,
        data
      })
    }
  }
}
