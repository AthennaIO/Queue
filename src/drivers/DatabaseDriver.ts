/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { debug } from '#src/debug'
import { Config } from '@athenna/config'
import { Driver } from '#src/drivers/Driver'
import type { DatabaseImpl } from '@athenna/database'

export class DatabaseDriver extends Driver {
  private DB: DatabaseImpl
  private dbConnection: string

  private table: string
  private deadLetterQueueName: string

  public constructor(connection: string, client: any = null) {
    super(connection, client)

    const {
      table,
      queue,
      deadletter,
      connection: dbConnection
    } = Config.get(`queue.connections.${connection}`)

    this.table = table
    this.queueName = queue
    this.dbConnection = dbConnection
    this.deadLetterQueueName = deadletter
  }

  public async truncate() {
    await this.DB.truncate(this.table)
  }

  public async connect() {
    this.DB = ioc.safeUse('Athenna/Core/Database').connection(this.dbConnection)
  }

  public async close() {
    if (!this.DB) {
      return
    }

    await this.DB.close()
  }

  public async add(item: unknown) {
    await this.DB.table(this.table).create({
      queue: this.queueName,
      item
    })
  }

  public async pop() {
    const data = await this.DB.table(this.table)
      .where('queue', this.queueName)
      .orderBy('id', 'DESC')
      .find()

    if (!data) {
      return
    }

    await this.DB.table(this.table)
      .where('id', data.id)
      .where('queue', this.queueName)
      .delete()

    return data.item
  }

  public async peek() {
    const data = await this.DB.table(this.table)
      .where('queue', this.queueName)
      .orderBy('id', 'DESC')
      .find()

    if (!data) {
      return null
    }

    return data.item
  }

  public async length() {
    const count = await this.DB.table(this.table)
      .where('queue', this.queueName)
      .count()

    return parseInt(count)
  }

  public async isEmpty() {
    const count = await this.DB.table(this.table)
      .where('queue', this.queueName)
      .count()

    return parseInt(count) <= 0
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

      await this.DB.table(this.table).create({
        queue: this.deadLetterQueueName,
        formerQueue: this.queueName,
        item: data
      })
    }
  }
}
