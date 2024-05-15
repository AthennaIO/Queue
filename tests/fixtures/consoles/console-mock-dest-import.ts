/**
 * @athenna/validator
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { sep } from 'node:path'
import { Path } from '@athenna/common'
import { Rc, Config } from '@athenna/config'
import { ViewProvider } from '@athenna/view'
import { LoggerProvider } from '@athenna/logger'
import { Artisan, ArtisanProvider, ConsoleKernel } from '@athenna/artisan'

process.env.IS_TS = 'true'

await Config.loadAll(Path.fixtures('config'))

Config.set('rc.parentURL', Path.toHref(Path.pwd() + sep))

Config.set('rc.commands', {
  'make:worker': {
    path: '#src/commands/MakeWorkerCommand',
    destination: './tests/fixtures/storage/workers'
  }
})

await Rc.setFile(Path.pwd('package.json'))

new ViewProvider().register()
new ArtisanProvider().register()
new LoggerProvider().register()

await new ConsoleKernel().registerCommands(process.argv)

await Artisan.parse(process.argv, 'Artisan')
