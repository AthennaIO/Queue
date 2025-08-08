/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Env } from '@athenna/config'

export default {
  /*
  |--------------------------------------------------------------------------
  | Default Queue Connection Name
  |--------------------------------------------------------------------------
  |
  | Athenna's queue API supports an assortment of back-ends via a single
  | API, giving you convenient access to each back-end using the same
  | syntax for every one. Here you may define a default connection.
  |
  */

  default: Env('QUEUE_CONNECTION', 'memory'),

  /*
   |--------------------------------------------------------------------------
   | Queue Connections
   |--------------------------------------------------------------------------
   |
   | Here you may configure the connection information for each server that
   | is used by your application. A default configuration has been added
   | for each back-end shipped with Athenna. You are free to add more.
   |
   | Drivers: "memory", "database", "awsSqs", "fake"
   |
   */

  connections: {
    memory: {
      driver: 'memory',
      queue: 'default',
      deadletter: 'deadletter'
    },

    memoryBackoff: {
      driver: 'memory',
      queue: 'default',
      deadletter: 'deadletter',
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 1000,
        jitter: 0.5
      }
    },

    awsSqs: {
      driver: 'aws_sqs',
      type: 'standard',
      queue: 'https://sqs.sa-east-1.amazonaws.com/528757804004/athenna_queue',
      deadletter: 'https://sqs.sa-east-1.amazonaws.com/528757804004/athenna_queue_dlq'
    },

    awsSqsBackoff: {
      driver: 'aws_sqs',
      type: 'standard',
      queue: 'https://sqs.sa-east-1.amazonaws.com/528757804004/athenna_queue',
      deadletter: 'https://sqs.sa-east-1.amazonaws.com/528757804004/athenna_queue_dlq',
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 1000,
        jitter: 0.5
      }
    },

    database: {
      driver: 'database',
      table: 'jobs',
      connection: 'sqlite',
      queue: 'default',
      deadletter: 'deadletter'
    },

    databaseBackoff: {
      driver: 'database',
      table: 'jobs',
      connection: 'sqlite',
      queue: 'default',
      deadletter: 'deadletter',
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 1000,
        jitter: 0.5
      }
    },

    discard: {
      driver: 'fake'
    },

    fake: {
      driver: 'fake'
    },

    'not-found': {
      driver: 'not-found'
    },

    test: {
      driver: 'test'
    }
  }
}
