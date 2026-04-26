/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Utils } from '#src/utils'
import { Is } from '@athenna/common'
import { Config } from '@athenna/config'
import type { Job, ConnectionOptions } from '#src/types'
import { QueueExecutionScope } from '#src/worker/QueueExecutionScope'

export const RUN_WITH_WORKER_CONTEXT = Symbol.for(
  '@athenna/queue.runWithWorkerContext'
)

export type ScopedQueueProcessor<T = unknown> = ((
  data: T
) => any | Promise<any>) & {
  [RUN_WITH_WORKER_CONTEXT]?: (
    data: T,
    callback: () => any | Promise<any>,
    captureScope?: (scope: QueueExecutionScope<T>) => void
  ) => any | Promise<any>
}

export abstract class Driver<Client = any> {
  /**
   * Set if this instance is connected.
   */
  public isConnected = false

  /**
   * Set if the connection will be saved on factory.
   */
  public isSavedOnFactory = false

  /**
   * The connection name used for this instance.
   */
  public connection: string = null

  /**
   * Set the client of this driver.
   */
  public client: Client

  /**
   * Set the default queue of the driver.
   */
  public queueName: string

  /**
   * Set the default deadletter queue of the driver.
   */
  public deadletter: string

  /**
   * Set the default number of attempts of the driver.
   */
  public attempts: number

  /**
   * Set the default visibility timeout of the driver.
   */
  public visibilityTimeout: number

  /**
   * Set the default no ack delay of the driver.
   */
  public noAckDelayMs: number

  /**
   * Set the default worker interval of the driver.
   */
  public workerInterval: number

  /**
   * Set the driver backoff of the driver.
   */
  public backoff?: {
    type: 'fixed' | 'exponential'
    delay: number
    jitter: number
  }

  /**
   * Set the custom options used when creating this driver.
   */
  public options?: ConnectionOptions['options']

  /**
   * Creates a new instance of the Driver.
   */
  public constructor(
    connection: string | any,
    client: Client = null,
    options?: ConnectionOptions['options']
  ) {
    const config = Config.get(`queue.connections.${connection}`)

    this.options = options

    this.workerInterval =
      options?.workerInterval || config.workerInterval || 1000
    this.noAckDelayMs = Utils.computeNoAckDelayMs(
      this.workerInterval,
      `${this.connection}:${this.queueName}:noack`
    )

    this.queueName = options?.queue || config.queue
    this.backoff = options?.backoff || config.backoff || null
    this.attempts = options?.attempts || config.attempts || 1
    this.deadletter = options?.deadletter || config.deadletter
    this.visibilityTimeout =
      options?.visibilityTimeout || config.visibilityTimeout || 30000
    this.connection = connection

    if (client) {
      this.client = client
      this.isConnected = true
      this.isSavedOnFactory = true
    }
  }

  /**
   * Clone the driver instance.
   */
  public clone(): this {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return new this.constructor(this.connection, this.client)
  }

  /**
   * Return the client of driver.
   */
  public getClient(): Client {
    return this.client
  }

  /**
   * Set a client in driver.
   */
  public setClient(client: Client) {
    this.client = client

    return this
  }

  /**
   * Calculate the heartbeat delay. Used to define if job is still
   * running.
   */
  public calculateHeartbeatDelay() {
    if (!this.visibilityTimeout) {
      return 0
    }

    return Math.max(5_000, Math.floor(this.visibilityTimeout * 0.8))
  }

  /**
   * Calculate the backoff delay. Used to define the retry delays when
   * a job fails processing.
   */
  public calculateBackoffDelay(attempts: number) {
    if (!this.backoff) {
      return 0
    }

    let { type, delay, jitter } = this.backoff

    if (!jitter || jitter < 0) {
      jitter = 0
    }

    const baseDelay =
      type === 'fixed' ? delay : Math.pow(2, this.attempts - attempts) * delay

    const max = baseDelay * jitter
    const random = Math.floor(Math.random() * (max - baseDelay + 1)) + baseDelay

    return random
  }

  protected runScopedQueueProcessor<T>(
    processor: ScopedQueueProcessor<T>,
    data: T,
    callback: () => any | Promise<any>,
    captureScope?: (scope: QueueExecutionScope<T>) => void
  ) {
    const runner = processor[RUN_WITH_WORKER_CONTEXT]

    if (runner) {
      return runner(data, callback, captureScope)
    }

    const scope = new QueueExecutionScope<T>({
      name: this.queueName,
      connection: this.connection,
      options: this.options,
      traceId: null,
      job: this.createContextJob(data)
    })

    captureScope?.(scope)

    return scope.run(callback)
  }

  private createContextJob<T>(data: T) {
    if (this.isJob(data)) {
      return data
    }

    return {
      id: null,
      attempts: this.attempts,
      data
    } as Job
  }

  private isJob(data: unknown): data is Job {
    if (!data || !Is.Object(data)) {
      return false
    }

    const candidate = data as Partial<Job>

    return 'data' in candidate && 'attempts' in candidate
  }

  /**
   * Connect to client.
   */
  public abstract connect(options?: ConnectionOptions): void

  /**
   * Close the connection with the client in this instance.
   */
  public abstract close(): Promise<void>

  /**
   * Reset all data defined inside queues.
   */
  public abstract truncate(): Promise<void>

  /**
   * Set the queue that this driver will work with.
   */
  public queue(name: string): this {
    this.queueName = name

    return this
  }

  /**
   * Add a job to the queue.
   */
  public abstract add(data: unknown): Promise<void>

  /**
   * Remove the first job from the queue and return.
   */
  public abstract pop<T = any>(): Promise<T>

  /**
   * Get the first job from the queue without removing
   * and return.
   */
  public abstract peek<T = any>(workerId: string): Promise<T>

  /**
   * Acknowledge the job removing it from the queue.
   */
  public abstract ack(jobId: string): Promise<void>

  /**
   * Return the length of jobs inside the queue.
   */
  public abstract length(): Promise<number>

  /**
   * Verify if the queue is empty.
   */
  public abstract isEmpty(): Promise<boolean>

  /**
   * Change the job visibility values in the queue.
   */
  public changeJobVisibility(_jobId: string, _seconds: number): Promise<void> {
    return Promise.resolve()
  }

  /**
   * Send a job to the deadletter queue.
   */
  public sendJobToDLQ(_jobId: string): Promise<void> {
    return Promise.resolve()
  }

  /**
   * Process the next data in the queue.
   */
  public abstract process(
    processor: (data: unknown) => any | Promise<any>
  ): Promise<void>
}
