/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { ServiceProvider } from '@athenna/ioc'
import { QueueImpl } from '#src/queue/QueueImpl'

export class QueueProvider extends ServiceProvider {
  public async register() {
    this.container.instance('athennaQueueOpts', undefined)
    this.container.transient('Athenna/Core/Queue', QueueImpl)
  }

  public async shutdown() {
    const queue = this.container.use('Athenna/Core/Queue')

    if (!queue) {
      return
    }

    await queue.closeAll()
  }
}
