/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Module } from '@athenna/common'
import { SQSClient, ReceiveMessageCommand, DeleteMessageBatchCommand } from '@aws-sdk/client-sqs'

export class BaseTest {
  /**
   * Drain the SQS queue instead of purging it.
   */
  public async drainAwsSqsQueue(queue: string, maxPolls = 30) {
    const sqs = new SQSClient({
      region: Env('AWS_REGION'),
      credentials: {
        accessKeyId: Env('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Env('AWS_SECRET_ACCESS_KEY')
      }
    })

    for (let i = 0; i < maxPolls; i++) {
      const res = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queue,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 0,
          AttributeNames: ['All'],
          MessageAttributeNames: ['All']
        })
      )

      const messages = res.Messages ?? []
      if (messages.length === 0) break

      await sqs.send(
        new DeleteMessageBatchCommand({
          QueueUrl: queue,
          Entries: messages.map(m => ({
            Id: m.MessageId!,
            ReceiptHandle: m.ReceiptHandle!
          }))
        })
      )
    }
  }

  /**
   * Safe import a module, avoiding cache and if
   * the module is not found, return null.
   */
  public async import<T = any>(path: string): Promise<T> {
    try {
      return await Module.get(import(`${path}.js?version=${Math.random()}`))
    } catch (error) {
      console.log(error)
      return null
    }
  }
}
