/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { Job, ConnectionOptions } from '#src/types'

export type Context<T = any> = {
  name: string
  connection: string
  options: ConnectionOptions['options']
  traceId?: string
  job: Job<T>
}
