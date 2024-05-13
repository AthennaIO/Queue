/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Facade } from '@athenna/ioc'
import type { QueueImpl } from '#src/queue/QueueImpl'

export const Queue = Facade.createFor<QueueImpl>('Athenna/Core/Queue')
