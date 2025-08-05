/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Exception } from '@athenna/common'

export class NotFoundJobException extends Exception {
  public constructor(id: string) {
    const message = `The job with ID ${id} has not been found.`

    super({
      message,
      code: 'E_NOT_FOUND_JOB_ERROR'
    })
  }
}
