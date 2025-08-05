/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

export type Context<T = any> = {
  id: string
  data: T
  attemptsLeft: number
  queue: string
  status: 'pending' | 'processing'
  createdAt: Date
  updatedAt: Date
}
