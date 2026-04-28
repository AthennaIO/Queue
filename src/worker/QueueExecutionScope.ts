/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import {
  trace,
  context,
  propagation,
  SpanStatusCode,
  type Context as OtelContext
} from '@opentelemetry/api'

import { Config } from '@athenna/config'
import { Is, Module } from '@athenna/common'
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
  carrier?: Record<string, string | string[] | undefined>
  currentContextValues?: Record<string, unknown>
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
      const result = this.runInOtelContext(callback)

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

  private runInOtelContext<R>(callback: () => R): R {
    if (!Config.is('worker.otel.contextEnabled', true) || !otelModule) {
      return callback()
    }

    let parentContext = this.extractContext(this.options.carrier)

    if (Object.keys(this.options.currentContextValues || {}).length) {
      parentContext = this.restoreCurrentContextValues(
        this.options.currentContextValues,
        parentContext
      )
    }

    return otelModule.Otel.withContext(
      () => {
        return this.runInsideSpan(callback)
      },
      {
        ctx: parentContext,
        bindings: Config.get('worker.otel.contextBindings', []),
        resolveBinding: (binding: any) =>
          this.options.resolveBinding
            ? this.options.resolveBinding(binding, this.context)
            : binding.resolve(this.context as Context)
      }
    )
  }

  private getSpanName() {
    if (this.context.name) {
      return `queue.process.${this.context.name}`
    }

    if (this.context.connection) {
      return `queue.process.${this.context.connection}`
    }

    return 'queue.process'
  }

  private runInsideSpan<R>(callback: () => R): R {
    const tracer = trace.getTracer('@athenna/queue')

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return tracer.startActiveSpan(this.getSpanName(), span => {
      this.context.traceId = span.spanContext().traceId

      try {
        const result = callback()

        if (result instanceof Promise) {
          return result
            .then(value => {
              span.end()

              return value
            })
            .catch(error => {
              throw this.handleSpanError(error, span)
            }) as R
        }

        span.end()

        return result
      } catch (error) {
        throw this.handleSpanError(error, span)
      }
    })
  }

  private handleSpanError(error: any, span: any) {
    span.recordException(error)
    span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message })
    span.end()

    return error
  }

  private extractContext(
    carrier?: Record<string, string | string[] | undefined>
  ) {
    if (!carrier || !Object.keys(carrier).length) {
      return otelModule.Otel.context.active()
    }

    if (Is.Function(otelModule.Otel.extractContext)) {
      return otelModule.Otel.extractContext(carrier)
    }

    return propagation.extract(context.active(), carrier)
  }

  private restoreCurrentContextValues(
    values: Record<string, unknown>,
    parentContext: OtelContext
  ) {
    if (Is.Function(otelModule.Otel.restoreCurrentContextValues)) {
      return otelModule.Otel.restoreCurrentContextValues(values, parentContext)
    }

    let nextContext = parentContext
    const store = new Map<string | symbol, unknown>()

    for (const [key, value] of Object.entries(values)) {
      store.set(key, value)
      nextContext = nextContext.setValue(key as any, value)
    }

    return nextContext.setValue(this.getContextBagSymbol(), store)
  }

  private getContextBagSymbol() {
    return (
      otelModule?.Otel?.contextBagSymbol ||
      Symbol.for('athenna.otel.currentContextBag')
    )
  }
}
