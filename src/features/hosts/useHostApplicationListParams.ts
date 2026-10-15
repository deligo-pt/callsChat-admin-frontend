import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { DEFAULT_PAGE_SIZE } from '@/components/data'
import type { HostApplicationQuery } from '@/api/hosts'

import {
  ANY,
  FILTER_KEYS,
  MAX_LIMIT,
  isIsoDate,
  isNicheFilter,
  isStatusFilter,
  type FilterKey,
  type NicheFilter,
  type StatusFilter,
} from './listParams'

/**
 * Host-applications filter state, owned by the URL.
 *
 * Filters live in the query string so a view survives a refresh and can be
 * pasted to a colleague — the same rule every other list in this panel follows.
 *
 * ⚠️ **Every facet is validated before it is sent.** Three of the five are
 * strictly enum- or format-checked server-side, so a hand-edited `?status=OPEN`
 * or `?startDate=yesterday` would `400` the entire page rather than being
 * ignored. A value that fails validation here is dropped and the queue renders
 * unfiltered, which is the recoverable failure.
 *
 * ⚠️ `niche` is the exception that proves the rule: the server does **not**
 * validate it (plan.md §3.2), so a bad value would return a silently wrong set
 * instead of an error. It is validated here for the opposite reason — not to
 * avoid a 400, but because nothing downstream will catch the mistake.
 */

const DEFAULTS = {
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
} as const

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const parsed = Number.parseInt(params.get(key) ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export interface UseHostApplicationListParams {
  /** Exactly what is sent to `GET /admin/live/host-applications`. */
  readonly query: HostApplicationQuery
  readonly status: StatusFilter
  readonly niche: NicheFilter
  readonly search: string | undefined
  readonly startDate: string | undefined
  readonly endDate: string | undefined
  readonly page: number
  readonly limit: number
  readonly setStatus: (status: string) => void
  readonly setNiche: (niche: string) => void
  readonly setSearch: (search: string | undefined) => void
  readonly setDateRange: (start: string | undefined, end: string | undefined) => void
  readonly setPage: (page: number) => void
  readonly setLimit: (limit: number) => void
  readonly clearAll: () => void
  /** How many facets are narrowing the result. Drives the empty-state copy. */
  readonly activeFilterCount: number
}

export function useHostApplicationListParams(): UseHostApplicationListParams {
  const [searchParams, setSearchParams] = useSearchParams()

  const status = useMemo<StatusFilter>(() => {
    const raw = searchParams.get('status')?.trim()
    return raw && isStatusFilter(raw) ? raw : ANY
  }, [searchParams])

  const niche = useMemo<NicheFilter>(() => {
    const raw = searchParams.get('niche')?.trim()
    return raw && isNicheFilter(raw) ? raw : ANY
  }, [searchParams])

  const search = searchParams.get('search')?.trim() || undefined

  const startDate = useMemo(() => {
    const raw = searchParams.get('startDate')?.trim()
    return raw && isIsoDate(raw) ? raw : undefined
  }, [searchParams])

  const endDate = useMemo(() => {
    const raw = searchParams.get('endDate')?.trim()
    return raw && isIsoDate(raw) ? raw : undefined
  }, [searchParams])

  const page = readInt(searchParams, 'page', DEFAULTS.page)
  /* Clamped to the API's ceiling; a larger value is a 400, not a bigger page. */
  const limit = Math.min(readInt(searchParams, 'limit', DEFAULTS.limit), MAX_LIMIT)

  const query = useMemo<HostApplicationQuery>(
    () => ({
      page,
      limit,
      /*
       * ⚠️ Sent verbatim, upper-case, never normalised. `status` is
       * case-sensitive on this route and `.toLowerCase()` anywhere on this path
       * is a guaranteed 400 (plan.md §3.1).
       */
      ...(status !== ANY ? { status } : {}),
      ...(niche !== ANY ? { niche } : {}),
      ...(search ? { search } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    }),
    [page, limit, status, niche, search, startDate, endDate],
  )

  /** Writing any filter returns to page 1 — page 4 of a new filter is nothing. */
  const update = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          mutate(params)
          params.delete('page')
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setFacet = useCallback(
    (key: FilterKey, value: string) => {
      update((params) => {
        if (value === ANY || value === '') params.delete(key)
        else params.set(key, value)
      })
    },
    [update],
  )

  const setStatus = useCallback(
    (value: string) => setFacet('status', value),
    [setFacet],
  )
  const setNiche = useCallback((value: string) => setFacet('niche', value), [setFacet])
  const setSearch = useCallback(
    (value: string | undefined) => setFacet('search', value ?? ''),
    [setFacet],
  )

  /**
   * Both ends move together.
   *
   * ⚠️ Set separately, a half-applied range is a legal URL the service accepts
   * — `?startDate=` alone filters from that date to now, which is a different
   * question from the one the operator asked. One setter keeps them in step.
   */
  const setDateRange = useCallback(
    (start: string | undefined, end: string | undefined) => {
      update((params) => {
        if (start) params.set('startDate', start)
        else params.delete('startDate')
        if (end) params.set('endDate', end)
        else params.delete('endDate')
      })
    },
    [update],
  )

  const setPage = useCallback(
    (value: number) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          if (value <= 1) params.delete('page')
          else params.set('page', String(value))
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setLimit = useCallback(
    (value: number) => {
      update((params) => {
        params.set('limit', String(Math.min(value, MAX_LIMIT)))
      })
    },
    [update],
  )

  const clearAll = useCallback(() => {
    update((params) => {
      for (const key of FILTER_KEYS) params.delete(key)
    })
  }, [update])

  const activeFilterCount = FILTER_KEYS.filter((key) => {
    if (key === 'status') return status !== ANY
    if (key === 'niche') return niche !== ANY
    if (key === 'search') return Boolean(search)
    if (key === 'startDate') return Boolean(startDate)
    return Boolean(endDate)
  }).length

  return {
    query,
    status,
    niche,
    search,
    startDate,
    endDate,
    page,
    limit,
    setStatus,
    setNiche,
    setSearch,
    setDateRange,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount,
  }
}
