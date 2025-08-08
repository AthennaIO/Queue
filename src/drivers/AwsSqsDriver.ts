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
import { Driver } from '#src/drivers/Driver'
import { Is, Options } from '@athenna/common'
import type { ConnectionOptions } from '#src/types'
import { ConnectionFactory } from '#src/factories/ConnectionFactory'

export class AwsSqsDriver extends Driver<SQSClient> {
  private region: string
  private awsAccessKeyId: string
  private awsSecretAccessKey: string

  public constructor(
    con: string,
    client: any = null,
    options?: ConnectionOptions['options']
  ) {
    super(con, client, options)

    const config = Config.get(`queue.connections.${con}`)

    this.region = options?.region || config?.region || Env('AWS_REGION')
    this.awsAccessKeyId =
      options?.awsAccessKeyId ||
      config?.awsAccessKeyId ||
      Env('AWS_ACCESS_KEY_ID')
    this.awsSecretAccessKey =
      options?.awsSecretAccessKey ||
      config?.awsSecretAccessKey ||
      Env('AWS_SECRET_ACCESS_KEY')
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

    this.client = new SQSClient({
      region: this.region,
      credentials: {
        accessKeyId: this.awsAccessKeyId,
        secretAccessKey: this.awsSecretAccessKey
      }
    })
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
    if (Is.Object(data)) {
      data = JSON.stringify(data)
    }

    const cmd = new SendMessageCommand({
      QueueUrl: this.queueName,
      MessageBody: data
    })

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
    const cmd = new ReceiveMessageCommand({
      QueueUrl: this.queueName,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20,
      MessageSystemAttributeNames: ['All']
    })

    const { Messages } = await this.client.send(cmd)

    if (!Messages?.length) {
      return null
    }

    const job = Messages[0]
    const { Body, ...rest } = job
    const data = JSON.parse(Body)
    const receiveCount = Number(job.Attributes?.ApproximateReceiveCount || '1')
    const attemptsLeft = Math.max(this.attempts - receiveCount, 0)

    return {
      id: job.ReceiptHandle,
      attemptsLeft,
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
    const cmd = new ReceiveMessageCommand({
      QueueUrl: this.queueName,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 0,
      VisibilityTimeout: 5,
      AttributeNames: ['All']
    })

    const { Messages } = await this.client.send(cmd)

    if (!Messages?.length) {
      return null
    }

    const job = Messages[0]

    await this.changeJobVisibility(job.ReceiptHandle, 0)

    const { Body, ...rest } = job
    const data = Is.Json(Body) ? JSON.parse(Body) : Body
    const receiveCount = Number(job.Attributes?.ApproximateReceiveCount || '1')
    const attemptsLeft = Math.max(this.attempts - receiveCount, 0)

    return {
      id: job.ReceiptHandle!,
      attemptsLeft,
      data,
      metadata: rest
    } as any
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
      AttributeNames: ['ApproximateNumberOfMessages']
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

    if (!job) {
      return
    }

    try {
      await processor(job.data)
      await this.ack(job.id)
    } catch (err) {
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

      const receiveCount = Number(
        job.metadata.Attributes?.ApproximateReceiveCount || '1'
      )

      const shouldRetry = receiveCount < this.attempts

      if (shouldRetry) {
        const delay = this.calculateBackoffDelay(receiveCount)

        await this.changeJobVisibility(job.id, delay)

        return
      }

      if (this.deadletter) {
        await this.sendJobToDLQ(job)
        await this.ack(job.id)
      }
    }
  }

  /**
   * Send a job to the deadletter quue.
   */
  private async sendJobToDLQ(job: any) {
    if (Is.Object(job.data)) {
      job.data = JSON.stringify(job.data)
    }

    const cmd = new SendMessageCommand({
      QueueUrl: this.deadletter,
      MessageBody: job.data
    })

    await this.client.send(cmd)
  }

  /**
   * Change the job visibility values in SQS.
   */
  private async changeJobVisibility(id: string, visibility: number) {
    const cmd = new ChangeMessageVisibilityCommand({
      QueueUrl: this.queueName,
      ReceiptHandle: id,
      VisibilityTimeout: visibility
    })

    await this.client.send(cmd)
  }
}
