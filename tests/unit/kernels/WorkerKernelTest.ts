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
import { LoggerProvider } from '@athenna/logger'
import { WorkerImpl } from '#src/worker/WorkerImpl'
import { WorkerKernel } from '#src/kernels/WorkerKernel'
import { constants } from '#tests/fixtures/constants/index'
import { QueueProvider } from '#src/providers/QueueProvider'
import { WorkerProvider } from '#src/providers/WorkerProvider'
import { Test, BeforeEach, AfterEach, type Context, Mock } from '@athenna/test'

export class WorkerKernelTest {
  @BeforeEach()
  public async beforeEach() {
    ioc.reconstruct()

    WorkerImpl.loggerIsSet = false
    WorkerImpl.rTracerPlugin = undefined

    await Config.loadAll(Path.fixtures('config'))
    new LoggerProvider().register()
    new QueueProvider().register()
    new WorkerProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    Mock.restoreAll()

    new WorkerProvider().shutdown()

    constants.RUN_MAP.helloWorker = false
    constants.RUN_MAP.productWorker = false
    constants.RUN_MAP.annotatedWorker = false
    constants.RUN_MAP.decoratedWorker = false
  }

  @Test()
  public async shouldBeAbleToRegisterRTracerPluginInWorkerHandler({ assert }: Context) {
    const kernel = new WorkerKernel()

    await kernel.registerRTracer()

    assert.isDefined(WorkerImpl.rTracerPlugin)
  }

  @Test()
  public async shouldNotRegisterRTracerPluginInWorkerHandlerIfRTracerConfigIsDisabled({ assert }: Context) {
    Config.set('worker.rTracer.enabled', false)

    const kernel = new WorkerKernel()

    await kernel.registerRTracer()

    assert.isUndefined(WorkerImpl.rTracerPlugin)
  }

  @Test()
  public async shouldBeAbleToGetTraceIdInHandlerWhenRTracerPluginIsEnabled({ assert }: Context) {
    const kernel = new WorkerKernel()

    await kernel.registerRTracer()

    let traceId = null

    Worker.task()
      .name('r_tracer')
      .connection('vanilla')
      .handler(ctx => {
        traceId = ctx.traceId
      })
      .start()

    await Sleep.for(1500).milliseconds().wait()

    assert.isDefined(traceId)
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

    assert.isTrue(constants.RUN_MAP.helloWorker)
    assert.isTrue(constants.RUN_MAP.annotatedWorker)
    assert.isTrue(constants.RUN_MAP.decoratedWorker)
    assert.isTrue(constants.RUN_MAP.productWorker)
  }

  @Test()
  public async shouldBeAbleToRegisterRTracerPluginInWorkerHandlerAndRunAWorker({ assert }: Context) {
    const kernel = new WorkerKernel()

    await kernel.registerRTracer()
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
  public async shouldBeAbleToRegisterLoggerAndRTracerPluginInWorkerHandlerAndRunAWorker({ assert }: Context) {
    const kernel = new WorkerKernel()

    await kernel.registerLogger()
    await kernel.registerRTracer()
    await kernel.registerWorkers()

    await Queue.add({ test: 1 })

    await Queue.worker().runByName('AnnotatedWorker')

    assert.isTrue(constants.RUN_MAP.annotatedWorker)
  }
}
