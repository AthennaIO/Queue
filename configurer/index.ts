/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { BaseConfigurer } from '@athenna/artisan'
import { File, Path } from '@athenna/common'

export default class QueueConfigurer extends BaseConfigurer {
  public async configure() {
    const task = this.logger.task()

    task.addPromise(`Create queue.${Path.ext()} config file`, () => {
      return new File('./queue').copy(Path.config(`queue.${Path.ext()}`))
    })

    task.addPromise('Update commands of .athennarc.json', () => {
      return this.rc
        .setTo(
          'commands',
          'make:worker',
          '@athenna/queue/commands/MakeWorkerCommand'
        )
        .save()
    })

    task.addPromise('Update templates of .athennarc.json', () => {
      return this.rc
        .setTo(
          'templates',
          'worker',
          'node_modules/@athenna/queue/templates/worker.edge'
        )
        .save()
    })

    task.addPromise('Update providers of .athennarc.json', () => {
      return this.rc
        .pushTo('providers', '@athenna/queue/providers/QueueProvider')
        .pushTo('providers', '@athenna/queue/providers/WorkerProvider')
        .save()
    })

    await task.run()

    console.log()
    this.logger.success(
      'Successfully configured ({dim,yellow} @athenna/queue) library'
    )
  }
}
