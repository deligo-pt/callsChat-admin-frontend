import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { DEFAULT_PAGE_SIZE } from '@/components/data'
import type {
  VerificationListQuery,
  VerificationStatusFilter,
  VerificationTargetTypeFilter,
} from '@/types/verification'

import {
  DEFAULT_STATUS,
  FILTER_KEYS,
  MAX_LIMIT,
  isNarrowedStatus,
  isStatusFilter,
  isTargetTypeFilter,
  type FilterKey,
} from './listParams'

/**
 * Verification-queue filter state, owned by the URL.
 *
 * plan.md §1C: filters live in the query string so a view survives a refresh
 * and can be pasted to a colleague — which matters here for the same reason it
 * does in feedback, except the message is *"can you look at this one"* about a
 * person's identity documents.
 *
 * ⚠️ **`status` is always present in `query`, whatever the URL says.** That is
 * the §3.8 mitigation and it is the single most important line in this hook: a
 * request without `status` is silently filtered to the pending applications,
 * and an operator reading that as "everything" would conclude the approved ones
 * had vanished.
 */

const DEFAULTS = {
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
} as const

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const parsed = Number.parseInt(params.get(key) ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export interface UseVerificationListParams {
  /** Exactly what is sent to `GET /admin/verifications`. */
  readonly query: VerificationListQuery
  readonly status: VerificationStatusFilter
  readonly targetType: VerificationTargetTypeFilter
  readonly search: string | undefined
  readonly page: number
  readonly limit: number
  readonly setStatus: (status: string) => void
  readonly setTargetType: (targetType: string) => void
  readonly setSearch: (search: string | undefined) => void
  readonly setPage: (page: number) => void
  readonly setLimit: (limit: number) => void
  /** Back to the default view — **not** to an unfiltered one. See below. */
  readonly clearAll: () => void
  /** Filters that narrow the result. Drives the empty-state copy. */
  readonly activeFilterCount: number
}

export function useVerificationListParams(): UseVerificationListParams {
  const [searchParams, setSearchParams] = useSearchParams()

  /*
   * A hand-edited value is dropped rather than sent: both enums are validated
   * strictly, so `?status=ARCHIVED` would 400 the whole page rather than being
   * ignored.
   */
  const status = useMemo<VerificationStatusFilter>(() => {
    const raw = searchParams.get('status')?.trim()
    return raw && isStatusFilter(raw) ? raw : DEFAULT_STATUS
  }, [searchParams])

  const targetType = useMemo<VerificationTargetTypeFilter>(() => {
    const raw = searchParams.get('targetType')?.trim()
    return raw && isTargetTypeFilter(raw) ? raw : 'ALL'
  }, [searchParams])

  const search = searchParams.get('search')?.trim() || undefined

  const page = readInt(searchParams, 'page', DEFAULTS.page)
  // Clamp to the API's ceiling; a larger value is a 400, not a bigger page.
  const limit = Math.min(readInt(searchParams, 'limit', DEFAULTS.limit), MAX_LIMIT)

  const query = useMemo<VerificationListQuery>(
    () => ({
      page,
      limit,
      /*
       * ⚠️ Unconditional. `VerificationListQuery` makes it a required key for
       * exactly this reason — there is no branch here that could drop it.
       */
      status,
      ...(targetType !== 'ALL' ? { targetType } : {}),
      ...(search ? { search } : {}),
    }),
    [page, limit, status, targetType, search],
  )

  /**
   * All writes go through here so one rule holds everywhere: changing anything
   * except the page returns to page 1.
   *
   * Landing on page 7 of a three-page result is the classic filter bug, and on
   * this endpoint it does not even fail loudly — `?page=99` answers 200 with an
   * empty array and the page echoed back (§3.9).
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

  const setStatus = useCallback(
    (value: string) => {
      update((next) => {
        /*
         * ⚠️ `ALL` is written to the URL like any other value, and only the
         * default is omitted. It is a filter the operator chose, not the
         * absence of one — and on this endpoint the absence of one means
         * something else entirely (§3.8).
         */
        if (value === DEFAULT_STATUS) next.delete('status')
        else next.set('status', value)
      })
    },
    [update],
  )

  const setTargetType = useCallback(
    (value: string) => {
      update((next) => {
        if (value === 'ALL') next.delete('targetType')
        else next.set('targetType', value)
      })
    },
    [update],
  )

  const setSearch = useCallback(
    (value: string | undefined) => {
      update((next) => {
        if (value) next.set('search', value)
        else next.delete('search')
      })
    },
    [update],
  )

  const setPage = useCallback(
    (value: number) => {
      update((next) => {
        if (value <= 1) next.delete('page')
        else next.set('page', String(value))
      }, false)
    },
    [update],
  )

  const setLimit = useCallback(
    (value: number) => {
      update((next) => {
        if (value === DEFAULTS.limit) next.delete('limit')
        else next.set('limit', String(Math.min(value, MAX_LIMIT)))
      })
    },
    [update],
  )

  /**
   * ⚠️ Clears to the **default** view, not to an unfiltered one.
   *
   * Removing every parameter leaves `status` at `PENDING`, which is still a
   * filter. That is deliberate: "Clear all" returning the screen to its landing
   * state is what an operator expects, and the filter bar says which status is
   * showing either way. Anyone who wants all five statuses picks `All statuses`.
   */
  const clearAll = useCallback(() => {
    update((next) => {
      for (const key of FILTER_KEYS) next.delete(key)
    })
  }, [update])

  return {
    query,
    status,
    targetType,
    search,
    page,
    limit,
    setStatus,
    setTargetType,
    setSearch,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount:
      (isNarrowedStatus(status) ? 1 : 0) +
      (targetType !== 'ALL' ? 1 : 0) +
      (search ? 1 : 0),
  }
}

export type { FilterKey }
