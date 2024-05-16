/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path } from '@athenna/common'
import { AfterEach, BeforeEach, Test, type Context } from '@athenna/test'
import { NotFoundDriverException } from '#src/exceptions/NotFoundDriverException'
import { ConnectionFactory, FakeDriver, DatabaseDriver, VanillaDriver } from '#src'
import { NotImplementedConfigException } from '#src/exceptions/NotImplementedConfigException'

export class ConnectionFactoryTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))
    ConnectionFactory.connections = new Map()
  }

  @AfterEach()
  public async afterEach() {
    Config.clear()
  }

  @Test()
  public async shouldBeAbleToGetAllAvailableDrivers({ assert }: Context) {
    const availableDrivers = ConnectionFactory.availableDrivers()

    assert.deepEqual(availableDrivers, ['fake', 'vanilla', 'database'])
  }

  @Test()
  public async shouldBeAbleToGetAllAvailableConnections({ assert }: Context) {
    const availableConnections = ConnectionFactory.availableConnections()

    assert.deepEqual(availableConnections, [])
  }

  @Test()
  public async shouldBeAbleToGetAllAvailableConnectionsWhenTheyExist({ assert }: Context) {
    ConnectionFactory.setClient('test', {})

    const availableConnections = ConnectionFactory.availableConnections()

    assert.deepEqual(availableConnections, ['test'])
  }

  @Test()
  public async shouldBeAbleToFabricateNewConnectionsAndReturnFakeDriverInstance({ assert }: Context) {
    const driver = ConnectionFactory.fabricate('fake')

    assert.deepEqual(driver, FakeDriver)
  }

  @Test()
  public async shouldBeAbleToFabricateNewConnectionsAndReturnVanillaDriverInstance({ assert }: Context) {
    const driver = ConnectionFactory.fabricate('vanilla')

    assert.instanceOf(driver, VanillaDriver)
  }

  @Test()
  public async shouldBeAbleToFabricateNewConnectionsAndReturnDatabaseDriverInstance({ assert }: Context) {
    const driver = ConnectionFactory.fabricate('database')

    assert.instanceOf(driver, DatabaseDriver)
  }

  @Test()
  public async shouldThrowNotFoundDriverExceptionWhenTryingToUseANotImplementedDriver({ assert }: Context) {
    assert.throws(() => ConnectionFactory.fabricate('not-found'), NotFoundDriverException)
  }

  @Test()
  public async shouldThrowNotImplementedConfigExceptionWhenTryingToUseANotImplementedDriver({ assert }: Context) {
    assert.throws(() => ConnectionFactory.fabricate('not-found-con'), NotImplementedConfigException)
  }
}
