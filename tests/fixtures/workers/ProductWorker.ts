/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Worker, BaseWorker, type Context } from '#src'
import { PRODUCTS } from '#tests/fixtures/constants/products'

@Worker()
export class ProductWorker extends BaseWorker {
  public static interval() {
    return 100
  }

  public static queue() {
    return 'products'
  }

  public static deadletter() {
    return 'products-deadletter'
  }

  public static attempts() {
    return 2
  }

  public static backoff() {
    return {
      type: 'fixed',
      delay: 1000,
      jitter: 0.5
    }
  }

  public async handle(data: Context) {
    if (data.data.failOnAllAttempts) {
      throw new Error('testing')
    }

    if (data.data.failOnFirstAttemptOnly && data.attemptsLeft >= 1) {
      throw new Error('testing')
    }

    PRODUCTS.push(data.data)
  }
}
