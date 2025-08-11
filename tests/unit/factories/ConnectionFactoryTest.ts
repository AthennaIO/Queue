/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path } from '@athenna/common'
import { TestDriver } from '#tests/fixtures/drivers/TestDriver'
import { AfterEach, BeforeEach, Test, type Context } from '@athenna/test'
import { NotFoundDriverException } from '#src/exceptions/NotFoundDriverException'
import { NotImplementedConfigException } from '#src/exceptions/NotImplementedConfigException'
import { FakeDriver, MemoryDriver, AwsSqsDriver, ConnectionFactory, DatabaseDriver } from '#src'

export class ConnectionFactoryTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))
    ConnectionFactory.connections = new Map()
    ConnectionFactory.drivers.delete('test')
  }

  @AfterEach()
  public async afterEach() {
    Config.clear()
  }

  @Test()
  public async shouldBeAbleToGetAllAvailableDrivers({ assert }: Context) {
    const availableDrivers = ConnectionFactory.availableDrivers()

    assert.deepEqual(availableDrivers, ['fake', 'aws_sqs', 'memory', 'database'])
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
  public async shouldBeAbleToFabricateNewConnectionsAndReturnMemoryDriverInstance({ assert }: Context) {
    const driver = ConnectionFactory.fabricate('memory')

    assert.instanceOf(driver, MemoryDriver)
  }

  @Test()
  public async shouldBeAbleToFabricateNewConnectionsAndReturnDatabaseDriverInstance({ assert }: Context) {
    const driver = ConnectionFactory.fabricate('database')

    assert.instanceOf(driver, DatabaseDriver)
  }

  @Test()
  public async shouldBeAbleToFabricateNewConnectionsAndReturnAwsSqsDriverInstance({ assert }: Context) {
    const driver = ConnectionFactory.fabricate('aws_sqs')

    assert.instanceOf(driver, AwsSqsDriver)
  }

  @Test()
  public async shouldThrowNotFoundDriverExceptionWhenTryingToUseANotImplementedDriver({ assert }: Context) {
    assert.throws(() => ConnectionFactory.fabricate('not-found'), NotFoundDriverException)
  }

  @Test()
  public async shouldThrowNotImplementedConfigExceptionWhenTryingToUseANotImplementedDriver({ assert }: Context) {
    assert.throws(() => ConnectionFactory.fabricate('not-found-con'), NotImplementedConfigException)
  }

  @Test()
  public async shouldBeAbleToCreateOwnDriverImplementationToUseWithinQueueFacade({ assert }: Context) {
    ConnectionFactory.createDriver('test', TestDriver)

    const testDriver = ConnectionFactory.fabricate('test')

    assert.instanceOf(testDriver, TestDriver)

    ConnectionFactory.drivers.delete('test')
    ConnectionFactory.connections.delete('test')
  }
}
