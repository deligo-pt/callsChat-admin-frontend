import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { DEFAULT_PAGE_SIZE } from '@/components/data'

import {
  FILTER_KEYS,
  HIDE_DELETED_KEY,
  MAX_LIMIT,
  type FilterKey,
  type StaffQueryParams,
} from './listParams'

/**
 * Staff-directory filter state, owned by the URL.
 *
 * plan.md §1C: filters live in the query string so a view survives a refresh
 * and can be pasted to a colleague, and the back button undoes the last filter
 * change rather than leaving the page.
 *
 * Mirrors `useUserListParams` with one deliberate omission and one addition:
 * there is no `setSort` (the endpoint ignores `sortBy` — see `listParams.ts`),
 * and `hideDeleted` is a client-side view toggle that never reaches the API.
 */

const DEFAULTS = { page: 1, limit: DEFAULT_PAGE_SIZE } as const

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const parsed = Number.parseInt(params.get(key) ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export interface UseStaffListParams {
  /** Exactly what is sent to `GET /admin/staff`. Excludes `hideDeleted`. */
  readonly params: StaffQueryParams
  readonly filters: Readonly<Partial<Record<FilterKey, string>>>
  readonly hideDeleted: boolean
  readonly setFilter: (key: FilterKey, value: string | undefined) => void
  readonly setHideDeleted: (hide: boolean) => void
  readonly setPage: (page: number) => void
  readonly setLimit: (limit: number) => void
  readonly clearAll: () => void
  /** Server-side filters only — drives copy about what the API was asked for. */
  readonly activeFilterCount: number
}

export function useStaffListParams(): UseStaffListParams {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo(() => {
    const result: Partial<Record<FilterKey, string>> = {}
    for (const key of FILTER_KEYS) {
      const value = searchParams.get(key)?.trim()
      if (value) result[key] = value
    }
    return result
  }, [searchParams])

  /*
   * Defaults to ON, so the parameter is absent from the URL in the common
   * case and present only when the operator has deliberately asked to see
   * deleted accounts. `'false'` is the opt-out, not `'true'` the opt-in.
   */
  const hideDeleted = searchParams.get(HIDE_DELETED_KEY) !== 'false'

  const params = useMemo<StaffQueryParams>(
    () => ({
      page: readInt(searchParams, 'page', DEFAULTS.page),
      // Clamp to the API's ceiling; a larger value is a 400, not a big page.
      limit: Math.min(readInt(searchParams, 'limit', DEFAULTS.limit), MAX_LIMIT),
      ...filters,
    }),
    [searchParams, filters],
  )

  /**
   * All writes go through here so one rule holds everywhere: changing anything
   * except the page returns to page 1. Landing on page 7 of a three-page
   * result is the classic filter bug.
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

  const setHideDeleted = useCallback(
    (hide: boolean) => {
      /*
       * Resets to page 1 like any other filter. It removes rows from the
       * rendered page, so staying on page 3 could leave the operator looking
       * at nothing with no indication why.
       */
      update((next) => {
        if (hide) next.delete(HIDE_DELETED_KEY)
        else next.set(HIDE_DELETED_KEY, 'false')
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
        else next.set('limit', String(Math.min(limit, MAX_LIMIT)))
      })
    },
    [update],
  )

  const clearAll = useCallback(() => {
    /*
     * Clears the server filters only. `hideDeleted` is a view preference, not
     * a filter the operator applied to a search — resetting it here would
     * silently re-show deleted accounts as a side effect of clearing a name
     * search.
     */
    update((next) => {
      for (const key of FILTER_KEYS) next.delete(key)
    })
  }, [update])

  return {
    params,
    filters,
    hideDeleted,
    setFilter,
    setHideDeleted,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount: Object.keys(filters).length,
  }
}
