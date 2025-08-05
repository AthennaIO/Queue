/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { Context } from '#src'
import { BaseWorker } from '#src/workers/BaseWorker'

export class HelloWorker extends BaseWorker {
  public async handle(data: Context) {
    console.log(data)
  }
}
