/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Exception } from '@athenna/common'

export class NotFoundWorkerTaskException extends Exception {
  public constructor(taskName: string) {
    const message = `The worker task ${taskName} has not been found.`

    super({
      message,
      code: 'E_NOT_FOUND_WORKER_TASK_ERROR',
      help: `Make sure that the worker task ${taskName} is registered and started. Use the Worker.getWorkerTasks() method to get all registered worker tasks.`
    })
  }
}
