/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Exception } from '@athenna/common'

export class SqsMaxDelayExceededException extends Exception {
  public constructor(queue: string, delaySeconds: number) {
    super({
      message: `The job delay of ${delaySeconds} seconds exceeds the maximum of 900 seconds (15 minutes) supported by AWS SQS for the queue ${queue}.`,
      code: 'E_SQS_MAX_DELAY_EXCEEDED_ERROR',
      help: 'AWS SQS only accepts a DelaySeconds between 0 and 900 for each message, so the job was not sent. Use a delay of up to 15 minutes, or use the "database" driver for jobs that must run further in the future.'
    })
  }
}
