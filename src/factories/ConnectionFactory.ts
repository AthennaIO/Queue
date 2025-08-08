/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { debug } from '#src/debug'
import type { Driver } from '#src/drivers/Driver'
import type { ConnectionOptions } from '#src/types'
import { FakeDriver } from '#src/drivers/FakeDriver'
import { AwsSqsDriver } from '#src/drivers/AwsSqsDriver'
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
    .set('aws-sqs', AwsSqsDriver)
    .set('vanilla', VanillaDriver)
    .set('database', DatabaseDriver)

  public static fabricate(
    con: 'vanilla',
    options?: ConnectionOptions['options']
  ): VanillaDriver

  public static fabricate(
    con: 'database',
    options?: ConnectionOptions['options']
  ): DatabaseDriver

  public static fabricate(
    con: 'aws-sqs',
    options?: ConnectionOptions['options']
  ): AwsSqsDriver

  public static fabricate(
    con: 'fake',
    options?: ConnectionOptions['options']
  ): typeof FakeDriver

  public static fabricate(
    con: 'vanilla' | 'database' | 'fake' | 'aws-sqs' | string,
    options?: ConnectionOptions['options']
  ): VanillaDriver | DatabaseDriver | AwsSqsDriver | typeof FakeDriver

  /**
   * Fabricate a new connection for a specific driver.
   */
  public static fabricate(con: string, options?: ConnectionOptions['options']) {
    con = this.parseConName(con)

    const driverName = this.getConnectionDriver(con)
    const Driver = this.drivers.get(driverName)
    const connection = this.connections.get(con)

    if (!connection) {
      this.connections.set(con, { client: null })

      return new Driver(con, null, options)
    }

    if (connection.client) {
      debug(
        'client found for connection %s using driver %s, using it as default',
        con,
        driverName
      )

      return new Driver(con, connection.client, options)
    }

    return new Driver(con, null, options)
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
    const connection = this.connections.get(con) || {}

    connection.client = client

    this.connections.set(con, connection)
  }

  /**
   * Return all available drivers.
   */
  public static availableDrivers() {
    const availableDrivers = []

    for (const key of this.drivers.keys()) {
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

  /**
   * Define your own queue driver implementation to use
   * within Queue facade.
   *
   * @example
   * ```ts
   * import { Driver } from '@athenna/queue'
   *
   * class TestDriver extends Driver {}
   *
   * ConnectionFactory.createDriver('test', TestDriver)
   * ```
   */
  public static createDriver(name: string, impl: typeof Driver) {
    this.drivers.set(name, impl)
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
}
