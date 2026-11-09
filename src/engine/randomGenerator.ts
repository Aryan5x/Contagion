/** Seeded pseudo-random number generation (mulberry32) so every run is reproducible. */

export function hashSeed(...parts: Array<number | string>): number {
  // FNV-1a over the stringified parts.
  let h = 0x811c9dc5
  const s = parts.join('|')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed | 0
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n)
  }

  /** Bernoulli trial with success probability p. */
  chance(p: number): boolean {
    if (p <= 0) return false
    if (p >= 1) return true
    return this.next() < p
  }

  /** k distinct integers from 0..n-1 (partial Fisher-Yates), in selection order. */
  sample(n: number, k: number): number[] {
    const kk = Math.max(0, Math.min(k, n))
    const pool = Array.from({ length: n }, (_, i) => i)
    for (let i = 0; i < kk; i++) {
      const j = i + this.int(n - i)
      const tmp = pool[i]
      pool[i] = pool[j]
      pool[j] = tmp
    }
    return pool.slice(0, kk)
  }

  /** k distinct items drawn from an explicit list. */
  sampleFrom<T>(items: readonly T[], k: number): T[] {
    return this.sample(items.length, k).map((i) => items[i])
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000)
}
