/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Log } from '@athenna/logger'
import type { AwsSqsDriver } from '#src/drivers/AwsSqsDriver'
import { ExceptionHandler, type ExceptionHandlerContext } from '@athenna/common'

export type AwsSqsDriverExceptionHandlerContext = ExceptionHandlerContext & {
  job: any
  driver: AwsSqsDriver
  requeueJitterMs: number
  stopHeartbeat: () => void
}

export class AwsSqsDriverExceptionHandler extends ExceptionHandler {
  public async handle({
    job,
    error,
    driver,
    stopHeartbeat,
    requeueJitterMs
  }: AwsSqsDriverExceptionHandlerContext) {
    stopHeartbeat()

    const receiveCount = Number(
      job.metadata.Attributes?.ApproximateReceiveCount ?? '1'
    )
    const attempts = Math.max(driver.attempts - receiveCount, 0)
    const shouldRetry = attempts > 0

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await super.handle({ job, error, driver, stopHeartbeat, requeueJitterMs })

    if (Config.is('worker.logger.enabled', true)) {
      if (Config.is('worker.logger.prettifyException', true)) {
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
    }

    if (shouldRetry) {
      const delay = driver.calculateBackoffDelay(job.attempts)

      await driver.changeJobVisibility(
        job.id,
        driver.msToS(delay + requeueJitterMs)
      )

      return
    }

    if (driver.deadletter) {
      await driver.sendJobToDLQ(job)
    }

    await driver.ack(job.id)
  }
}
