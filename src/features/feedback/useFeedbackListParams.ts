import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { DEFAULT_PAGE_SIZE, type DateRange } from '@/components/data'
import { toISODate } from '@/lib/datetime'
import type { SortOrder } from '@/types/common'

import type { FeedbackListParams } from './api'
import {
  DATE_KEYS,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  FILTER_KEYS,
  MAX_LIMIT,
  isSortableField,
  isValidFilterDate,
  sanitiseFilters,
  type FilterKey,
} from './listParams'

/**
 * Feedback-queue filter state, owned by the URL.
 *
 * plan.md §1C: filters live in the query string so a view survives a refresh
 * and can be pasted to a colleague — which matters more here than anywhere
 * else in the panel, because *"look at the criticals"* is a message one
 * operator sends another several times a day.
 *
 * Mirrors `useUserListParams`, with the one addition this endpoint forces: a
 * date range that is **re-validated on the way out** (§3.7). The API accepts
 * `fromDate=yesterday` and answers 200 having quietly ignored it, so a value
 * that fails {@link isValidFilterDate} is stripped from the URL rather than
 * sent — otherwise the operator reads a full, unfiltered queue as a filtered
 * one.
 */

const DEFAULTS = {
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  sortBy: DEFAULT_SORT_BY,
  sortOrder: DEFAULT_SORT_ORDER,
} as const

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const parsed = Number.parseInt(params.get(key) ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export interface UseFeedbackListParams {
  /** Exactly what is sent to `GET /admin/feedbacks`. */
  readonly params: FeedbackListParams
  readonly filters: Readonly<Partial<Record<FilterKey, string>>>
  /** `undefined` when no valid range is set — never a half-parsed one. */
  readonly dateRange: DateRange | undefined
  readonly setFilter: (key: FilterKey, value: string | undefined) => void
  readonly setDateRange: (range: DateRange | undefined) => void
  readonly setPage: (page: number) => void
  readonly setLimit: (limit: number) => void
  readonly setSort: (field: string, order: SortOrder) => void
  readonly clearAll: () => void
  /** Filters the server was actually asked for. Drives the empty-state copy. */
  readonly activeFilterCount: number
}

export function useFeedbackListParams(): UseFeedbackListParams {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo(() => {
    const raw: Partial<Record<FilterKey, string>> = {}
    for (const key of FILTER_KEYS) {
      const value = searchParams.get(key)?.trim()
      if (value) raw[key] = value
    }
    // A hand-edited enum value is dropped rather than sent — it would 400.
    return sanitiseFilters(raw)
  }, [searchParams])

  /**
   * The two date parameters, each valid or absent.
   *
   * ⚠️ This is the §3.7 mitigation, and it is deliberately **per key** rather
   * than per range: `?fromDate=2026-09-01&toDate=yesterday` keeps the half
   * that is real instead of discarding both, which is the behaviour an
   * operator who mistyped one end would expect.
   */
  const dates = useMemo(() => {
    const result: Partial<Record<'fromDate' | 'toDate', string>> = {}
    for (const key of DATE_KEYS) {
      const value = searchParams.get(key)?.trim()
      if (isValidFilterDate(value)) result[key] = value
    }
    return result
  }, [searchParams])

  const dateRange = useMemo<DateRange | undefined>(() => {
    if (!dates.fromDate && !dates.toDate) return undefined
    /*
     * `from` is a required key on `DateRange` even though its value may be
     * undefined, so it is written out rather than spread in conditionally —
     * an end-only range ("everything filed before X") is a legal query on this
     * endpoint and is reachable from a pasted link.
     */
    return {
      from: dates.fromDate ? new Date(`${dates.fromDate}T00:00:00Z`) : undefined,
      ...(dates.toDate ? { to: new Date(`${dates.toDate}T00:00:00Z`) } : {}),
    }
  }, [dates])

  const params = useMemo<FeedbackListParams>(() => {
    const sortBy = searchParams.get('sortBy') ?? DEFAULTS.sortBy
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

    return {
      page: readInt(searchParams, 'page', DEFAULTS.page),
      // Clamp to the API's ceiling; a larger value is a 400, not a big page.
      limit: Math.min(readInt(searchParams, 'limit', DEFAULTS.limit), MAX_LIMIT),
      // Guard the allowlist so a hand-edited URL cannot 400 the whole page.
      sortBy: isSortableField(sortBy) ? sortBy : DEFAULTS.sortBy,
      sortOrder,
      ...filters,
      ...dates,
    }
  }, [searchParams, filters, dates])

  /**
   * All writes go through here so one rule holds everywhere: changing anything
   * except the page returns to page 1. Landing on page 7 of a three-page
   * result is the classic filter bug — and on this endpoint it does not even
   * fail loudly, because `?page=99` answers 200 with an empty array (§3.8).
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

  const setDateRange = useCallback(
    (range: DateRange | undefined) => {
      update((next) => {
        /*
         * Written as `yyyy-MM-dd` in UTC, matching what the picker means by a
         * day and what `toISODate` produces everywhere else in the panel. An
         * end the operator has not chosen yet is simply absent — an
         * open-ended range is a legal query on this endpoint.
         */
        if (range?.from) next.set('fromDate', toISODate(range.from))
        else next.delete('fromDate')

        if (range?.to) next.set('toDate', toISODate(range.to))
        else next.delete('toDate')
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
      for (const key of DATE_KEYS) next.delete(key)
    })
  }, [update])

  return {
    params,
    filters,
    dateRange,
    setFilter,
    setDateRange,
    setPage,
    setLimit,
    setSort,
    clearAll,
    /* The range counts once, because it is one control and one chip. */
    activeFilterCount:
      Object.keys(filters).length + (dates.fromDate || dates.toDate ? 1 : 0),
  }
}
