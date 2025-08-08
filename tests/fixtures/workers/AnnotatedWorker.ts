/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Worker } from '#src'
import { constants } from '#tests/fixtures/constants/index'

@Worker({
  type: 'singleton',
  alias: 'decoratedWorker',
  camelAlias: 'annotatedWorker'
})
export class AnnotatedWorker {
  public async handle() {
    constants.RUN_MAP.decoratedWorker = true
    constants.RUN_MAP.annotatedWorker = true
  }
}
