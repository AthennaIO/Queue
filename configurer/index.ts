/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { File, Path } from '@athenna/common'
import { BaseConfigurer } from '@athenna/artisan'

export default class QueueConfigurer extends BaseConfigurer {
  public async configure() {
    const task = this.logger.task()

    const willUseDatabaseDriver = await this.prompt.confirm(
      `Are you going to use the ${this.paint.yellow(
        '"database"'
      )} driver with a SQL database? Confirm it to create the ${this.paint.yellow(
        '"jobs migration"'
      )}.`
    )

    if (willUseDatabaseDriver) {
      task.addPromise('Create jobs migration', async () => {
        let [date, time] = new Date().toISOString().split('T')

        date = date.replace(/-/g, '_')
        time = time.split('.')[0].replace(/:/g, '')

        return new File('./migration').copy(
          Path.migrations(`${date}_${time}_create_jobs_table.${Path.ext()}`)
        )
      })
    }

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
