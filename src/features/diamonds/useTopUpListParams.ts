import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import type { TopUpRequestQuery } from '@/api/wallet'
import { DEFAULT_PAGE_SIZE } from '@/components/data'

import {
  ANY,
  FILTER_KEYS,
  isIsoDate,
  isMethodFilter,
  isStatusFilter,
  MAX_LIMIT,
  type MethodFilter,
  type StatusFilter,
} from './listParams'

/**
 * Queue filter state, owned by the URL (plan.md §4, phase W2).
 *
 * ⚠️ **A malformed value is dropped, never forwarded.** For `status` and
 * `method` that prevents a hand-edited URL from 400-ing the page. For the two
 * dates it prevents something worse: the server accepts `startDate=hello` and
 * filters on it, so forwarding a typo would return a shorter list with no
 * error and nothing on screen to explain the missing rows.
 */
export interface UseTopUpListParams {
  readonly query: TopUpRequestQuery
  readonly status: StatusFilter
  readonly method: MethodFilter
  readonly search: string | undefined
  readonly startDate: string | undefined
  readonly endDate: string | undefined
  readonly page: number
  readonly limit: number
  readonly setStatus: (status: string) => void
  readonly setMethod: (method: string) => void
  readonly setSearch: (search: string | undefined) => void
  readonly setDateRange: (start: string | undefined, end: string | undefined) => void
  readonly setPage: (page: number) => void
  readonly setLimit: (limit: number) => void
  readonly clearAll: () => void
  readonly activeFilterCount: number
}

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const parsed = Number.parseInt(params.get(key) ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readDate(params: URLSearchParams, key: string): string | undefined {
  const raw = params.get(key)?.trim()
  return raw && isIsoDate(raw) ? raw : undefined
}

export function useTopUpListParams(): UseTopUpListParams {
  const [searchParams, setSearchParams] = useSearchParams()

  const status = useMemo<StatusFilter>(() => {
    const raw = searchParams.get('status')?.trim()
    return raw && isStatusFilter(raw) ? raw : ANY
  }, [searchParams])

  const method = useMemo<MethodFilter>(() => {
    const raw = searchParams.get('method')?.trim()
    return raw && isMethodFilter(raw) ? raw : ANY
  }, [searchParams])

  const search = searchParams.get('search')?.trim() || undefined
  const startDate = readDate(searchParams, 'startDate')
  const endDate = readDate(searchParams, 'endDate')

  const page = readInt(searchParams, 'page', 1)
  const limit = Math.min(readInt(searchParams, 'limit', DEFAULT_PAGE_SIZE), MAX_LIMIT)

  const query = useMemo<TopUpRequestQuery>(
    () => ({
      page,
      limit,
      ...(status !== ANY ? { status } : {}),
      ...(method !== ANY ? { method } : {}),
      ...(search ? { search } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    }),
    [page, limit, status, method, search, startDate, endDate],
  )

  const update = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          mutate(params)
          /* Any filter change returns to page 1 — page 7 of a new result set
           * is almost always an empty table the operator did not ask for. */
          params.delete('page')
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setStatus = useCallback(
    (value: string) =>
      update((params) => {
        if (value === ANY) params.delete('status')
        else params.set('status', value)
      }),
    [update],
  )

  const setMethod = useCallback(
    (value: string) =>
      update((params) => {
        if (value === ANY) params.delete('method')
        else params.set('method', value)
      }),
    [update],
  )

  const setSearch = useCallback(
    (value: string | undefined) =>
      update((params) => {
        if (!value) params.delete('search')
        else params.set('search', value)
      }),
    [update],
  )

  const setDateRange = useCallback(
    (start: string | undefined, end: string | undefined) =>
      update((params) => {
        /*
         * ⚠️ Written only when valid. An operator mid-typing produces
         * `2026-1` on the way to `2026-10-27`, and writing that would send a
         * garbage filter the server accepts.
         */
        if (start && isIsoDate(start)) params.set('startDate', start)
        else params.delete('startDate')

        if (end && isIsoDate(end)) params.set('endDate', end)
        else params.delete('endDate')
      }),
    [update],
  )

  const setPage = useCallback(
    (value: number) =>
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          if (value <= 1) params.delete('page')
          else params.set('page', String(value))
          return params
        },
        { replace: true },
      ),
    [setSearchParams],
  )

  const setLimit = useCallback(
    (value: number) =>
      update((params) => params.set('limit', String(Math.min(value, MAX_LIMIT)))),
    [update],
  )

  const clearAll = useCallback(
    () =>
      update((params) => {
        for (const key of FILTER_KEYS) params.delete(key)
      }),
    [update],
  )

  const activeFilterCount =
    (status !== ANY ? 1 : 0) +
    (method !== ANY ? 1 : 0) +
    (search ? 1 : 0) +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0)

  return {
    query,
    status,
    method,
    search,
    startDate,
    endDate,
    page,
    limit,
    setStatus,
    setMethod,
    setSearch,
    setDateRange,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount,
  }
}
