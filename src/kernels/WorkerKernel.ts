/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * @athenna/http
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import 'reflect-metadata'

import { debug } from '#src/debug'
import { Config } from '@athenna/config'
import { Queue } from '#src/facades/Queue'
import { File, Path, Module } from '@athenna/common'
import { sep, isAbsolute, resolve } from 'node:path'
import { Annotation, type ServiceMeta } from '@athenna/ioc'

export class WorkerKernel {
  /**
   * Register the cls-rtracer plugin in the Worker.
   */
  public async registerRTracer(): Promise<void> {
    const rTracerPlugin = await Module.safeImport('cls-rtracer')

    if (Config.is('worker.rTracer.enabled', false)) {
      debug(
        'Not able to register rTracer plugin. Set the worker.rTracer.enabled configuration as true.'
      )

      return
    }

    if (!rTracerPlugin) {
      debug('Not able to register tracer plugin. Install cls-rtracer package.')

      return
    }

    Queue.worker().setRTracerPlugin(rTracerPlugin)
  }

  /**
   * Register the job logger in the Worker.
   */
  public async registerLogger(): Promise<void> {
    if (Config.is('worker.logger.enabled', false)) {
      debug(
        'Not able to register worker job logger. Enable it in your worker.logger.enabled configuration.'
      )

      return
    }

    Queue.worker().setLogger(true)
  }

  /**
   * Register all the workers found inside "rc.workers" config
   * inside the service provider.
   */
  public async registerWorkers(): Promise<void> {
    const workers = Config.get<string[]>('rc.workers', [])

    await workers.athenna.concurrently(async path => {
      const Worker = await Module.resolve(path, this.getMeta())

      if (Annotation.isAnnotated(Worker)) {
        this.registerUsingMeta(Worker)

        return
      }

      ioc.transient(`App/Queue/Workers/${Worker.name}`, Worker)

      Queue.worker()
        .task()
        .handler(ctx => {
          const worker = ioc.safeUse(`App/Queue/Workers/${Worker.name}`)

          return worker.handle(ctx)
        })
    })
  }

  /**
   * Register the route file by importing the file.
   */
  public async registerRoutes(path: string) {
    if (path.startsWith('#')) {
      await Module.resolve(path, this.getMeta())

      return
    }

    if (!isAbsolute(path)) {
      path = resolve(path)
    }

    if (!(await File.exists(path))) {
      return
    }

    await Module.resolve(path, this.getMeta())
  }

  /**
   * Register the workers using the meta information
   * defined by annotations.
   */
  private registerUsingMeta(target: any): ServiceMeta {
    const meta = Annotation.getMeta(target)
    const builder = Queue.worker().task()

    ioc[meta.type](meta.alias, target)

    if (meta.name) {
      builder.name(meta.name)
      ioc.alias(meta.name, meta.alias)
    }

    if (meta.camelAlias) {
      ioc.alias(meta.camelAlias, meta.alias)
    }

    builder.connection(meta.connection).handler(ctx => {
      const worker =
        ioc.use(meta.name) ||
        ioc.use(meta.camelAlias) ||
        ioc.safeUse(meta.alias)

      return worker.handle(ctx)
    })

    return meta
  }

  /**
   * Get the meta URL of the project.
   */
  private getMeta() {
    return Config.get('rc.parentURL', Path.toHref(Path.pwd() + sep))
  }
}
