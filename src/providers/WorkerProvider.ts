/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { ServiceProvider } from '@athenna/ioc'
import { WorkerImpl } from '#src/worker/WorkerImpl'

export class WorkerProvider extends ServiceProvider {
  public async register() {
    this.container.transient('Athenna/Core/Worker', WorkerImpl)
  }

  public async shutdown() {
    const worker = this.container.use<WorkerImpl>('Athenna/Core/Worker')

    if (!worker) {
      return
    }

    worker.close()
  }
}
