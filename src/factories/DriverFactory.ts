/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { debug } from '#src/debug'
import { Config } from '@athenna/config'
import { Options } from '@athenna/common'
import type { Driver } from '#src/drivers/Driver'
import { FakeDriver } from '#src/drivers/FakeDriver'
import type { DriverKey, Connections } from '#src/types'
import { VanillaDriver } from '#src/drivers/VanillaDriver'
import { DatabaseDriver } from '#src/drivers/DatabaseDriver'
import { NotFoundDriverException } from '#src/exceptions/NotFoundDriverException'
import { NotImplementedConfigException } from '#src/exceptions/NotImplementedConfigException'

export class DriverFactory {
  /**
   * All athenna drivers connection configuration.
   */
  public static drivers: Map<string, DriverKey> = new Map()
    .set('fake', {
      Driver: FakeDriver,
      client: { destroy: () => {} }
    })
    .set('vanilla', {
      Driver: VanillaDriver,
      client: null
    })
    .set('database', {
      Driver: DatabaseDriver,
      client: null
    })

  /**
   * Return all available drivers.
   */
  public static availableDrivers(options: { onlyConnected?: boolean } = {}) {
    options = Options.create(options, { onlyConnected: false })

    const availableDrivers = []

    for (const [key, value] of this.drivers.entries()) {
      if (options.onlyConnected) {
        if (!value.client) continue

        availableDrivers.push(key)

        continue
      }

      availableDrivers.push(key)
    }

    return availableDrivers
  }

  public static fabricate(con: 'vanilla'): VanillaDriver
  public static fabricate(con: 'database'): DatabaseDriver
  public static fabricate(con: 'fake'): typeof FakeDriver
  public static fabricate(
    con: Connections
  ): VanillaDriver | DatabaseDriver | typeof FakeDriver

  /**
   * Fabricate a new connection with some queue driver.
   */
  public static fabricate(con: string): Driver {
    con = this.parseConName(con)

    const { driver } = this.getConnectionConfig(con)
    const { Driver, client } = this.drivers.get(driver)

    if (client) {
      debug('client found for driver %s, using it as default', driver)
      const impl = new Driver(con, client)

      impl.isSavedOnFactory = true

      return impl
    }

    this.drivers.set(driver, {
      Driver,
      client
    })

    return new Driver(con)
  }

  /**
   * Verify if client is present on driver.
   */
  public static hasClient(driver: string): boolean {
    return !!this.drivers.get(driver).client
  }

  /**
   * Get client of driver.
   */
  public static getClient(driver: string): any {
    return this.drivers.get(driver).client
  }

  /**
   * Set client on driver.
   */
  public static setClient(driver: string, client: any): void {
    const driverKey = this.drivers.get(driver)

    driverKey.client = client

    this.drivers.set(driver, driverKey)
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
  private static getConnectionConfig(con: string): any {
    const conConfig = Config.get(`queue.connections.${con}`)

    if (!conConfig) {
      throw new NotImplementedConfigException(con)
    }

    if (!this.drivers.has(conConfig.driver)) {
      throw new NotFoundDriverException(conConfig.driver)
    }

    return conConfig
  }
}
