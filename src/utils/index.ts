/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

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
}
