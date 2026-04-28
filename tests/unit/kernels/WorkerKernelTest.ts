/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Queue } from '#src/facades/Queue'
import { Worker } from '#src/facades/Worker'
import { Path, Sleep } from '@athenna/common'
import { Otel, OtelProvider } from '@athenna/otel'
import { WorkerImpl } from '#src/worker/WorkerImpl'
import { Log, LoggerProvider } from '@athenna/logger'
import { WorkerKernel } from '#src/kernels/WorkerKernel'
import { constants } from '#tests/fixtures/constants/index'
import { QueueProvider } from '#src/providers/QueueProvider'
import { context, createContextKey } from '@opentelemetry/api'
import { WorkerProvider } from '#src/providers/WorkerProvider'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { Test, BeforeEach, AfterEach, type Context, Mock, Cleanup } from '@athenna/test'

export class WorkerKernelTest {
  @BeforeEach()
  public async beforeEach() {
    ioc.reconstruct()

    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
    WorkerImpl.loggerIsSet = false

    await Config.loadAll(Path.fixtures('config'))
    new OtelProvider().register()
    Otel.start()
    new LoggerProvider().register()
    new QueueProvider().register()
    new WorkerProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    Mock.restoreAll()
    context.disable()

    await new OtelProvider().shutdown()
    new WorkerProvider().shutdown()

    constants.RUN_MAP.helloWorker = false
    constants.RUN_MAP.productWorker = false
    constants.RUN_MAP.annotatedWorker = false
    constants.RUN_MAP.decoratedWorker = false
  }

  @Test()
  public async shouldBeAbleToGetTraceIdInHandlerFromTheActiveOtelSpan({ assert }: Context) {
    let traceId = null

    Worker.task()
      .name('otel_trace')
      .connection('memory')
      .handler(ctx => {
        traceId = ctx.traceId
      })
      .start()

    await Sleep.for(1500).milliseconds().wait()

    assert.isDefined(traceId)
  }

  @Test()
  @Cleanup(() => {
    Config.set('worker.otel.contextEnabled', false)
  })
  @Cleanup(() => {
    Config.set('worker.otel.contextBindings', [])
  })
  public async shouldBeAbleToRunWorkerHandlersInsideConfiguredOtelContext({ assert }: Context) {
    const workerNameKey = createContextKey('worker.name')
    const workerConnectionKey = createContextKey('worker.connection')
    let values: any = {}

    Config.set('worker.otel.contextEnabled', true)
    Config.set('worker.otel.contextBindings', [
      { key: workerNameKey, resolve: ctx => ctx.name },
      { key: workerConnectionKey, resolve: ctx => ctx.connection }
    ])

    Worker.task()
      .name('otel_worker')
      .connection('memory')
      .handler(ctx => {
        values = {
          name: context.active().getValue(workerNameKey),
          connection: context.active().getValue(workerConnectionKey),
          ctxConnection: ctx.connection
        }
      })

    const task = Worker.getWorkerTaskByName('otel_worker')

    await task.worker.handler({
      name: 'otel_worker',
      traceId: null,
      connection: 'memory',
      options: undefined,
      job: {
        id: '1',
        attempts: 0,
        data: { test: 1 }
      }
    })

    assert.equal(values.name, 'otel_worker')
    assert.equal(values.connection, values.ctxConnection)
    assert.equal(values.connection, 'memory')
  }

  @Test()
  @Cleanup(() => {
    Config.set('worker.otel.contextEnabled', false)
  })
  @Cleanup(() => {
    Config.set('worker.otel.contextBindings', [])
  })
  @Cleanup(() => {
    Config.set('worker.logger.prettifyException', true)
  })
  public async shouldKeepOtelContextActiveDuringWorkerExceptionLogging({ assert }: Context) {
    const workerNameKey = createContextKey('worker.exception.name')
    const workerConnectionKey = createContextKey('worker.exception.connection')
    const values = {
      name: null,
      connection: null
    }

    Config.set('worker.otel.contextEnabled', true)
    Config.set('worker.otel.contextBindings', [
      { key: workerNameKey, resolve: ctx => ctx.name },
      { key: workerConnectionKey, resolve: ctx => ctx.connection }
    ])
    Config.set('worker.logger.prettifyException', false)

    Log.when('channelOrVanilla').return({
      error: () => {
        values.name = context.active().getValue(workerNameKey) as any
        values.connection = context.active().getValue(workerConnectionKey) as any
      }
    })

    Worker.task()
      .name('otel_worker_exception')
      .connection('memory')
      .handler(async () => {
        throw new Error('testing')
      })

    await Queue.add({ test: 1 })
    await Queue.worker().runByName('otel_worker_exception')

    assert.equal(values.name, 'otel_worker_exception')
    assert.equal(values.connection, 'memory')
  }

  @Test()
  public async shouldBeAbleToRegisterWorkersOfTheRcFileWithAndWithoutAnnotations({ assert }: Context) {
    const kernel = new WorkerKernel()
    await kernel.registerWorkers()

    assert.isFalse(ioc.has('helloWorker'))
    assert.isTrue(ioc.has('App/Queue/Workers/HelloWorker'))
    assert.equal(ioc.getRegistration('App/Queue/Workers/HelloWorker').lifetime, 'TRANSIENT')

    assert.isTrue(ioc.has('decoratedWorker'))
    assert.isTrue(ioc.has('annotatedWorker'))
    assert.isFalse(ioc.has('App/Queue/Workers/AnnotatedWorker'))
    assert.equal(ioc.getRegistration('decoratedWorker').lifetime, 'SINGLETON')
  }

  @Test()
  public async shouldBeAbleToRegisterWorkerRouteFileByImportAlias({ assert }: Context) {
    const kernel = new WorkerKernel()

    await kernel.registerRoutes('#tests/fixtures/routes/worker')

    const worker = Worker.getWorkerTaskByName('route_worker')

    assert.isDefined(worker)
  }

  @Test()
  public async shouldBeAbleToRegisterWorkerRouteFileByFullPath({ assert }: Context) {
    const kernel = new WorkerKernel()

    await kernel.registerRoutes(Path.fixtures('routes/worker_absolute.ts'))

    const worker = Worker.getWorkerTaskByName('route_worker_absolute')

    assert.isDefined(worker)
  }

  @Test()
  public async shouldBeAbleToRegisterWorkerRouteFileByPartialPath({ assert }: Context) {
    const kernel = new WorkerKernel()

    await kernel.registerRoutes('./tests/fixtures/routes/worker_partial.ts')

    const worker = Worker.getWorkerTaskByName('route_worker_partial')

    assert.isDefined(worker)
  }

  @Test()
  public async shouldBeAbleToRunWorkerRegisteredByWorkerKernel({ assert }: Context) {
    const kernel = new WorkerKernel()

    await kernel.registerWorkers()

    await Queue.add({ test: 1 })

    Queue.worker().start()

    await Sleep.for(20000).milliseconds().wait()

    assert.isTrue(constants.RUN_MAP.productWorker)
    assert.isTrue(constants.RUN_MAP.annotatedWorker)
    assert.isTrue(constants.RUN_MAP.decoratedWorker)
  }

  @Test()
  public async shouldBeAbleToRegisterWorkersAndRunAWorker({ assert }: Context) {
    const kernel = new WorkerKernel()

    await kernel.registerWorkers()

    await Queue.add({ test: 1 })

    await Queue.worker().runByName('AnnotatedWorker')

    assert.isTrue(constants.RUN_MAP.annotatedWorker)
  }

  @Test()
  public async shouldBeAbleToRegisterLoggerInWorkerHandlerAndRunAWorker({ assert }: Context) {
    const kernel = new WorkerKernel()

    await kernel.registerLogger()
    await kernel.registerWorkers()

    await Queue.add({ test: 1 })

    await Queue.worker().runByName('AnnotatedWorker')

    assert.isTrue(constants.RUN_MAP.annotatedWorker)
  }

  @Test()
  public async shouldBeAbleToRegisterLoggerAndWorkersAndRunAWorker({ assert }: Context) {
    const kernel = new WorkerKernel()

    await kernel.registerLogger()
    await kernel.registerWorkers()

    await Queue.add({ test: 1 })

    await Queue.worker().runByName('AnnotatedWorker')

    assert.isTrue(constants.RUN_MAP.annotatedWorker)
  }
}
