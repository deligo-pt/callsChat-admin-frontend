import type { ReorderPayload } from '@/types/catalog'

/**
 * Catalog ordering (plan.md §2.7, phase G2; shared with emoji packs in G4).
 *
 * ⚠️ **A move renumbers the whole group, then sends only what changed.**
 * Swapping two rows' `sortOrder` looks simpler and is wrong on real data:
 * the live probe category sits at `99` beside siblings at `0, 1, 2`, and any
 * two rows that share a value swap into the same value and do not move at
 * all. Renumbering to `0…n-1` makes every move visible, and filtering to the
 * changed rows keeps the batch small — never empty, because the server
 * refuses `{"items": []}`.
 */

export interface Orderable {
  readonly id: string
  readonly sortOrder?: number | null | undefined
}

export type Direction = 'up' | 'down'

/**
 * The display order. `sortOrder` ascending, missing values last, and ties
 * kept in the order the server sent them — `Array.prototype.sort` is stable.
 */
export function byOrder<T extends Orderable>(rows: readonly T[]): T[] {
  const rank = (row: T) =>
    typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder)
      ? row.sortOrder
      : Number.POSITIVE_INFINITY
  return [...rows].sort((a, b) => rank(a) - rank(b))
}

/**
 * The reorder batch for moving one row one place, or `null` when the move is
 * impossible — first row up, last row down, unknown id.
 *
 * ⚠️ `null` rather than an empty batch: the caller must not send a request
 * the server answers `400` to.
 */
export function moveBatch(
  rows: readonly Orderable[],
  id: string,
  direction: Direction,
): ReorderPayload | null {
  const ordered = byOrder(rows)
  const from = ordered.findIndex((row) => row.id === id)
  if (from === -1) return null

  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= ordered.length) return null

  const moved = [...ordered]
  const [row] = moved.splice(from, 1)
  if (!row) return null
  moved.splice(to, 0, row)

  const items = moved
    .map((candidate, index) => ({
      id: candidate.id,
      sortOrder: index,
      was: candidate.sortOrder,
    }))
    .filter((candidate) => candidate.was !== candidate.sortOrder)
    .map(({ id: changed, sortOrder }) => ({ id: changed, sortOrder }))

  return items.length > 0 ? { items } : null
}

/** ⚠️ Only an explicit `true` is active. A missing flag is not a yes. */
export function isActiveRow(row: { isActive?: boolean | null | undefined }): boolean {
  return row.isActive === true
}
