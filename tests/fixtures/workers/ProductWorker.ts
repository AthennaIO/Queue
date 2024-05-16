/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Worker, BaseWorker } from '#src'
import { PRODUCTS } from '#tests/fixtures/constants/products'

@Worker()
export class ProductWorker extends BaseWorker {
  public static interval() {
    return 100
  }

  public static queue() {
    return 'products'
  }

  public async handle(data: unknown) {
    PRODUCTS.push(data)
  }
}
