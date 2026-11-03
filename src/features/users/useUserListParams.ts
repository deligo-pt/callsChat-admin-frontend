import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { DEFAULT_PAGE_SIZE } from '@/components/data'
import { MAX_PAGE_SIZE, type SortOrder } from '@/types/common'

import {
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  HOST_FILTER_VALUES,
  SORTABLE_FIELDS,
  type HostFilter,
  type UserListParams,
} from './listParams'

/**
 * Filter state, owned by the URL.
 *
 * plan.md §1C: filters live in the query string so a view survives a refresh
 * and can be pasted to a colleague. That also makes the browser back button
 * behave the way an operator expects — undoing the last filter change rather
 * than leaving the page.
 */

const DEFAULTS = {
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  sortBy: DEFAULT_SORT_BY,
  sortOrder: DEFAULT_SORT_ORDER,
} as const

/** Filter keys the URL may carry, beyond paging and sorting. */
export const FILTER_KEYS = [
  'search',
  'status',
  'role',
  'accountType',
  'hasRestrictions',
  'host',
] as const

/**
 * Values the API would misread are dropped on the way in, so a hand-edited or
 * old link can never show a filter chip that filters nothing — or, worse,
 * the opposite of what it says.
 */
const ACCEPTED: Partial<Record<FilterKey, readonly string[]>> = {
  /* Any non-empty value means "has restrictions" live (`UNSUPPORTED_FILTERS`). */
  hasRestrictions: ['true'],
  host: HOST_FILTER_VALUES,
}

export type FilterKey = (typeof FILTER_KEYS)[number]

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const parsed = Number.parseInt(params.get(key) ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export interface UseUserListParams {
  /** What is sent to `GET /admin/users` — never the Host filter. */
  readonly params: UserListParams
  /** Applied by the browser, not the API (`useUserDirectory`). */
  readonly hostFilter: HostFilter | undefined
  readonly filters: Readonly<Partial<Record<FilterKey, string>>>
  readonly setFilter: (key: FilterKey, value: string | undefined) => void
  readonly setPage: (page: number) => void
  readonly setLimit: (limit: number) => void
  readonly setSort: (field: string, order: SortOrder) => void
  readonly clearAll: () => void
  readonly activeFilterCount: number
}

export function useUserListParams(): UseUserListParams {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo(() => {
    const result: Partial<Record<FilterKey, string>> = {}
    for (const key of FILTER_KEYS) {
      const value = searchParams.get(key)?.trim()
      const accepted = ACCEPTED[key]
      if (value && (!accepted || accepted.includes(value))) result[key] = value
    }
    return result
  }, [searchParams])

  const serverFilters = useMemo(() => {
    const { host: _host, ...rest } = filters
    return rest
  }, [filters])

  const params = useMemo<UserListParams>(() => {
    const sortBy = searchParams.get('sortBy') ?? DEFAULTS.sortBy
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

    return {
      page: readInt(searchParams, 'page', DEFAULTS.page),
      // Clamp to the API's documented ceiling; a larger value is a 400.
      limit: Math.min(readInt(searchParams, 'limit', DEFAULTS.limit), MAX_PAGE_SIZE),
      // Guard the allowlist so a hand-edited URL cannot 400 the whole page.
      sortBy: SORTABLE_FIELDS.includes(sortBy) ? sortBy : DEFAULTS.sortBy,
      sortOrder: sortOrder satisfies SortOrder,
      ...serverFilters,
    }
  }, [searchParams, serverFilters])

  /**
   * All writes go through here so one rule is enforced everywhere: changing
   * anything except the page returns to page 1. Landing on page 7 of a
   * three-page result is the classic filter bug.
   */
  const update = useCallback(
    (mutate: (next: URLSearchParams) => void, resetPage = true) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          mutate(next)
          if (resetPage) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setFilter = useCallback(
    (key: FilterKey, value: string | undefined) => {
      update((next) => {
        // Empty and "all" mean "no filter" — keep them out of the URL entirely.
        if (!value || value === 'all') next.delete(key)
        else next.set(key, value)
      })
    },
    [update],
  )

  const setPage = useCallback(
    (page: number) => {
      update((next) => {
        if (page <= 1) next.delete('page')
        else next.set('page', String(page))
      }, false)
    },
    [update],
  )

  const setLimit = useCallback(
    (limit: number) => {
      update((next) => {
        if (limit === DEFAULTS.limit) next.delete('limit')
        else next.set('limit', String(Math.min(limit, MAX_PAGE_SIZE)))
      })
    },
    [update],
  )

  const setSort = useCallback(
    (field: string, order: SortOrder) => {
      update((next) => {
        if (field === DEFAULTS.sortBy && order === DEFAULTS.sortOrder) {
          next.delete('sortBy')
          next.delete('sortOrder')
          return
        }
        next.set('sortBy', field)
        next.set('sortOrder', order)
      })
    },
    [update],
  )

  const clearAll = useCallback(() => {
    update((next) => {
      for (const key of FILTER_KEYS) next.delete(key)
    })
  }, [update])

  return {
    params,
    hostFilter: filters.host as HostFilter | undefined,
    filters,
    setFilter,
    setPage,
    setLimit,
    setSort,
    clearAll,
    activeFilterCount: Object.keys(filters).length,
  }
}
