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
import { Is, Options } from '@athenna/common'
import type { ConnectionOptions } from '#src/types'
import type { DatabaseImpl } from '@athenna/database'
import { ConnectionFactory } from '#src/factories/ConnectionFactory'

export class DatabaseDriver extends Driver<DatabaseImpl> {
  /**
   * Set the acked ids of the driver.
   */
  private ackedIds = new Set<string>()

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
      data,
      status: 'pending',
      attemptsLeft: this.attempts
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
    const data = await this.peek()

    if (!data) {
      return null
    }

    await this.client.table(this.table).where('id', data.id).delete()

    if (Is.Json(data.data)) {
      data.data = JSON.parse(data.data)
    }

    return data
  }

  /**
   * Peek the next job from the queue without removing it
   * and return.
   *
   * @example
   * ```ts
   * await Queue.add({ name: 'lenon' })
   *
   * const user = await Queue.peek()
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

    return data
  }

  /**
   * Acknowledge the job removing it from the queue.
   *
   * @example
   * ```ts
   * await Queue.ack(id)
   * ```
   */
  public async ack(id: string) {
    this.ackedIds.add(id)

    await this.client
      .table(this.table)
      .where('id', id)
      .where('status', 'processing')
      .delete()
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
    const job = await this.peek()

    if (!job) {
      return
    }

    this.ackedIds.delete(job.id)

    job.attemptsLeft--
    job.status = 'processing'

    await this.client.table(this.table).where('id', job.id).update({
      status: 'processing',
      attemptsLeft: job.attemptsLeft
    })

    try {
      await processor(job)

      /**
       * If the job still exists after processing, it means that the job was
       * not processed for some reason, so we need to put it back the pending
       * status.
       */
      if (!this.ackedIds.has(job.id)) {
        job.status = 'pending'
      }
    } catch (err) {
      const shouldRetry = job.attemptsLeft > 0

      await this.ack(job.id)

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
        job
      })

      if (shouldRetry) {
        job.status = 'pending'

        const delay = this.calculateBackoffDelay(job.attemptsLeft)

        setTimeout(async () => {
          await this.client.table(this.table).create({
            id: job.id,
            queue: this.queueName,
            status: 'pending',
            attemptsLeft: job.attemptsLeft,
            data: job.data
          })
        }, delay)

        return
      }

      if (this.deadletter) {
        await this.client.table(this.table).create({
          attemptsLeft: 0,
          queue: this.deadletter,
          formerQueue: this.queueName,
          status: 'pending',
          data: job.data
        })
      }
    }
  }
}
