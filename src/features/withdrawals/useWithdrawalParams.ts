import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import type { WithdrawalQuery } from '@/api/withdrawals'
import { DEFAULT_PAGE_SIZE } from '@/components/data'
import {
  isWithdrawalStatus,
  MAX_WITHDRAWAL_LIMIT,
  WITHDRAWAL_SORTS,
  type WithdrawalSort,
  type WithdrawalStatus,
} from '@/types/withdrawals'

/**
 * The Withdrawals page's state, owned by the URL (plan.md W1).
 *
 * `status` is the tab. With no `status` in the URL the page opens on
 * **Pending** — the queue that needs someone; `status=ALL` shows everything.
 * Every value is checked on the way in, because the API answers `400` to an
 * unknown enum and would fail the whole page.
 */

export type WithdrawalTab = WithdrawalStatus | 'ALL'

export interface WithdrawalFilters {
  readonly search?: string
  readonly userId?: string
  /** Bangladesh days, `yyyy-MM-dd`. */
  readonly fromDate?: string
  readonly toDate?: string
}

export type WithdrawalFilterKey = keyof WithdrawalFilters

const FILTER_KEYS: readonly WithdrawalFilterKey[] = [
  'search',
  'userId',
  'fromDate',
  'toDate',
]
const DAY = /^\d{4}-\d{2}-\d{2}$/
const MAX_ID_LENGTH = 64

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const parsed = Number.parseInt(params.get(key) ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readDay(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim()
  return value && DAY.test(value) ? value : undefined
}

export function readWithdrawalTab(params: URLSearchParams): WithdrawalTab {
  const raw = params.get('status')?.trim().toUpperCase()
  if (raw === 'ALL') return 'ALL'
  return isWithdrawalStatus(raw) ? raw : 'PENDING'
}

export function readWithdrawalFilters(params: URLSearchParams): WithdrawalFilters {
  const search = params.get('search')?.trim()
  const userId = params.get('userId')?.trim()
  const fromDate = readDay(params, 'fromDate')
  let toDate = readDay(params, 'toDate')
  if (fromDate && toDate && toDate < fromDate) toDate = undefined
  return {
    ...(search ? { search } : {}),
    ...(userId && userId.length <= MAX_ID_LENGTH ? { userId } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
  }
}

export function useWithdrawalParams() {
  const [searchParams, setSearchParams] = useSearchParams()

  const tab = readWithdrawalTab(searchParams)
  const filters = useMemo(() => readWithdrawalFilters(searchParams), [searchParams])
  const page = readInt(searchParams, 'page', 1)
  const limit = Math.min(
    readInt(searchParams, 'limit', DEFAULT_PAGE_SIZE),
    MAX_WITHDRAWAL_LIMIT,
  )
  const rawSort = searchParams.get('sortBy')
  const sortBy: WithdrawalSort = (WITHDRAWAL_SORTS as readonly string[]).includes(
    rawSort ?? '',
  )
    ? (rawSort as WithdrawalSort)
    : 'createdAt'
  const sortOrder: 'asc' | 'desc' =
    searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

  const query = useMemo<WithdrawalQuery>(
    () => ({
      ...(tab === 'ALL' ? {} : { status: tab }),
      search: filters.search,
      userId: filters.userId,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      sortBy,
      sortOrder,
      page,
      limit,
    }),
    [tab, filters, sortBy, sortOrder, page, limit],
  )

  /** Every change but paging returns to page 1, and replaces the history entry. */
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

  const setTab = useCallback(
    (next: WithdrawalTab) =>
      update((params) => {
        if (next === 'PENDING') params.delete('status')
        else params.set('status', next)
      }),
    [update],
  )

  const setFilter = useCallback(
    (key: WithdrawalFilterKey, value: string | undefined) =>
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
    (field: string, direction: 'asc' | 'desc') =>
      update((params) => {
        if (field === 'createdAt' && direction === 'desc') {
          params.delete('sortBy')
          params.delete('sortOrder')
          return
        }
        if (
          (WITHDRAWAL_SORTS as readonly string[]).includes(field) &&
          field !== 'createdAt'
        ) {
          params.set('sortBy', field)
        } else params.delete('sortBy')
        if (direction === 'asc') params.set('sortOrder', 'asc')
        else params.delete('sortOrder')
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
        else params.set('limit', String(Math.min(next, MAX_WITHDRAWAL_LIMIT)))
      }),
    [update],
  )

  const clearAll = useCallback(
    () =>
      update((params) => {
        for (const key of FILTER_KEYS) params.delete(key)
        params.delete('sortBy')
        params.delete('sortOrder')
      }),
    [update],
  )

  return {
    tab,
    filters,
    sortBy,
    sortOrder,
    page,
    limit,
    query,
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
