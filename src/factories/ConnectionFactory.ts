/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { debug } from '#src/debug'
import { FakeDriver } from '#src/drivers/FakeDriver'
import { VanillaDriver } from '#src/drivers/VanillaDriver'
import { DatabaseDriver } from '#src/drivers/DatabaseDriver'
import { NotFoundDriverException } from '#src/exceptions/NotFoundDriverException'
import { NotImplementedConfigException } from '#src/exceptions/NotImplementedConfigException'

export class ConnectionFactory {
  /**
   * Holds all the open connections.
   */
  public static connections: Map<string, any> = new Map()

  /**
   * Holds all the Athenna drivers implementations available.
   */
  public static drivers: Map<string, any> = new Map()
    .set('fake', FakeDriver)
    .set('vanilla', VanillaDriver)
    .set('database', DatabaseDriver)

  public static fabricate(con: 'vanilla'): VanillaDriver
  public static fabricate(con: 'database'): DatabaseDriver
  public static fabricate(con: 'fake'): typeof FakeDriver
  public static fabricate(
    con: 'vanilla' | 'database' | 'fake' | string
  ): VanillaDriver | DatabaseDriver | typeof FakeDriver

  /**
   * Fabricate a new connection for a specific driver.
   */
  public static fabricate(con: string) {
    con = this.parseConName(con)

    const driverName = this.getConnectionDriver(con)
    const Driver = this.drivers.get(driverName)
    const { client } = this.connections.get(con)

    if (client) {
      debug(
        'client found for connection %s using driver %s, using it as default',
        con,
        driverName
      )

      const impl = new Driver(con, client)

      impl.isSavedOnFactory = true

      return impl
    }

    this.connections.set(con, { client })

    return new Driver(con)
  }

  /**
   * Parse connection config name if is default
   */
  private static parseConName(con: string): string {
    if (con === 'default') {
      return Config.get('queue.default')
    }

    return con
  }

  /**
   * Get the connection configuration of config/queue file.
   */
  private static getConnectionDriver(con: string): string {
    const config = Config.get(`queue.connections.${con}`)

    if (!config) {
      throw new NotImplementedConfigException(con)
    }

    if (!this.drivers.has(config.driver)) {
      throw new NotFoundDriverException(config.driver)
    }

    return config.driver
  }

  /**
   * Verify if client is present on a driver connection.
   */
  public static hasClient(con: string): boolean {
    return !!this.connections.get(con).client
  }

  /**
   * Get client of a connection.
   */
  public static getClient(con: string): any {
    return this.connections.get(con).client
  }

  /**
   * Set connection client on driver.
   */
  public static setClient(con: string, client: any): void {
    const connection = this.connections.get(con)

    connection.client = client

    this.connections.set(con, connection)
  }

  /**
   * Return all available drivers.
   */
  public static availableDrivers() {
    const availableDrivers = []

    for (const key of this.connections.keys()) {
      availableDrivers.push(key)
    }

    return availableDrivers
  }

  /**
   * Return all available connections.
   */
  public static availableConnections() {
    const availableConnections = []

    for (const key of this.connections.keys()) {
      availableConnections.push(key)
    }

    return availableConnections
  }
}
