/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import {
  SQSClient,
  PurgeQueueCommand,
  SendMessageCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  GetQueueAttributesCommand,
  ChangeMessageVisibilityCommand
} from '@aws-sdk/client-sqs'

import { Log } from '@athenna/logger'
import { createHash } from 'node:crypto'
import { Driver } from '#src/drivers/Driver'
import { Is, Options, Uuid } from '@athenna/common'
import type { ConnectionOptions } from '#src/types'
import { ConnectionFactory } from '#src/factories/ConnectionFactory'
import { NotFifoSqsQueueTypeException } from '#src/exceptions/NotFifoSqsQueueTypeException'

export class AwsSqsDriver extends Driver<SQSClient> {
  /**
   * Set the acked ids of the driver.
   */
  private static ackedIds = new Set<string>()

  private type: 'standard' | 'fifo'
  private region: string
  private awsAccessKeyId: string
  private awsSecretAccessKey: string

  /**
   * Convert milliseconds to seconds.
   */
  private msToS(v: number) {
    const s = Math.ceil(v / 1000)
    return Math.max(0, Math.min(43200, s))
  }

  private fifoContentBasedDedup?: boolean
  private fifoGroupId?: string
  private dlqFifoGroupId?: string

  /**
   * Ensure the FIFO attributes are loaded.
   */
  private async ensureFifoAttrsLoaded() {
    if (this.type !== 'fifo' || this.fifoContentBasedDedup !== undefined) {
      return
    }

    const { Attributes } = await this.client.send(
      new GetQueueAttributesCommand({
        QueueUrl: this.queueName,
        AttributeNames: ['FifoQueue', 'ContentBasedDeduplication']
      })
    )

    const isFifo = Attributes?.FifoQueue === 'true'

    if (!isFifo || !this.queueName.endsWith('.fifo')) {
      throw new NotFifoSqsQueueTypeException(this.queueName)
    }

    this.fifoContentBasedDedup =
      Attributes?.ContentBasedDeduplication === 'true'
  }

  /**
   * Generate a deduplication id for the job.
   */
  private genDedupId(body: string) {
    const hash = createHash('sha256').update(body).digest('hex')

    return `${hash}:${Date.now()}`.slice(0, 128)
  }

  public constructor(
    con: string,
    client: any = null,
    options?: ConnectionOptions['options']
  ) {
    super(con, client, options)

    const config = Config.get(`queue.connections.${con}`)

    this.type = options?.type || config?.type || 'standard'
    this.region = options?.region || config?.region || Env('AWS_REGION')
    this.awsAccessKeyId =
      options?.awsAccessKeyId ||
      config?.awsAccessKeyId ||
      Env('AWS_ACCESS_KEY_ID')
    this.awsSecretAccessKey =
      options?.awsSecretAccessKey ||
      config?.awsSecretAccessKey ||
      Env('AWS_SECRET_ACCESS_KEY')

    this.fifoGroupId =
      options?.messageGroupId || config?.messageGroupId || 'default'
    this.dlqFifoGroupId =
      options?.dlqMessageGroupId || config?.dlqMessageGroupId || 'dlq'

    if (
      Is.Boolean(
        options?.contentBasedDeduplication ?? config?.contentBasedDeduplication
      )
    ) {
      this.fifoContentBasedDedup = Boolean(
        options?.contentBasedDeduplication ?? config?.contentBasedDeduplication
      )
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
      connect: true,
      saveOnFactory: true
    })

    if (!options.connect) {
      return
    }

    if (this.isConnected && !options.force) {
      return
    }

    let sqsClientOptions: any = {
        region: this.region,
        credentials: {
            accessKeyId: this.awsAccessKeyId,
            secretAccessKey: this.awsSecretAccessKey
        }
    } 

    /**
     * If the AWS_SESSION_TOKEN is set, it means that the session is running inside
     * AWS. In this case, we can't set any options to SQSClient, otherwise the client
     * will fail to authenticate.
     */
    if (Env('AWS_SESSION_TOKEN')) {
        sqsClientOptions = {}
    }

    this.client = new SQSClient(sqsClientOptions)
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

    this.client.destroy()

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
    const cmd = new PurgeQueueCommand({ QueueUrl: this.queueName })

    await this.client.send(cmd)

    if (this.deadletter) {
      const cmd = new PurgeQueueCommand({ QueueUrl: this.deadletter })

      await this.client.send(cmd)
    }
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
  public async add(data: any) {
    data = Is.Object(data) ? JSON.stringify(data) : String(data)

    const params: any = {
      QueueUrl: this.queueName,
      MessageBody: data
    }

    if (this.type === 'fifo') {
      await this.ensureFifoAttrsLoaded()

      params.MessageGroupId = this.fifoGroupId

      if (!this.fifoContentBasedDedup) {
        params.MessageDeduplicationId = this.genDedupId(data)
      }
    }

    const cmd = new SendMessageCommand(params)

    await this.client.send(cmd)
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
    const params: any = {
      QueueUrl: this.queueName,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20,
      MessageSystemAttributeNames: ['All', 'ApproximateReceiveCount']
    }

    if (this.type === 'fifo') {
      params.ReceiveRequestAttemptId = Uuid.generate()
    }

    const cmd = new ReceiveMessageCommand(params)

    const { Messages } = await this.client.send(cmd)

    if (!Messages?.length) {
      return null
    }

    const job = Messages[0]
    const { Body, ...rest } = job
    const data = Is.Json(Body) ? JSON.parse(Body) : Body
    const receiveCount = Number(job.Attributes?.ApproximateReceiveCount || '1')
    const attempts = Math.max(this.attempts - receiveCount, 0)

    if (this.visibilityTimeout) {
      await this.changeJobVisibility(
        job.ReceiptHandle!,
        this.msToS(this.visibilityTimeout)
      )
    }

    return {
      id: job.ReceiptHandle,
      attempts,
      data,
      metadata: rest
    } as any
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
    return null
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
    const cmd = new GetQueueAttributesCommand({
      QueueUrl: this.queueName,
      AttributeNames: ['All', 'ApproximateNumberOfMessages']
    })

    const { Attributes } = await this.client.send(cmd)

    return Number(Attributes?.ApproximateNumberOfMessages || 0)
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
    const cmd = new DeleteMessageCommand({
      QueueUrl: this.queueName,
      ReceiptHandle: id
    })

    await this.client.send(cmd)

    AwsSqsDriver.ackedIds.add(id)
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
    const job = await this.pop()
    const requeueJitterMs = Math.floor(Math.random() * this.workerInterval)

    if (!job) {
      return
    }

    AwsSqsDriver.ackedIds.delete(job.id)

    try {
      await processor({
        id: job.id,
        attempts: job.attempts,
        data: job.data
      })

      if (!AwsSqsDriver.ackedIds.has(job.id)) {
        await this.changeJobVisibility(
          job.id,
          this.msToS(this.noAckDelayMs + requeueJitterMs)
        )
      }
    } catch (err) {
      const receiveCount = Number(
        job.metadata.Attributes?.ApproximateReceiveCount ?? '1'
      )
      const attempts = Math.max(this.attempts - receiveCount, 0)
      const shouldRetry = attempts > 0

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

      if (shouldRetry) {
        const delay = this.calculateBackoffDelay(job.attempts)

        await this.changeJobVisibility(
          job.id,
          this.msToS(delay + requeueJitterMs)
        )

        return
      }

      if (this.deadletter) {
        await this.sendJobToDLQ(job)
      }

      await this.ack(job.id)
    }
  }

  /**
   * Send a job to the deadletter quue.
   */
  private async sendJobToDLQ(job: any) {
    if (Is.Object(job.data)) {
      job.data = JSON.stringify(job.data)
    }

    const params: any = {
      QueueUrl: this.deadletter,
      MessageBody: job.data
    }

    if (this.type === 'fifo' || this.deadletter?.endsWith?.('.fifo')) {
      params.MessageGroupId = this.dlqFifoGroupId
      params.MessageDeduplicationId = this.genDedupId(job.data)
    }

    const cmd = new SendMessageCommand(params)

    await this.client.send(cmd)
  }

  /**
   * Change the job visibility values in SQS.
   */
  private async changeJobVisibility(id: string, seconds: number) {
    const cmd = new ChangeMessageVisibilityCommand({
      QueueUrl: this.queueName,
      ReceiptHandle: id,
      VisibilityTimeout: Math.max(0, Math.min(43200, Math.floor(seconds)))
    })

    await this.client.send(cmd)
  }
}
