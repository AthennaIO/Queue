/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Log } from '@athenna/logger'
import type { MemoryDriver } from '#src/drivers/MemoryDriver'
import { ExceptionHandler, type ExceptionHandlerContext } from '@athenna/common'

export type MemoryDriverExceptionHandlerContext = ExceptionHandlerContext & {
  job: any
  driver: MemoryDriver
  requeueJitterMs: number
}

export class MemoryDriverExceptionHandler extends ExceptionHandler {
  public async handle({
    job,
    error,
    driver,
    requeueJitterMs
  }: MemoryDriverExceptionHandlerContext) {
    const shouldRetry = job.attempts > 0

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await super.handle({ job, error, driver, requeueJitterMs })

    job.reservedUntil = null

    if (Config.is('worker.logger.prettifyException')) {
      Log.channelOrVanilla('exception').error(
        await error.toAthennaException().prettify()
      )
    } else {
      Log.channelOrVanilla('exception').error({
        msg: `failed to process job: ${error.message}`,
        queue: driver.queueName,
        deadletter: driver.deadletter,
        name: error.name,
        code: error.code,
        help: error.help,
        details: error.details,
        metadata: error.metadata,
        stack: error.stack,
        job
      })
    }

    if (shouldRetry) {
      job.availableAt =
        Date.now() +
        driver.calculateBackoffDelay(job.attempts) +
        requeueJitterMs

      return
    }

    await driver.ack(job.id)

    if (driver.deadletter) {
      driver.client.queues[driver.deadletter].push({
        ...job,
        attempts: 0
      })
    }
  }
}
