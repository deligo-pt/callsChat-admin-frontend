/**
 * Deterministic pseudo-random generator (mulberry32).
 *
 * The mock dataset must be identical on every reload and in every test run —
 * a flaky fixture produces a flaky test suite, and an operator comparing two
 * screenshots of the mock app should see the same records.
 */
export function createRandom(seed: number) {
  let state = seed >>> 0

  function next(): number {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int: (min: number, max: number): number =>
      min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)]
      if (item === undefined) throw new Error('pick() called with an empty array')
      return item
    },
    bool: (probability = 0.5): boolean => next() < probability,
    /** ISO timestamp between `daysAgoMax` and `daysAgoMin` days before now. */
    pastDate: (daysAgoMax: number, daysAgoMin = 0): string => {
      const now = Date.UTC(2026, 7, 19, 12, 0, 0)
      const span = (daysAgoMax - daysAgoMin) * 24 * 60 * 60 * 1000
      const offset = daysAgoMin * 24 * 60 * 60 * 1000 + Math.floor(next() * span)
      return new Date(now - offset).toISOString()
    },
  }
}

export type Random = ReturnType<typeof createRandom>
