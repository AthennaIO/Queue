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
import { Module, Path } from '@athenna/common'
import { Annotation, ServiceProvider } from '@athenna/ioc'
import type { BaseWorker } from '#src/workers/BaseWorker'

export class WorkerProvider extends ServiceProvider {
  /**
   * Hold the intervals for each worker so when shutting
   * down the application we can clear it.
   */
  public intervals = []

  /**
   * Hold the workers classes and aliases to set up the
   * intervals.
   */
  public workers: { alias: string; Worker: typeof BaseWorker }[] = []

  /**
   * Register the workers from `rc.workers` of `.athennarc.json`.
   */
  public async boot() {
    const workers = Config.get<string[]>('rc.workers', [])

    await workers.athenna.concurrently(async path => {
      const Worker = await Module.resolve(path, this.getMeta())

      if (Annotation.isAnnotated(Worker)) {
        this.registerWorkerByMeta(Worker)

        return
      }

      const alias = `App/Workers/${Worker.name}`

      this.container.transient(alias, Worker)

      this.workers.push({ alias, Worker })
    })

    this.intervals = this.workers.map(({ alias, Worker }) => {
      const queueName = Worker.queue()
      const interval = Worker.interval()

      return setInterval(async () => {
        const worker = this.container.safeUse(alias)
        const queue = worker.queue()

        if (await queue.isEmpty()) {
          return
        }

        Log.channelOrVanilla('worker').info({
          msg: 'processing new job',
          queue: queueName
        })

        await queue.process(worker.handle.bind(worker))

        const jobs = await queue.length()

        if (jobs) {
          Log.channelOrVanilla('worker').info({
            msg: 'still has jobs to process',
            queue: queueName,
            jobs
          })
        }
      }, interval)
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
  public async registerWorkerByMeta(Worker: typeof BaseWorker) {
    const meta = Annotation.getMeta(Worker)

    this.container[meta.type](meta.alias, Worker)

    this.workers.push({ alias: meta.alias, Worker })

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
