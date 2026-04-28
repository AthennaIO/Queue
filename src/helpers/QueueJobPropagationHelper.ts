/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { Job } from '#src/types'
import { Is, Module } from '@athenna/common'
import { context, propagation } from '@opentelemetry/api'

const otelModule = await Module.safeImport('@athenna/otel')
const QUEUE_ENVELOPE_KEY = '__athenna_queue__'
const QUEUE_ENVELOPE_VERSION = 1

type QueueTraceCarrier = Record<string, string | string[] | undefined>

type QueueEnvelopeMetadata = {
  version: number
  carrier: QueueTraceCarrier
  currentContextValues: Record<string, unknown>
}

type QueueEnvelope<T = unknown> = {
  [QUEUE_ENVELOPE_KEY]: QueueEnvelopeMetadata
  payload: T
}

export class QueueJobPropagationHelper {
  public static createEnvelope<T = unknown>(data: T) {
    if (QueueJobPropagationHelper.isEnvelope(data)) {
      return data
    }

    if (!otelModule?.Otel?.isEnabled()) {
      return data
    }

    const carrier = QueueJobPropagationHelper.injectContext({})
    const currentContextValues =
      QueueJobPropagationHelper.captureCurrentContextValues()

    if (
      !Object.keys(carrier).length &&
      !Object.keys(currentContextValues).length
    ) {
      return data
    }

    return {
      [QUEUE_ENVELOPE_KEY]: {
        version: QUEUE_ENVELOPE_VERSION,
        carrier,
        currentContextValues
      },
      payload: data
    } satisfies QueueEnvelope<T>
  }

  public static getCarrier(data: unknown): QueueTraceCarrier {
    if (!QueueJobPropagationHelper.isEnvelope(data)) {
      return {}
    }

    return data[QUEUE_ENVELOPE_KEY].carrier || {}
  }

  public static getCurrentContextValues(data: unknown) {
    if (!QueueJobPropagationHelper.isEnvelope(data)) {
      return {}
    }

    return data[QUEUE_ENVELOPE_KEY].currentContextValues || {}
  }

  public static getPayload<T = unknown>(data: T) {
    if (!QueueJobPropagationHelper.isEnvelope(data)) {
      return data
    }

    return data.payload as T
  }

  public static getJob<T = unknown>(job: Job<T>) {
    return {
      ...job,
      data: QueueJobPropagationHelper.getPayload(job.data)
    }
  }

  private static isEnvelope(data: unknown): data is QueueEnvelope {
    if (!data || !Is.Object(data)) {
      return false
    }

    const candidate = data as Partial<QueueEnvelope>

    if (!(QUEUE_ENVELOPE_KEY in candidate) || !('payload' in candidate)) {
      return false
    }

    const metadata = candidate[QUEUE_ENVELOPE_KEY]

    return (
      Is.Object(metadata) &&
      metadata.version === QUEUE_ENVELOPE_VERSION &&
      Is.Object(metadata.carrier) &&
      Is.Object(metadata.currentContextValues)
    )
  }

  private static injectContext(carrier: Record<string, string>) {
    if (Is.Function(otelModule?.Otel?.injectContext)) {
      return otelModule.Otel.injectContext(carrier)
    }

    propagation.inject(context.active(), carrier)

    return carrier
  }

  private static captureCurrentContextValues() {
    if (Is.Function(otelModule?.Otel?.captureCurrentContextValues)) {
      return otelModule.Otel.captureCurrentContextValues()
    }

    const values: Record<string, unknown> = {}
    const contextBagSymbol = QueueJobPropagationHelper.getContextBagSymbol()
    const store = context.active().getValue(contextBagSymbol as any) as
      | Map<string | symbol, unknown>
      | undefined

    if (!(store instanceof Map)) {
      return values
    }

    for (const [key, value] of store.entries()) {
      if (Is.String(key)) {
        values[key] = value
      }
    }

    return values
  }

  private static getContextBagSymbol() {
    return (
      otelModule?.Otel?.contextBagSymbol ||
      Symbol.for('athenna.otel.currentContextBag')
    )
  }
}
