/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import 'reflect-metadata'

import { debug } from '#src/debug'
import { Options } from '@athenna/common'
import { Annotation } from '@athenna/ioc'
import type { JobOptions } from '#src/types/JobOptions'

/**
 * Create a job inside the service provider.
 */
export function Job(options?: JobOptions): ClassDecorator {
  return (target: any) => {
    options = Options.create(options, {
      alias: `App/Jobs/${target.name}`,
      type: 'transient'
    })

    debug('Registering validator metadata for the service container %o', {
      ...options,
      name: target.name
    })

    if (ioc.has(options.alias)) {
      debug(
        'Skipping registration, alias %s is already registered.',
        options.alias
      )

      return
    }

    Annotation.defineMeta(target, options)
  }
}
