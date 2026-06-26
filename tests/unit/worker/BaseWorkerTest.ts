/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path } from '@athenna/common'
import { Worker, BaseWorker, QueueImpl } from '#src'
import { LoggerProvider } from '@athenna/logger'
import { QueueProvider } from '#src/providers/QueueProvider'
import { Test, BeforeEach, AfterEach, type Context } from '@athenna/test'

@Worker({ connection: 'fake' })
class FakeConnectionWorker extends BaseWorker {
  public async handle() {}
}

@Worker({ connection: 'memory' })
class MemoryConnectionWorker extends BaseWorker {
  public async handle() {}
}

@Worker()
class DefaultConnectionWorker extends BaseWorker {
  public async handle() {}
}

export class BaseWorkerTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    new LoggerProvider().register()
    new QueueProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    await new QueueProvider().shutdown()

    ioc.reconstruct()
    Config.clear()
  }

  @Test()
  public async shouldResolveTheConnectionFromTheWorkerMetadata({ assert }: Context) {
    const worker = new FakeConnectionWorker()

    assert.equal(worker.connection, 'fake')
    assert.equal(worker.queue.connectionName, 'fake')
  }

  @Test()
  public async shouldFallBackToTheDefaultConnectionWhenNotAnnotatedWithOne({ assert }: Context) {
    const worker = new DefaultConnectionWorker()

    assert.equal(worker.connection, Config.get('queue.default'))
    assert.equal(worker.queue.connectionName, Config.get('queue.default'))
  }

  @Test()
  public async shouldExposeAReadyToUseQueueInstanceBoundToTheWorkerConnection({ assert }: Context) {
    const worker = new MemoryConnectionWorker()

    assert.instanceOf(worker.queue, QueueImpl)
    assert.equal(worker.queue.connectionName, 'memory')
    assert.isTrue(worker.queue.isConnected())
  }

  @Test()
  public async shouldCacheTheQueueInstanceBetweenAccesses({ assert }: Context) {
    const worker = new FakeConnectionWorker()

    const first = worker.queue
    const second = worker.queue

    assert.isTrue(first === second)
  }
}
