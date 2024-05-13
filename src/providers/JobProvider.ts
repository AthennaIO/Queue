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

export class JobProvider extends ServiceProvider {
  public intervals = []

  public async boot() {
    await this.registerJobs()
  }

  public async shutdown() {
    this.intervals.forEach(interval => clearInterval(interval))
  }

  public async registerJobs() {
    const jobs = Config.get<string[]>('rc.jobs', [])

    await Exec.concurrently(jobs, async path => {
      const Job = await Module.resolve(path, this.getMeta())

      if (Annotation.isAnnotated(Job)) {
        this.registerJobByMeta(Job)

        return
      }

      const queueName = Job.queue()
      const alias = `App/Jobs/${Job.name}`
      const job = this.container.transient(alias, Job).use(alias)

      const interval = setInterval(async () => {
        const queue = job.queue()

        if (queue.isEmpty()) {
          return
        }

        if (Config.is('rc.bootLogs', true)) {
          Log.channelOrVanilla('application').info(
            'Processing jobs of %s queue',
            queueName
          )
        }

        await queue.process(job.handle.bind(job))

        const jobsLength = queue.length()

        if (jobsLength) {
          Log.channelOrVanilla('application').info(
            'still has %n jobs to process on %s queue',
            jobsLength,
            queue
          )
        }
      }, 5000)

      this.intervals.push(interval)
    })

    await this.registerNamedJobs()
  }

  public async registerJobByMeta(job: unknown) {
    const meta = Annotation.getMeta(job)

    this.container[meta.type](meta.alias, job)

    if (meta.name) {
      this.container.alias(meta.name, meta.alias)
    }

    if (meta.camelAlias) {
      this.container.alias(meta.camelAlias, meta.alias)
    }

    return meta
  }

  public async registerNamedJobs() {
    const namedJobs = Config.get<Record<string, string>>('rc.namedJobs', {})

    await Exec.concurrently(Object.keys(namedJobs), async key => {
      const Job = await Module.resolve(namedJobs[key], this.getMeta())

      if (Annotation.isAnnotated(Job)) {
        this.registerJobByMeta(Job)

        return
      }

      const { alias, namedAlias } = this.getNamedJobAlias(key, Job)

      this.container.bind(alias, Job).alias(namedAlias, alias)
    })
  }

  /**
   * Get the meta URL of the project.
   */
  public getMeta() {
    return Config.get('rc.parentURL', Path.toHref(Path.pwd() + sep))
  }

  /**
   * Fabricate the named job aliases.
   */
  public getNamedJobAlias(name: string, Job: any) {
    return {
      alias: `App/Jobs/${Job.name}`,
      namedAlias: `App/Jobs/Names/${name}`
    }
  }
}
