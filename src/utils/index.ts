/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { InvalidJobDelayException } from '#src/exceptions/InvalidJobDelayException'

export class Utils {
  /**
   * Hash a string.
   */
  public static hash32(s: string) {
    let h = 0x811c9dc5

    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }

    return h >>> 0
  }

  /**
   * Generate a random number between 0 and 1.
   */
  public static prng01(seed: string) {
    const x = this.hash32(seed)

    return x / 0xffffffff
  }

  /**
   * Calculate the noAckDelayMs based on the workerInterval.
   *  Factor ~ φ (1.618) +/- deterministic variation
   *  Never an exact multiple of the interval
   */
  public static computeNoAckDelayMs(baseMs: number, seed: string) {
    const spread = 0.25
    const PHI = (1 + Math.sqrt(5)) / 2
    const prng01 = this.prng01(seed)
    const factor = PHI * (1 - spread + prng01 * (2 * spread))

    let delay = Math.round(baseMs * factor)

    if (baseMs > 0 && delay % baseMs === 0) {
      delay += Math.max(1, Math.round(baseMs * 0.137))
    }

    return Math.max(1, delay)
  }

  /**
   * Resolve the delay given to `later()` into the number of milliseconds
   * from `now` until the job becomes available. A `number` is a delay in
   * milliseconds and a `Date` is the exact instant. A delay `<= 0` or a
   * `Date` in the past resolves to `0` (available now). Fractions of a
   * millisecond are rounded up, so a job never becomes available before
   * its time. Anything else throws an `InvalidJobDelayException`.
   */
  public static resolveDelayMs(delay: number | Date, now = Date.now()) {
    let delayMs: number

    if (delay instanceof Date) {
      delayMs = delay.getTime() - now
    } else if (typeof delay === 'number') {
      delayMs = delay
    }

    if (!Number.isFinite(delayMs)) {
      throw new InvalidJobDelayException(delay)
    }

    return Math.max(0, Math.ceil(delayMs))
  }
}
