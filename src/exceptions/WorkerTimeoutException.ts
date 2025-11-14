/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Exception } from '@athenna/common'

export class WorkerTimeoutException extends Exception {
  public constructor(taskName: string) {
    const message = `The worker task ${taskName} has timed out.`

    super({
      message,
      code: 'E_WORKER_TIMEOUT_ERROR'
    })
  }
}
