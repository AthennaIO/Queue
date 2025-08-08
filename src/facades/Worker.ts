/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Facade } from '@athenna/ioc'
import type { WorkerImpl } from '#src/worker/WorkerImpl'

export const Worker = Facade.createFor<WorkerImpl>('Athenna/Core/Worker')
