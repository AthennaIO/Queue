/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Log } from '@athenna/logger'
import type { DatabaseDriver } from '#src/drivers/DatabaseDriver'
import { ExceptionHandler, type ExceptionHandlerContext } from '@athenna/common'

export type DatabaseDriverExceptionHandlerContext = ExceptionHandlerContext & {
  job: any
  driver: DatabaseDriver
  requeueJitterMs: number
}

export class DatabaseDriverExceptionHandler extends ExceptionHandler {
  public async handle({
    job,
    error,
    driver,
    requeueJitterMs
  }: DatabaseDriverExceptionHandlerContext) {
    const shouldRetry = job.attempts > 0

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await super.handle({ job, error, driver, requeueJitterMs })

    if (Config.is('worker.logger.prettifyException', true)) {
      Log.channelOrVanilla('exception').error(
        await error.toAthennaException().prettify()
      )
    } else {
      error.otherInfos = {
        ...error.otherInfos,
        queue: driver.queueName,
        deadletter: driver.deadletter,
        job
      }

      Log.channelOrVanilla('exception').error(error)
    }

    if (!shouldRetry) {
      await driver.ack(job.id)

      if (driver.deadletter) {
        await driver.client.table(driver.table).create({
          ...job,
          queue: driver.deadletter,
          reservedUntil: null,
          attempts: 0
        })
      }

      return
    }

    await driver.client
      .table(driver.table)
      .where('id', job.id)
      .update({
        reservedUntil: null,
        availableAt:
          Date.now() +
          driver.calculateBackoffDelay(job.attempts) +
          requeueJitterMs
      })
  }
}
