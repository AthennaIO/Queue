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
      connection: ':memory:'
    }
  }
}
