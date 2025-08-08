/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Log } from '@athenna/logger'
import { Driver } from '#src/drivers/Driver'
import { Options, Uuid } from '@athenna/common'
import type { ConnectionOptions } from '#src/types'
import { ConnectionFactory } from '#src/factories/ConnectionFactory'

export class VanillaDriver extends Driver {
  /**
   * Set the acked ids of the driver.
   */
  private ackedIds = new Set<string>()

  private defineQueue() {
    if (!this.client.queues[this.queueName]) {
      this.client.queues[this.queueName] = []
    }

    if (!this.client.queues[this.deadletter]) {
      this.client.queues[this.deadletter] = []
    }
  }

  private releaseExpiredLeases() {
    const now = Date.now()

    this.client.queues[this.queueName].forEach(job => {
      if (
        job.status === 'processing' &&
        job.leaseUntil &&
        job.leaseUntil <= now
      ) {
        job.status = 'pending'
        job.leaseUntil = null
      }
    })
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

    this.client.queues[this.queueName].push({
      id: Uuid.generate(),
      status: 'pending',
      attemptsLeft: this.attempts,
      availableAt: Date.now(),
      leaseUntil: null,
      data
    })
  }

  /**
   * Peek the next job to be processed from the queue and
   * return. This method automatically removes the job from the queue.
   *
   * @example
   * ```ts
   * await Queue.add({ name: 'lenon' })
   *
   * const job = await Queue.pop()
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
   * Peek the next job to be processed from the queue and
   * return. This method does not remove the job from the queue.
   *
   * @example
   * ```ts
   * await Queue.add({ name: 'lenon' })
   *
   * const job = await Queue.peek()
   * ```
   */
  public async peek() {
    this.defineQueue()
    this.releaseExpiredLeases()

    if (!this.client.queues[this.queueName].length) {
      return null
    }

    const now = Date.now()

    return this.client.queues[this.queueName].find(job => {
      return (
        job.status === 'pending' && job.availableAt <= now && !job.leaseUntil
      )
    })
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
   * Acknowledge the job removing it from the queue.
   *
   * @example
   * ```ts
   * await Queue.ack(id)
   * ```
   */
  public async ack(id: string) {
    this.defineQueue()

    const index = this.client.queues[this.queueName].findIndex(
      job => job.id === id && job.status === 'processing'
    )

    if (index === -1) {
      return
    }

    this.client.queues[this.queueName].splice(index, 1)
    this.ackedIds.add(id)
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
    const job = await this.peek()
    const requeueJitterMs = Math.floor(Math.random() * this.workerInterval)

    if (!job) {
      return
    }

    this.ackedIds.delete(job.id)

    job.attemptsLeft--
    job.status = 'processing'
    job.leaseUntil = Date.now() + this.visibilityTimeout

    try {
      await processor({
        id: job.id,
        attemptsLeft: job.attemptsLeft,
        data: job.data
      })

      /**
       * If the job still exists after processing, it means that the job was
       * not processed for some reason, so we need to put it back the pending
       * status.
       */
      if (!this.ackedIds.has(job.id)) {
        job.status = 'pending'
        job.leaseUntil = null
        job.availableAt = Date.now() + this.noAckDelayMs + requeueJitterMs
      }
    } catch (err) {
      const shouldRetry = job.attemptsLeft > 0

      job.leaseUntil = null

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
        job.availableAt =
          Date.now() +
          this.calculateBackoffDelay(job.attemptsLeft) +
          requeueJitterMs

        return
      }

      const index = this.client.queues[this.queueName].findIndex(
        j => j.id === job.id
      )

      if (index !== -1) {
        this.client.queues[this.queueName].splice(index, 1)
      }

      if (this.deadletter) {
        this.client.queues[this.deadletter].push({
          ...job,
          attemptsLeft: 0,
          queue: this.deadletter,
          formerQueue: this.queueName,
          status: 'pending'
        })
      }
    }
  }
}
