/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path, File } from '@athenna/common'
import { Test, type Context } from '@athenna/test'
import { BaseCommandTest } from '#tests/helpers/BaseCommandTest'

export default class MakeWorkerCommandTest extends BaseCommandTest {
  @Test()
  public async shouldBeAbleToCreateAWorkerFile({ assert, command }: Context) {
    const output = await command.run('make:worker TestWorker')

    output.assertSucceeded()
    output.assertLogged('[ MAKING WORKER ]')
    output.assertLogged('[  success  ] Worker "TestWorker" successfully created.')
    output.assertLogged('[  success  ] Athenna RC updated: [ workers += "#src/workers/TestWorker" ]')

    const { athenna } = await new File(Path.pwd('package.json')).getContentAsJson()

    assert.isTrue(await File.exists(Path.workers('TestWorker.ts')))
    assert.containsSubset(athenna.workers, ['#src/workers/TestWorker'])
  }

  @Test()
  public async shouldBeAbleToCreateAWorkerFileWithADifferentDestPathAndImportPath({ assert, command }: Context) {
    const output = await command.run('make:worker TestWorker', {
      path: Path.fixtures('consoles/console-mock-dest-import.ts')
    })

    output.assertSucceeded()
    output.assertLogged('[ MAKING WORKER ]')
    output.assertLogged('[  success  ] Worker "TestWorker" successfully created.')
    output.assertLogged('[  success  ] Athenna RC updated: [ workers += "#tests/fixtures/storage/workers/TestWorker" ]')

    const { athenna } = await new File(Path.pwd('package.json')).getContentAsJson()

    assert.isTrue(await File.exists(Path.fixtures('storage/workers/TestWorker.ts')))
    assert.containsSubset(athenna.workers, ['#tests/fixtures/storage/workers/TestWorker'])
  }

  @Test()
  public async shouldThrowAnExceptionWhenTheFileAlreadyExists({ command }: Context) {
    await command.run('make:worker TestWorker')
    const output = await command.run('make:worker TestWorker')

    output.assertFailed()
    output.assertLogged('[ MAKING WORKER ]')
    output.assertLogged('The file')
    output.assertLogged('TestWorker.ts')
    output.assertLogged('already exists')
  }
}
