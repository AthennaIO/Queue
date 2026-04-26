/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path, Sleep } from '@athenna/common'
import { OtelProvider } from '@athenna/otel'
import { QueueExecutionScope } from '#src/worker/QueueExecutionScope'
import { context, createContextKey } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { Test, BeforeEach, AfterEach, type Context } from '@athenna/test'

export class QueueExecutionScopeTest {
  @BeforeEach()
  public async beforeEach() {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
    await Config.loadAll(Path.fixtures('config'))

    new OtelProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    context.disable()
    await new OtelProvider().shutdown()

    ioc.reconstruct()
    Config.clear()
  }

  @Test()
  public async shouldRunCallbacksInsideConfiguredOtelContext({ assert }: Context) {
    const connectionKey = createContextKey('queue.scope.connection')
    const jobNameKey = createContextKey('queue.scope.job.name')
    const values = {
      connection: null,
      name: null
    }

    Config.set('worker.otel.contextEnabled', true)
    Config.set('worker.otel.contextBindings', [
      { key: connectionKey, resolve: ctx => ctx.connection },
      { key: jobNameKey, resolve: ctx => ctx.job.data.name }
    ])

    const scope = new QueueExecutionScope({
      name: 'scope_test',
      connection: 'memory',
      options: undefined,
      traceId: null,
      job: {
        id: '1',
        attempts: 0,
        data: { name: 'lenon' }
      }
    })

    await scope.run(async () => {
      values.connection = context.active().getValue(connectionKey) as any
      values.name = context.active().getValue(jobNameKey) as any
    })

    assert.equal(values.connection, 'memory')
    assert.equal(values.name, 'lenon')
  }

  @Test()
  public async shouldBindDeferredCallbacksToTheCapturedScope({ assert }: Context) {
    const connectionKey = createContextKey('queue.scope.bound.connection')
    let value = null

    Config.set('worker.otel.contextEnabled', true)
    Config.set('worker.otel.contextBindings', [{ key: connectionKey, resolve: ctx => ctx.connection }])

    const scope = new QueueExecutionScope({
      name: 'scope_bind',
      connection: 'aws_sqs',
      options: undefined,
      traceId: null,
      job: {
        id: '1',
        attempts: 0,
        data: { name: 'lenon' }
      }
    })

    const callback = scope.bind(async () => {
      value = context.active().getValue(connectionKey) as any
    })

    await callback()

    assert.equal(value, 'aws_sqs')
  }

  @Test()
  public async shouldKeepConcurrentScopesIsolated({ assert }: Context) {
    const connectionKey = createContextKey('queue.scope.concurrent.connection')
    const values: string[] = []

    Config.set('worker.otel.contextEnabled', true)
    Config.set('worker.otel.contextBindings', [{ key: connectionKey, resolve: ctx => ctx.connection }])

    const memoryScope = new QueueExecutionScope({
      name: 'scope_memory',
      connection: 'memory',
      options: undefined,
      traceId: null,
      job: {
        id: '1',
        attempts: 0,
        data: { name: 'memory' }
      }
    })
    const databaseScope = new QueueExecutionScope({
      name: 'scope_database',
      connection: 'database',
      options: undefined,
      traceId: null,
      job: {
        id: '2',
        attempts: 0,
        data: { name: 'database' }
      }
    })

    await Promise.all([
      memoryScope.run(async () => {
        await Sleep.for(10).milliseconds().wait()
        values.push(context.active().getValue(connectionKey) as string)
      }),
      databaseScope.run(async () => {
        await Sleep.for(5).milliseconds().wait()
        values.push(context.active().getValue(connectionKey) as string)
      })
    ])

    assert.sameMembers(values, ['memory', 'database'])
  }
}
