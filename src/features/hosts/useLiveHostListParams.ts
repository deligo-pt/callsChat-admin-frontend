import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import type { LiveHostQuery } from '@/api/hosts'
import { DEFAULT_PAGE_SIZE } from '@/components/data'
import { LIVE_HOST_STATUSES, type LiveHostStatus } from '@/types/hosts'

import { ANY, MAX_LIMIT } from './listParams'

/**
 * Roster filter state, owned by the URL (plan.md §4.4, phase H6).
 *
 * ⚠️ **`?status=` must be read here, not ignored.** The applications stats
 * strip links to `/hosts?status=ACTIVE` and `/hosts?status=SUSPENDED` (H4) —
 * if this hook dropped the parameter, clicking "Active live hosts" would land
 * an operator on an unfiltered roster that silently answered a different
 * question from the one the tile asked.
 *
 * ⚠️ `status` is case-SENSITIVE on this route, exactly as on the applications
 * route: `?status=active` is a `400`. Nothing here lower-cases it.
 */

export type HostStatusFilter = LiveHostStatus | typeof ANY

export function isHostStatusFilter(value: string): value is HostStatusFilter {
  return value === ANY || (LIVE_HOST_STATUSES as readonly string[]).includes(value)
}

const FILTER_KEYS = ['status', 'search'] as const

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const parsed = Number.parseInt(params.get(key) ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export interface UseLiveHostListParams {
  readonly query: LiveHostQuery
  readonly status: HostStatusFilter
  readonly search: string | undefined
  readonly page: number
  readonly limit: number
  readonly setStatus: (status: string) => void
  readonly setSearch: (search: string | undefined) => void
  readonly setPage: (page: number) => void
  readonly setLimit: (limit: number) => void
  readonly clearAll: () => void
  readonly activeFilterCount: number
}

export function useLiveHostListParams(): UseLiveHostListParams {
  const [searchParams, setSearchParams] = useSearchParams()

  const status = useMemo<HostStatusFilter>(() => {
    const raw = searchParams.get('status')?.trim()
    return raw && isHostStatusFilter(raw) ? raw : ANY
  }, [searchParams])

  const search = searchParams.get('search')?.trim() || undefined

  const page = readInt(searchParams, 'page', 1)
  const limit = Math.min(readInt(searchParams, 'limit', DEFAULT_PAGE_SIZE), MAX_LIMIT)

  const query = useMemo<LiveHostQuery>(
    () => ({
      page,
      limit,
      ...(status !== ANY ? { status } : {}),
      ...(search ? { search } : {}),
    }),
    [page, limit, status, search],
  )

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

  const setStatus = useCallback(
    (value: string) => {
      update((params) => {
        if (value === ANY) params.delete('status')
        else params.set('status', value)
      })
    },
    [update],
  )

  const setSearch = useCallback(
    (value: string | undefined) => {
      update((params) => {
        if (!value) params.delete('search')
        else params.set('search', value)
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
      update((params) => params.set('limit', String(Math.min(value, MAX_LIMIT))))
    },
    [update],
  )

  const clearAll = useCallback(() => {
    update((params) => {
      for (const key of FILTER_KEYS) params.delete(key)
    })
  }, [update])

  const activeFilterCount = (status !== ANY ? 1 : 0) + (search ? 1 : 0)

  return {
    query,
    status,
    search,
    page,
    limit,
    setStatus,
    setSearch,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount,
  }
}
