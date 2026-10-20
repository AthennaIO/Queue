/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path, Exception } from '@athenna/common'

export class FifoSqsDelayNotSupportedException extends Exception {
  public constructor(queue: string) {
    super({
      message: `The queue ${queue} is a FIFO queue and AWS SQS does not support delaying a single message in FIFO queues.`,
      code: 'E_FIFO_SQS_DELAY_NOT_SUPPORTED_ERROR',
      help: `AWS SQS only lets FIFO queues set the delay at the queue level (the queue's DelaySeconds attribute), never per message, so the job was not sent. Use add() instead of later() for this queue, or use a standard queue (type "standard" in your config/queue.${Path.ext()} file) for delayed jobs.`
    })
  }
}
