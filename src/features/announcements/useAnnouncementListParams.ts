import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { DEFAULT_PAGE_SIZE } from '@/components/data'
import type { AnnouncementListQuery } from '@/types/announcement'

import {
  ANY,
  FILTER_KEYS,
  MAX_LIMIT,
  isAudienceFilter,
  isPinnedFilter,
  isPriorityFilter,
  isStatusFilter,
  type AudienceFilter,
  type FilterKey,
  type PinnedFilter,
  type PriorityFilter,
  type StatusFilter,
} from './listParams'

/**
 * Announcements-queue filter state, owned by the URL.
 *
 * Filters live in the query string so a view survives a refresh and can be
 * pasted to a colleague — the same reason every other list in this panel does
 * it.
 *
 * ⚠️ **`ALL` deletes the key rather than sending a value.** That is the
 * opposite of `useVerificationListParams`, and the difference is deliberate:
 * there, omitting `status` silently narrows the result to pending rows, so
 * `ALL` has to be transmitted. Here the query schema declares no default, so an
 * absent filter is an absent filter (see `listParams.ts`, and O14 for what is
 * still unproven about that).
 */

const DEFAULTS = {
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
} as const

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const parsed = Number.parseInt(params.get(key) ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export interface UseAnnouncementListParams {
  /** Exactly what is sent to `GET /admin/announcements`. */
  readonly query: AnnouncementListQuery
  readonly status: StatusFilter
  readonly priority: PriorityFilter
  readonly targetAudience: AudienceFilter
  readonly pinned: PinnedFilter
  readonly search: string | undefined
  readonly page: number
  readonly limit: number
  readonly setStatus: (status: string) => void
  readonly setPriority: (priority: string) => void
  readonly setTargetAudience: (audience: string) => void
  readonly setPinned: (pinned: string) => void
  readonly setSearch: (search: string | undefined) => void
  readonly setPage: (page: number) => void
  readonly setLimit: (limit: number) => void
  readonly clearAll: () => void
  /** How many facets are narrowing the result. Drives the empty-state copy. */
  readonly activeFilterCount: number
}

export function useAnnouncementListParams(): UseAnnouncementListParams {
  const [searchParams, setSearchParams] = useSearchParams()

  /*
   * A hand-edited value is dropped rather than sent: all four facets are
   * validated strictly, so `?status=SCHEDULED` would 400 the whole page instead
   * of being ignored.
   */
  const status = useMemo<StatusFilter>(() => {
    const raw = searchParams.get('status')?.trim()
    return raw && isStatusFilter(raw) ? raw : ANY
  }, [searchParams])

  const priority = useMemo<PriorityFilter>(() => {
    const raw = searchParams.get('priority')?.trim()
    return raw && isPriorityFilter(raw) ? raw : ANY
  }, [searchParams])

  const targetAudience = useMemo<AudienceFilter>(() => {
    const raw = searchParams.get('targetAudience')?.trim()
    return raw && isAudienceFilter(raw) ? raw : ANY
  }, [searchParams])

  const pinned = useMemo<PinnedFilter>(() => {
    const raw = searchParams.get('pinned')?.trim()
    return raw && isPinnedFilter(raw) ? raw : ANY
  }, [searchParams])

  const search = searchParams.get('search')?.trim() || undefined

  const page = readInt(searchParams, 'page', DEFAULTS.page)
  /* Clamp to the API's ceiling; a larger value is a 400, not a bigger page. */
  const limit = Math.min(readInt(searchParams, 'limit', DEFAULTS.limit), MAX_LIMIT)

  const query = useMemo<AnnouncementListQuery>(
    () => ({
      page,
      limit,
      ...(status !== ANY ? { status } : {}),
      ...(priority !== ANY ? { priority } : {}),
      ...(targetAudience !== ANY ? { targetAudience } : {}),
      /*
       * ⚠️ The URL carries the strings `'true'`/`'false'` because a select's
       * value is a string, but the API layer takes a real boolean — it does the
       * wire conversion in one place, and `false` must survive that trip
       * (`api/announcements.ts` explains why). Converting here keeps the URL
       * readable and the query object honestly typed.
       */
      ...(pinned !== ANY ? { isPinned: pinned === 'true' } : {}),
      ...(search ? { search } : {}),
    }),
    [page, limit, status, priority, targetAudience, pinned, search],
  )

  /**
   * All writes go through here so one rule holds everywhere: changing anything
   * except the page returns to page 1.
   *
   * Landing on page 7 of a three-page result is the classic filter bug, and on
   * this endpoint it does not fail loudly — `?page=99` answers 200 with the
   * page echoed back and an empty array, verified.
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

  /**
   * One setter shape for all four facets: `ALL` removes the key, anything else
   * sets it.
   *
   * Written once rather than four times because the rule is identical across
   * them — which is exactly what made the verification queue's per-facet
   * setters diverge and need untangling later.
   */
  const setFacet = useCallback(
    (key: FilterKey) => (value: string) => {
      update((next) => {
        if (value === ANY) next.delete(key)
        else next.set(key, value)
      })
    },
    [update],
  )

  const setStatus = useMemo(() => setFacet('status'), [setFacet])
  const setPriority = useMemo(() => setFacet('priority'), [setFacet])
  const setTargetAudience = useMemo(() => setFacet('targetAudience'), [setFacet])
  const setPinned = useMemo(() => setFacet('pinned'), [setFacet])

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
   * Clears every filter.
   *
   * ⚠️ Here this genuinely returns an **unfiltered** view, because the default
   * for every facet is `ALL`. In the verification queue the same button returns
   * to a view that is still narrowed to `PENDING`, which took two attempts to
   * get right — "Clear all" there appeared to half-work because clearing landed
   * on a filter. Nothing like that can happen on this screen, and the rule is
   * the same one either way: a chip exists only when a facet differs from its
   * default, and clearing returns every facet to its default.
   */
  const clearAll = useCallback(() => {
    update((next) => {
      for (const key of FILTER_KEYS) next.delete(key)
    })
  }, [update])

  return {
    query,
    status,
    priority,
    targetAudience,
    pinned,
    search,
    page,
    limit,
    setStatus,
    setPriority,
    setTargetAudience,
    setPinned,
    setSearch,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount:
      (status !== ANY ? 1 : 0) +
      (priority !== ANY ? 1 : 0) +
      (targetAudience !== ANY ? 1 : 0) +
      (pinned !== ANY ? 1 : 0) +
      (search ? 1 : 0),
  }
}

export type { FilterKey }
