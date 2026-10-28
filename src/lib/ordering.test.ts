import { describe, expect, it } from 'vitest'

import { byOrder, moveBatch } from './ordering'

/**
 * Catalog ordering — phase G2. The first fixture is the live category list
 * (measured 2026-10-28): `0, 1, 2` and the probe category at `99`.
 */

const live = [
  { id: 'popular', sortOrder: 0 },
  { id: 'vip', sortOrder: 1 },
  { id: 'stage', sortOrder: 2 },
  { id: 'probe', sortOrder: 99 },
]

describe('display order', () => {
  it('sorts ascending, with a missing sortOrder last', () => {
    const rows = [
      { id: 'none', sortOrder: null },
      { id: 'b', sortOrder: 5 },
      { id: 'a', sortOrder: 1 },
    ]
    expect(byOrder(rows).map((row) => row.id)).toEqual(['a', 'b', 'none'])
  })

  it('keeps ties in server order', () => {
    const rows = [
      { id: 'x', sortOrder: 0 },
      { id: 'y', sortOrder: 0 },
      { id: 'z', sortOrder: 0 },
    ]
    expect(byOrder(rows).map((row) => row.id)).toEqual(['x', 'y', 'z'])
  })

  it('does not mutate its input', () => {
    const rows = [
      { id: 'b', sortOrder: 2 },
      { id: 'a', sortOrder: 1 },
    ]
    byOrder(rows)
    expect(rows[0]?.id).toBe('b')
  })
})

describe('moving one row', () => {
  it('sends only the rows whose number changed — the gap is closed on the way', () => {
    /*
     * `stage` already holds 2 and is left out. `probe` moves from 99 to 3:
     * not a position change, but a renumbering the group needs so the next
     * move is a move.
     */
    expect(moveBatch(live, 'vip', 'up')).toEqual({
      items: [
        { id: 'vip', sortOrder: 0 },
        { id: 'popular', sortOrder: 1 },
        { id: 'probe', sortOrder: 3 },
      ],
    })
  })

  it('renumbers past a gap rather than swapping into it', () => {
    /*
     * ⚠️ A swap would give `stage` 99 and `probe` 2 — correct here by luck,
     * and the gap survives to confuse the next move.
     */
    expect(moveBatch(live, 'stage', 'down')).toEqual({
      items: [
        { id: 'probe', sortOrder: 2 },
        { id: 'stage', sortOrder: 3 },
      ],
    })
  })

  it('actually moves rows that share a sortOrder', () => {
    /* ⚠️ The case a swap gets wrong: 0 ↔ 0 changes nothing. */
    const tied = [
      { id: 'x', sortOrder: 0 },
      { id: 'y', sortOrder: 0 },
      { id: 'z', sortOrder: 0 },
    ]
    /* `y` already holds 0, so it is the one row not sent. */
    expect(moveBatch(tied, 'y', 'up')).toEqual({
      items: [
        { id: 'x', sortOrder: 1 },
        { id: 'z', sortOrder: 2 },
      ],
    })
  })

  it.each([
    ['the first row up', 'popular', 'up'],
    ['the last row down', 'probe', 'down'],
    ['an unknown id', 'missing', 'up'],
  ] as const)('returns null for %s, never an empty batch', (_, id, direction) => {
    /* The server answers `{"items": []}` with a 400. */
    expect(moveBatch(live, id, direction)).toBeNull()
  })
})
