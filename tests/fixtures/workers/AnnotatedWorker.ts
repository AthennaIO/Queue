/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Worker, BaseWorker, type Context } from '#src'

@Worker({
  type: 'singleton',
  alias: 'annotatedWorker'
})
export class AnnotatedWorker extends BaseWorker {
  public async handle(data: Context) {
    console.log(data)
  }
}
