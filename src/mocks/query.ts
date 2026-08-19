import type { Paginated, PaginationMeta } from '@/types/common'

/**
 * Server-side query simulation.
 *
 * plan.md §2.7: the mock must do REAL pagination, filtering and sorting so the
 * UI is exercised the way it will behave against the backend. If the mock
 * returned everything and let the browser slice it, every list page would be
 * built against a lie.
 */

export interface QueryConfig<TRow> {
  /** Fields matched by the `search` parameter, case-insensitively. */
  readonly searchFields?: readonly (keyof TRow)[]
  /** Fields the client is allowed to sort by — an allowlist, as the API has. */
  readonly sortFields?: readonly string[]
  /** Exact-match filters, keyed by query parameter name. */
  readonly filters?: Readonly<Record<string, (row: TRow, value: string) => boolean>>
}

function readNumber(url: URL, key: string, fallback: number): number {
  const raw = url.searchParams.get(key)
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a ?? '').localeCompare(String(b ?? ''))
}

export function queryCollection<TRow extends object>(
  url: URL,
  rows: readonly TRow[],
  config: QueryConfig<TRow> = {},
): Paginated<TRow> {
  let result = [...rows]

  // Filters
  if (config.filters) {
    for (const [param, predicate] of Object.entries(config.filters)) {
      const value = url.searchParams.get(param)
      if (!value || value === 'all') continue
      result = result.filter((row) => predicate(row, value))
    }
  }

  // Free-text search
  const search = url.searchParams.get('search')?.trim().toLowerCase()
  if (search && config.searchFields?.length) {
    result = result.filter((row) =>
      config.searchFields!.some((field) =>
        String(row[field] ?? '')
          .toLowerCase()
          .includes(search),
      ),
    )
  }

  // Sorting — restricted to the allowlist, exactly as the API does
  const sort = url.searchParams.get('sort')
  const direction = url.searchParams.get('direction') === 'desc' ? -1 : 1
  if (sort && (config.sortFields ?? []).includes(sort)) {
    result.sort(
      (a, b) =>
        compare(
          (a as Record<string, unknown>)[sort],
          (b as Record<string, unknown>)[sort],
        ) * direction,
    )
  }

  // Pagination
  const total = result.length
  const pageSize = Math.min(readNumber(url, 'pageSize', 25), 100)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(readNumber(url, 'page', 1), totalPages)
  const start = (page - 1) * pageSize

  const meta: PaginationMeta = { page, pageSize, total, totalPages }

  return { data: result.slice(start, start + pageSize), meta }
}
