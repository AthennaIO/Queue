/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

export default {
  default: 'sqlite',

  connections: {
    sqlite: {
      driver: 'sqlite',
      connection: ':memory:',
      /**
       * An in-memory SQLite database lives inside ONE connection: a second
       * pooled connection opens a second, EMPTY database ("no such table:
       * jobs"). Pinning the pool to a single connection is what lets a test
       * run two concurrent queries against the same fixture data.
       */
      pool: {
        min: 1,
        max: 1
      }
    }
  }
}
