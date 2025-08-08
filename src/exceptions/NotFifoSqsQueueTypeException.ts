/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path, Exception } from '@athenna/common'

export class NotFifoSqsQueueTypeException extends Exception {
  public constructor(queue: string) {
    const message = `The queue ${queue} is not configured as a FIFO queue in AWS SQS.`

    super({
      message,
      code: 'E_NOT_FIFO_SQS_QUEUE_TYPE_ERROR',
      help: `The queue ${queue} is not configured as a FIFO queue in AWS SQS. Change your queue type to fifo or update the type to standard in your config/queue.${Path.ext()} file.`
    })
  }
}
