/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path } from '@athenna/common'
import { Config } from '@athenna/config'
import { Queue, QueueProvider } from '#src'
import { Test, Mock, BeforeEach, AfterEach, type Context } from '@athenna/test'

export class QueueProviderTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))
  }

  @AfterEach()
  public async afterEach() {
    Mock.restoreAll()
    ioc.reconstruct()
    Config.clear()
  }

  @Test()
  public async shouldBeAbleToRegisterQueueImplementationInTheContainer({ assert }: Context) {
    new QueueProvider().register()

    assert.isTrue(ioc.has('Athenna/Core/Queue'))
  }

  @Test()
  public async shouldBeAbleToUseQueueImplementationFromFacade({ assert }: Context) {
    new QueueProvider().register()

    assert.isDefined(Queue.connectionName)
  }

  @Test()
  public async shouldBeAbleToShutdownOpenQueueConnections({ assert }: Context) {
    const queueProvider = new QueueProvider()

    queueProvider.register()

    const queue = Queue.connection('memory')

    assert.isTrue(queue.isConnected())

    await queueProvider.shutdown()

    assert.isFalse(queue.isConnected())
  }

  @Test()
  public async shouldNotThrowErrorIfProviderIsNotRegisteredWhenShuttingDown({ assert }: Context) {
    await assert.doesNotReject(() => new QueueProvider().shutdown())
  }
}
