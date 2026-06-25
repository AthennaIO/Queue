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
  public constructor(taskName: string, timeout?: number) {
    const message = timeout
      ? `The worker task ${taskName} has timed out after ${timeout}ms.`
      : `The worker task ${taskName} has timed out.`

    super({
      message,
      code: 'E_WORKER_TIMEOUT_ERROR',
      help:
        'A single job exceeded the configured `processTimeout` and was ' +
        'abandoned so the consumer loop could keep draining the queue. The ' +
        'job was routed to retry/deadletter. If this repeats, the handler ' +
        'has an unbounded await (HTTP/DB call with no timeout) — bound it at ' +
        'the source, this timeout is only a backstop.'
    })
  }
}
