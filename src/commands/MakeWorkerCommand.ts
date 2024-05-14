/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path } from '@athenna/common'
import { BaseCommand, Argument } from '@athenna/artisan'

export class MakeWorkerCommand extends BaseCommand {
  @Argument({
    description: 'The worker name.'
  })
  public name: string

  public static signature(): string {
    return 'make:worker'
  }

  public static description(): string {
    return 'Make a new worker file.'
  }

  public async handle(): Promise<void> {
    this.logger.simple('({bold,green} [ MAKING WORKER ])\n')

    const destination = Config.get(
      'rc.commands.make:worker.destination',
      Path.workers()
    )

    const file = await this.generator
      .fileName(this.name)
      .destination(destination)
      .template('worker')
      .setNameProperties(true)
      .make()

    this.logger.success(
      `Worker ({yellow} "${file.name}") successfully created.`
    )

    const importPath = this.generator.getImportPath()

    await this.rc.pushTo('workers', importPath).save()

    this.logger.success(
      `Athenna RC updated: ({dim,yellow} [ workers += "${importPath}" ])`
    )
  }
}
