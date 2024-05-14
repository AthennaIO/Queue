/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { sep } from 'node:path'
import { Log } from '@athenna/logger'
import { Exec, Module, Path } from '@athenna/common'
import { Annotation, ServiceProvider } from '@athenna/ioc'

export class WorkerProvider extends ServiceProvider {
  public intervals = []

  /**
   * Register the workers from `rc.workers` of `.athennarc.json`.
   */
  public async boot() {
    const workers = Config.get<string[]>('rc.workers', [])

    await Exec.concurrently(workers, async path => {
      const Worker = await Module.resolve(path, this.getMeta())

      if (Annotation.isAnnotated(Worker)) {
        this.registerWorkerByMeta(Worker)

        return
      }

      const queueName = Worker.queue()
      const alias = `App/Workers/${Worker.name}`
      const worker = this.container.transient(alias, Worker).use(alias)

      const interval = setInterval(async () => {
        const queue = worker.queue()

        if (queue.isEmpty()) {
          return
        }

        if (Config.is('rc.bootLogs', true)) {
          Log.channelOrVanilla('application').info(
            'Processing workers of %s queue',
            queueName
          )
        }

        await queue.process(worker.handle.bind(worker))

        const jobs = queue.length()

        if (jobs) {
          if (Config.is('rc.bootLogs', true)) {
            Log.channelOrVanilla('application').info(
              'still has %n jobs to process on %s queue',
              jobs,
              queue
            )
          }
        }
      }, Worker.interval())

      this.intervals.push(interval)
    })
  }

  /**
   * Shutdown the workers by clearing the it intervals.
   */
  public async shutdown() {
    this.intervals.forEach(interval => clearInterval(interval))
  }

  /**
   * Register the worker by the annotation metadata.
   */
  public async registerWorkerByMeta(worker: unknown) {
    const meta = Annotation.getMeta(worker)

    this.container[meta.type](meta.alias, worker)

    if (meta.name) {
      this.container.alias(meta.name, meta.alias)
    }

    if (meta.camelAlias) {
      this.container.alias(meta.camelAlias, meta.alias)
    }

    return meta
  }

  /**
   * Get the meta URL of the project.
   */
  public getMeta() {
    return Config.get('rc.parentURL', Path.toHref(Path.pwd() + sep))
  }
}
