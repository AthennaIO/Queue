/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Annotation } from '@athenna/ioc'
import { BaseTest } from '#tests/helpers/BaseTest'
import { Test, type Context, Cleanup } from '@athenna/test'

export default class WorkerAnnotationTest extends BaseTest {
  @Test()
  public async shouldBeAbleToPreregisterWorkersUsingWorkerAnnotation({ assert }: Context) {
    const ProductWorker = await this.import('#tests/fixtures/workers/ProductWorker')

    const metadata = Annotation.getMeta(ProductWorker)

    assert.isFalse(metadata.registered)
    assert.isUndefined(metadata.camelAlias)
    assert.equal(metadata.type, 'transient')
    assert.equal(metadata.name, 'ProductWorker')
    assert.equal(metadata.connection, 'vanilla')
    assert.equal(metadata.alias, 'App/Queue/Workers/ProductWorker')
  }

  @Test()
  @Cleanup(() => ioc.reconstruct())
  public async shouldNotReRegisterTheWorkerAliasIfItIsAlreadyRegisteredInTheServiceContainer({ assert }: Context) {
    ioc.singleton('App/Queue/Workers/ProductWorker', () => {})

    const ProductWorker = await this.import('#tests/fixtures/workers/ProductWorker')

    assert.isFalse(Annotation.isAnnotated(ProductWorker))
  }
}
