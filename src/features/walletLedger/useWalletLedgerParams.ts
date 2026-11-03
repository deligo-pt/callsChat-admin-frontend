import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import type { WalletTransactionQuery } from '@/api/wallet'
import { DEFAULT_PAGE_SIZE } from '@/components/data'
import { bangladeshDayBounds } from '@/lib/datetime'
import {
  isWalletTransactionType,
  MAX_WALLET_LIMIT,
  WALLET_DIRECTIONS,
  type WalletDirection,
} from '@/types/walletTransactions'

/**
 * The wallet ledger's view, owned by the URL (plan.md §5, phase T2).
 *
 * ⚠️ **Read strictly, because the API is strict** (plan.md §2.2): an empty
 * or lower-case value, a non-day date or a fractional amount is a `400` live.
 * `walletTransactionParams` would leave such a value out of the request — but
 * a chip would still claim the filter was applied. So each value is checked
 * here, on the way in, and one that would not be sent is not shown either.
 *
 * Dates are Bangladesh calendar days (`yyyy-MM-dd`); the API layer turns them
 * into UTC bounds. A range whose end is before its start keeps the start and
 * drops the end — staging answers such a range with an empty page, which
 * would read as "nothing happened" rather than "this range is backwards".
 *
 * ⚠️ No `maxAmount`: ignored live (plan.md B1).
 */
export const WALLET_FILTER_KEYS = [
  'search',
  'type',
  'direction',
  'fromDate',
  'toDate',
  'minAmount',
  'userId',
] as const
export type WalletFilterKey = (typeof WALLET_FILTER_KEYS)[number]

/** Ids on this backend are short cuids; anything longer is a mangled URL. */
const MAX_ID_LENGTH = 64

export interface WalletLedgerFilters {
  readonly search?: string
  readonly type?: string
  readonly direction?: WalletDirection
  readonly fromDate?: string
  readonly toDate?: string
  readonly minAmount?: string
  readonly userId?: string
}

export interface UseWalletLedgerParams {
  readonly query: WalletTransactionQuery
  readonly filters: WalletLedgerFilters
  readonly page: number
  readonly limit: number
  readonly oldestFirst: boolean
  readonly setFilter: (key: WalletFilterKey, value: string | undefined) => void
  readonly setDateRange: (from: string | undefined, to: string | undefined) => void
  readonly setPage: (page: number) => void
  readonly setLimit: (limit: number) => void
  readonly setOldestFirst: (oldestFirst: boolean) => void
  readonly clearAll: () => void
  readonly activeFilterCount: number
}

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key) ?? ''
  const parsed = Number(raw)
  return raw && Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function readDay(params: URLSearchParams, key: string): string | undefined {
  const raw = params.get(key)?.trim()
  return raw && bangladeshDayBounds(raw) ? raw : undefined
}

export function readWalletFilters(params: URLSearchParams): WalletLedgerFilters {
  const search = params.get('search')?.trim()
  const type = params.get('type')?.trim()
  const direction = params.get('direction')?.trim()
  const minAmount = params.get('minAmount')?.trim()
  const userId = params.get('userId')?.trim()
  const fromDate = readDay(params, 'fromDate')
  let toDate = readDay(params, 'toDate')
  /* `yyyy-MM-dd` compares correctly as text. */
  if (fromDate && toDate && toDate < fromDate) toDate = undefined

  const amount = Number(minAmount)
  return {
    ...(search ? { search } : {}),
    ...(type && isWalletTransactionType(type) ? { type } : {}),
    ...(direction && (WALLET_DIRECTIONS as readonly string[]).includes(direction)
      ? { direction: direction as WalletDirection }
      : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
    ...(minAmount && Number.isInteger(amount) && amount >= 1 ? { minAmount } : {}),
    ...(userId && userId.length <= MAX_ID_LENGTH ? { userId } : {}),
  }
}

export function useWalletLedgerParams(): UseWalletLedgerParams {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo(() => readWalletFilters(searchParams), [searchParams])
  const page = readInt(searchParams, 'page', 1)
  const limit = Math.min(
    /* The panel's page sizes (25 / 50 / 100), always sent — not the API's 20. */
    readInt(searchParams, 'limit', DEFAULT_PAGE_SIZE),
    MAX_WALLET_LIMIT,
  )
  const oldestFirst = searchParams.get('sort') === 'asc'

  const query = useMemo<WalletTransactionQuery>(
    () => ({ ...filters, page, limit, ...(oldestFirst ? { sort: 'asc' } : {}) }),
    [filters, page, limit, oldestFirst],
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

  const setFilter = useCallback(
    (key: WalletFilterKey, value: string | undefined) =>
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
        else params.set('limit', String(Math.min(next, MAX_WALLET_LIMIT)))
      }),
    [update],
  )

  const setOldestFirst = useCallback(
    (next: boolean) =>
      update((params) => {
        if (next) params.set('sort', 'asc')
        else params.delete('sort')
      }),
    [update],
  )

  const clearAll = useCallback(
    () =>
      update((params) => {
        for (const key of WALLET_FILTER_KEYS) params.delete(key)
      }),
    [update],
  )

  return {
    query,
    filters,
    page,
    limit,
    oldestFirst,
    setFilter,
    setDateRange,
    setPage,
    setLimit,
    setOldestFirst,
    clearAll,
    activeFilterCount: Object.keys(filters).length,
  }
}
