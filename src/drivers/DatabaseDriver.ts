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
  private static ackedIds = new Set<string>()

  /**
   * The `connection` database that is being used.
   */
  public dbConnection: string

  /**
   * The table responsible to save the data and queues.
   */
  public table: string

  public constructor(
    con: string,
    client: any = null,
    options?: ConnectionOptions['options']
  ) {
    super(con, client, options)

    const config = Config.get(`queue.connections.${con}`)

    this.table = options?.table || config?.table
    this.dbConnection = options?.connection || config?.connection
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
      attempts: this.attempts,
      availableAt: Date.now(),
      reservedUntil: null,
      createdAt: Date.now(),
      data
    })
  }

  /**
   * Release any job that has expired leases.
   */
  public async releaseExpiredLeases() {
    const now = Date.now()

    await this.client
      .table(this.table)
      .where('queue', this.queueName)
      .where('reservedUntil', '<=', now)
      .update({ reservedUntil: null })
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
    const now = Date.now()

    const data = await this.client
      .table(this.table)
      .where('queue', this.queueName)
      .where('availableAt', '<=', now)
      .where((qb: any) =>
        qb.whereNull('reservedUntil').orWhere('reservedUntil', '<=', now)
      )
      .orderBy('availableAt', 'asc')
      .orderBy('createdAt', 'asc')
      .find()

    if (!data) {
      return null
    }

    if (Is.Json(data.data)) {
      data.data = JSON.parse(data.data)
    }

    await this.client.table(this.table).where('id', data.id).delete()

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
    const now = Date.now()

    await this.releaseExpiredLeases()

    const data = await this.client
      .table(this.table)
      .where('queue', this.queueName)
      .where('availableAt', '<=', now)
      .where((qb: any) =>
        qb.whereNull('reservedUntil').orWhere('reservedUntil', '<=', now)
      )
      .orderBy('availableAt', 'asc')
      .orderBy('createdAt', 'asc')
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
   * Acknowledge the job removing it from the queue.
   *
   * @example
   * ```ts
   * await Queue.ack(id)
   * ```
   */
  public async ack(id: string) {
    DatabaseDriver.ackedIds.add(id)

    await this.client
      .table(this.table)
      .where('queue', this.queueName)
      .where('id', id)
      .delete()
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
    const length = await this.length()

    return length === 0
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
    const requeueJitterMs = Math.floor(Math.random() * this.workerInterval)

    if (!job) {
      return
    }

    DatabaseDriver.ackedIds.delete(job.id)

    job.attempts--
    job.reservedUntil = Date.now() + this.visibilityTimeout

    await this.client.table(this.table).where('id', job.id).update({
      attempts: job.attempts,
      reservedUntil: job.reservedUntil
    })

    try {
      await processor({
        id: job.id,
        attempts: job.attempts,
        data: job.data
      })

      /**
       * If the job still exists after processing, it means that the job was
       * not processed for some reason, so we need to make it available again
       * after a delay.
       */
      if (!DatabaseDriver.ackedIds.has(job.id)) {
        job.reservedUntil = null
        job.availableAt = Date.now() + this.noAckDelayMs + requeueJitterMs

        await this.client
          .table(this.table)
          .where('queue', this.queueName)
          .where('id', job.id)
          .update({
            availableAt: job.availableAt,
            reservedUntil: job.reservedUntil
          })
      }
    } catch (err) {
      const shouldRetry = job.attempts > 0

      if (Config.is('worker.logger.prettifyException')) {
        Log.channelOrVanilla('exception').error(
          await err.toAthennaException().prettify()
        )
      } else {
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
      }

      if (!shouldRetry) {
        await this.ack(job.id)

        if (this.deadletter) {
          await this.client.table(this.table).create({
            ...job,
            queue: this.deadletter,
            reservedUntil: null,
            attempts: 0
          })
        }

        return
      }

      await this.client
        .table(this.table)
        .where('id', job.id)
        .update({
          reservedUntil: null,
          availableAt:
            Date.now() +
            this.calculateBackoffDelay(job.attempts) +
            requeueJitterMs
        })
    }
  }
}
