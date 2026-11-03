import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import type { LiveHistoryQuery, LiveRoomQuery } from '@/api/liveRooms'
import { DEFAULT_PAGE_SIZE } from '@/components/data'
import {
  isOneOf,
  LIVE_ROOM_TYPES,
  LIVE_TOPICS,
  MAX_LIVE_LIMIT,
  OFFERED_LIVE_SORTS,
  type LiveRoomType,
  type LiveTopic,
} from '@/types/liveRooms'

/**
 * The Live streams page's state, owned by the URL (plan.md Live §5.1, L1).
 *
 * Two tabs over two routes that filter differently (plan.md L-B4):
 * - **Live now** → `GET /rooms`: status (Live / Paused), topic, type, sort.
 * - **Past streams** → `GET /rooms/history`: From / To in Bangladesh days.
 *   History ignores topic, type, status and sort, so those are not offered
 *   there — a filter that does nothing is worse than no filter.
 *
 * Both take `search` and `hostId`. Every value is checked on the way in: the
 * API answers `400` to a lower-case enum, so a hand-edited link would
 * otherwise fail the whole page.
 */

export type LiveTab = 'live' | 'past'
export type LiveNowStatus = 'LIVE' | 'PAUSED'

export interface LiveStreamFilters {
  readonly search?: string
  readonly hostId?: string
  /* Live now only. */
  readonly status?: LiveNowStatus
  readonly topic?: LiveTopic
  readonly type?: LiveRoomType
  /* Past streams only — `yyyy-MM-dd`, Bangladesh time. */
  readonly fromDate?: string
  readonly toDate?: string
}

export type LiveFilterKey = keyof LiveStreamFilters

const LIVE_ONLY: readonly LiveFilterKey[] = ['status', 'topic', 'type']
const PAST_ONLY: readonly LiveFilterKey[] = ['fromDate', 'toDate']
const FILTER_KEYS: readonly LiveFilterKey[] = [
  'search',
  'hostId',
  ...LIVE_ONLY,
  ...PAST_ONLY,
]

/** Ids are cuid-like; anything longer is not one. */
const MAX_ID_LENGTH = 64
const DAY = /^\d{4}-\d{2}-\d{2}$/

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const parsed = Number.parseInt(params.get(key) ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readDay(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim()
  return value && DAY.test(value) ? value : undefined
}

export function readLiveTab(params: URLSearchParams): LiveTab {
  return params.get('tab') === 'past' ? 'past' : 'live'
}

export function readLiveFilters(params: URLSearchParams): LiveStreamFilters {
  const tab = readLiveTab(params)
  const search = params.get('search')?.trim()
  const hostId = params.get('hostId')?.trim()

  const shared = {
    ...(search ? { search } : {}),
    ...(hostId && hostId.length <= MAX_ID_LENGTH ? { hostId } : {}),
  }

  if (tab === 'past') {
    const fromDate = readDay(params, 'fromDate')
    let toDate = readDay(params, 'toDate')
    if (fromDate && toDate && toDate < fromDate) toDate = undefined
    return {
      ...shared,
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate } : {}),
    }
  }

  const status = params.get('status')?.trim()
  const topic = params.get('topic')?.trim()
  const type = params.get('type')?.trim()
  return {
    ...shared,
    ...(status === 'PAUSED' ? { status: 'PAUSED' as const } : {}),
    ...(isOneOf(LIVE_TOPICS, topic) ? { topic } : {}),
    ...(isOneOf(LIVE_ROOM_TYPES, type) ? { type } : {}),
  }
}

export type OfferedSort = (typeof OFFERED_LIVE_SORTS)[number]

export function useLiveStreamParams() {
  const [searchParams, setSearchParams] = useSearchParams()

  const tab = readLiveTab(searchParams)
  const filters = useMemo(() => readLiveFilters(searchParams), [searchParams])
  const page = readInt(searchParams, 'page', 1)
  const limit = Math.min(
    readInt(searchParams, 'limit', DEFAULT_PAGE_SIZE),
    MAX_LIVE_LIMIT,
  )
  const rawSort = searchParams.get('sort')
  const sort: OfferedSort =
    tab === 'live' && isOneOf(OFFERED_LIVE_SORTS, rawSort) ? rawSort : 'recent'

  const liveQuery = useMemo<LiveRoomQuery>(
    () => ({
      status: filters.status ?? 'LIVE',
      search: filters.search,
      hostId: filters.hostId,
      topic: filters.topic,
      type: filters.type,
      ...(sort !== 'recent' ? { sort } : {}),
      page,
      limit,
    }),
    [filters, sort, page, limit],
  )

  const historyQuery = useMemo<LiveHistoryQuery>(
    () => ({
      search: filters.search,
      hostId: filters.hostId,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      page,
      limit,
    }),
    [filters, page, limit],
  )

  /** Every change but paging returns to page 1. */
  const update = useCallback(
    (mutate: (params: URLSearchParams) => void, keepPage = false) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          mutate(params)
          if (!keepPage) params.delete('page')
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  /**
   * Switching tab keeps what both routes read (search, host) and drops what
   * only the other one reads, so no filter is carried somewhere it is ignored.
   */
  const setTab = useCallback(
    (next: LiveTab) =>
      update((params) => {
        if (next === 'past') params.set('tab', 'past')
        else params.delete('tab')
        for (const key of next === 'past' ? LIVE_ONLY : PAST_ONLY) params.delete(key)
        if (next === 'past') params.delete('sort')
      }),
    [update],
  )

  const setFilter = useCallback(
    (key: LiveFilterKey, value: string | undefined) =>
      update((params) => {
        const text = value?.trim()
        if (text) params.set(key, text)
        else params.delete(key)
      }),
    [update],
  )

  const setDateRange = useCallback(
    (from: string | undefined, to: string | undefined) =>
      update((params) => {
        if (from) params.set('fromDate', from)
        else params.delete('fromDate')
        if (to) params.set('toDate', to)
        else params.delete('toDate')
      }),
    [update],
  )

  const setSort = useCallback(
    (next: OfferedSort) =>
      update((params) => {
        if (next === 'recent') params.delete('sort')
        else params.set('sort', next)
      }),
    [update],
  )

  const setPage = useCallback(
    (next: number) =>
      update((params) => {
        if (next > 1) params.set('page', String(next))
        else params.delete('page')
      }, true),
    [update],
  )

  const setLimit = useCallback(
    (next: number) =>
      update((params) => {
        if (next === DEFAULT_PAGE_SIZE) params.delete('limit')
        else params.set('limit', String(Math.min(next, MAX_LIVE_LIMIT)))
      }),
    [update],
  )

  const clearAll = useCallback(
    () =>
      update((params) => {
        for (const key of FILTER_KEYS) params.delete(key)
        params.delete('sort')
      }),
    [update],
  )

  return {
    tab,
    filters,
    sort,
    page,
    limit,
    liveQuery,
    historyQuery,
    setTab,
    setFilter,
    setDateRange,
    setSort,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount: Object.keys(filters).length,
  }
}
