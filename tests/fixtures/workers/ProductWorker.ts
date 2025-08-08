/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Worker, type Context } from '#src'
import { constants } from '#tests/fixtures/constants/index'

@Worker({ connection: 'vanilla' })
export class ProductWorker {
  public async handle(ctx: Context) {
    if (ctx.job.data.failOnAllAttempts) {
      throw new Error('testing')
    }

    if (ctx.job.data.failOnFirstAttemptOnly && ctx.job.attemptsLeft >= 1) {
      throw new Error('testing')
    }

    constants.PRODUCTS.push(ctx.job.data)
    constants.RUN_MAP.productWorker = true
  }
}
