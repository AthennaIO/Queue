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

import { Utils } from '#src/utils'
import { createHash } from 'node:crypto'
import { Driver } from '#src/drivers/Driver'
import { Is, Options, Uuid } from '@athenna/common'
import type { ConnectionOptions } from '#src/types'
import { ConnectionFactory } from '#src/factories/ConnectionFactory'
import { QueueExecutionScope } from '#src/worker/QueueExecutionScope'
import { QueueJobPropagationHelper } from '#src/helpers/QueueJobPropagationHelper'
import { AwsSqsDriverExceptionHandler } from '#src/handlers/AwsSqsDriverExceptionHandler'
import { NotFifoSqsQueueTypeException } from '#src/exceptions/NotFifoSqsQueueTypeException'
import { SqsMaxDelayExceededException } from '#src/exceptions/SqsMaxDelayExceededException'
import { FifoSqsDelayNotSupportedException } from '#src/exceptions/FifoSqsDelayNotSupportedException'

export class AwsSqsDriver extends Driver<SQSClient> {
  /**
   * Set the acked ids of the driver.
   */
  private static ackedIds = new Set<string>()

  /**
   * The maximum `DelaySeconds` accepted by SQS for a single message
   * (15 minutes).
   */
  public static readonly MAX_DELAY_SECONDS = 900

  private type: 'standard' | 'fifo'
  private region: string
  private endpoint?: string
  private awsAccessKeyId: string
  private awsSecretAccessKey: string

  /**
   * Convert milliseconds to seconds.
   */
  public msToS(v: number) {
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
    this.endpoint = options?.endpoint || config?.endpoint || Env('AWS_ENDPOINT')
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
     *
     * Also if accessKeyId or secretAccessKey is not defined, we should also not set
     * the credentials options and let the SDK try to solve the authentication.
     */
    if (!Is.Defined(this.awsAccessKeyId) || Env('AWS_SESSION_TOKEN')) {
      sqsClientOptions = {}
    }

    /**
     * Apply the custom endpoint last so it survives the credentials reset
     * above (e.g. LocalStack with blank credentials).
     */
    if (Is.Defined(this.endpoint)) {
      sqsClientOptions.endpoint = this.endpoint
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
    await this.send(data, 0)
  }

  /**
   * Add a new job to the queue that only becomes available after a delay
   * in milliseconds or at an exact `Date`. The delay is sent to SQS as the
   * message `DelaySeconds`, rounded up to the next second, so it can't be
   * longer than 15 minutes (900 seconds). FIFO queues don't support a delay
   * per message, so only a delay `<= 0` is accepted for them.
   *
   * @example
   * ```ts
   * await Queue.queue('mail').later(5000, { email: 'lenon@athenna.io' })
   * ```
   */
  public async later(delay: number | Date, data: any) {
    const delaySeconds = Math.ceil(Utils.resolveDelayMs(delay) / 1000)

    if (delaySeconds > 0 && this.type === 'fifo') {
      throw new FifoSqsDelayNotSupportedException(this.queueName)
    }

    if (delaySeconds > AwsSqsDriver.MAX_DELAY_SECONDS) {
      throw new SqsMaxDelayExceededException(this.queueName, delaySeconds)
    }

    await this.send(data, delaySeconds)
  }

  /**
   * Send the job to SQS. A `delaySeconds` of `0` sends the message without
   * `DelaySeconds`, exactly like `add()` always did.
   */
  private async send(data: any, delaySeconds: number) {
    data = Is.Object(data) ? JSON.stringify(data) : String(data)

    const params: any = {
      QueueUrl: this.queueName,
      MessageBody: data
    }

    if (delaySeconds > 0) {
      params.DelaySeconds = delaySeconds
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

    const heartbeatDelay = this.calculateHeartbeatDelay()

    let heartbeatTimeout: NodeJS.Timeout
    let scope: QueueExecutionScope | null = null

    const startHeartbeat = () => {
      if (heartbeatDelay <= 0) {
        return
      }

      const heartbeat = scope?.bind(async () => {
        await this.changeJobVisibility(
          job.id,
          this.msToS(this.visibilityTimeout)
        )
      })

      heartbeatTimeout = setInterval(() => {
        const changeVisibility =
          heartbeat ||
          (() =>
            this.changeJobVisibility(
              job.id,
              this.msToS(this.visibilityTimeout)
            ))

        Promise.resolve(changeVisibility()).catch(() => {})
      }, heartbeatDelay)
    }

    const stopHeartbeat = () => {
      if (!heartbeatTimeout) {
        return
      }

      clearInterval(heartbeatTimeout)
      heartbeatTimeout = undefined
    }

    const workerJob = {
      id: job.id,
      attempts: job.attempts,
      data: job.data
    }

    const executionJob = QueueJobPropagationHelper.getJob(workerJob)

    await this.runScopedQueueProcessor(
      processor,
      workerJob,
      async () => {
        try {
          startHeartbeat()

          await this.runWithTimeout(() => processor(executionJob))

          stopHeartbeat()

          if (!AwsSqsDriver.ackedIds.has(job.id)) {
            await this.changeJobVisibility(
              job.id,
              this.msToS(this.noAckDelayMs + requeueJitterMs)
            )
          }
        } catch (error) {
          await new AwsSqsDriverExceptionHandler().handle({
            job,
            error,
            driver: this,
            stopHeartbeat,
            requeueJitterMs
          })
        }
      },
      executionScope => {
        scope = executionScope
      }
    )
  }

  /**
   * Send a job to the deadletter queue.
   */
  public async sendJobToDLQ(job: any) {
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
  public async changeJobVisibility(id: string, seconds: number) {
    const cmd = new ChangeMessageVisibilityCommand({
      QueueUrl: this.queueName,
      ReceiptHandle: id,
      VisibilityTimeout: Math.max(0, Math.min(43200, Math.floor(seconds)))
    })

    await this.client.send(cmd)
  }
}
