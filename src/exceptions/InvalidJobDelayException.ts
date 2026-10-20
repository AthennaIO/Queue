/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Exception } from '@athenna/common'

export class InvalidJobDelayException extends Exception {
  public constructor(delay: unknown) {
    const received =
      delay instanceof Date ? 'an invalid Date' : `${typeof delay} ${delay}`

    super({
      message: `The delay of a job must be a finite number of milliseconds or a valid Date, received ${received}.`,
      code: 'E_INVALID_JOB_DELAY_ERROR',
      help: 'Pass the delay in milliseconds, like Queue.later(5000, data) to make the job available in 5 seconds, or pass the exact instant as a Date, like Queue.later(new Date("2026-10-20T16:00:00Z"), data).'
    })
  }
}
