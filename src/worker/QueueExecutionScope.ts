/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Config } from '@athenna/config'
import { Module } from '@athenna/common'
import type { Job, Context, ConnectionOptions } from '#src/types'

const otelModule = await Module.safeImport('@athenna/otel')

export type QueueExecutionScopeContext<T = unknown> = {
  name?: string
  connection?: string
  options?: ConnectionOptions['options']
  traceId?: string | null
  job: Job<T> | T
}

type QueueExecutionScopeOptions<T = unknown> = {
  beforeRun?: () => void
  afterRun?: () => void
  rTracerPlugin?: {
    id?: () => string
    runWithId?: <R>(callback: () => R) => R
  }
  resolveBinding?: (binding: any, context: QueueExecutionScopeContext<T>) => any
}

export class QueueExecutionScope<T = unknown> {
  public constructor(
    public readonly context: QueueExecutionScopeContext<T>,
    private readonly options: QueueExecutionScopeOptions<T> = {}
  ) {}

  public run<R>(callback: () => R): R {
    this.options.beforeRun?.()

    try {
      const result = this.runInTracingContext(callback)

      if (result instanceof Promise) {
        return result.finally(() => this.options.afterRun?.()) as R
      }

      this.options.afterRun?.()

      return result
    } catch (error) {
      this.options.afterRun?.()

      throw error
    }
  }

  public bind<TCallback extends (...args: any[]) => any>(handler: TCallback) {
    return ((...args: Parameters<TCallback>) =>
      this.run(() => handler(...args))) as TCallback
  }

  private runInTracingContext<R>(callback: () => R): R {
    const execute = () => {
      this.context.traceId =
        this.options.rTracerPlugin?.id?.() || this.context.traceId || null

      return this.runInOtelContext(callback)
    }

    if (this.options.rTracerPlugin?.runWithId) {
      return this.options.rTracerPlugin.runWithId(execute)
    }

    return execute()
  }

  private runInOtelContext<R>(callback: () => R): R {
    if (!Config.is('worker.otel.contextEnabled', true) || !otelModule) {
      return callback()
    }

    return otelModule.Otel.withContext(callback, {
      bindings: Config.get('worker.otel.contextBindings', []),
      resolveBinding: (binding: any) =>
        this.options.resolveBinding
          ? this.options.resolveBinding(binding, this.context)
          : binding.resolve(this.context as Context)
    })
  }
}
