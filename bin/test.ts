/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Runner } from '@athenna/test'
import { command } from '@athenna/artisan/testing/plugins'

await Runner.setTsEnv()
  .addAssertPlugin()
  .addPlugin(command())
  .addPath('tests/unit/**/*.ts')
  .setCliArgs(process.argv.slice(2))
  .setGlobalTimeout(30000)
  .run()
