/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { constants } from '#tests/fixtures/constants/index'

export class HelloWorker {
  public async handle() {
    constants.RUN_MAP.helloWorker = true
  }
}
