/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Exception } from '@athenna/common'

export class JobNotProcessingException extends Exception {
  public constructor(id: string) {
    const message = `The job with id ${id} is not being processed and cannot be removed.`

    super({
      message,
      code: 'E_JOB_NOT_PROCESSING_ERROR'
    })
  }
}
