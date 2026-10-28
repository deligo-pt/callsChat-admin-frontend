import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import type { GiftTransactionQuery } from '@/api/catalog'
import { DEFAULT_PAGE_SIZE } from '@/components/data'
import { MAX_LIST_LIMIT } from '@/types/wallet'

/**
 * The gift ledger's query, owned by the URL (plan.md §3.2, phase G5).
 *
 * ⚠️ **Three filters, because three work** (measured 2026-10-28):
 * `senderId`, `receiverId` and `contextId` filter, and combine with AND.
 * `giftId`, `userId`, `contextType`, `status`, `search`, `startDate` and
 * `sortBy` are all accepted and **ignored** — the full set comes back. None
 * of them gets a control, because a control that filters nothing is worse
 * than its absence (plan.md O6).
 *
 * ⚠️ **The server has no bounds** (plan.md O5): `limit=101` answers 101 rows.
 * The page size is clamped here to the 100 every other list allows.
 */
export const LEDGER_FILTER_KEYS = ['senderId', 'receiverId', 'contextId'] as const
export type LedgerFilterKey = (typeof LEDGER_FILTER_KEYS)[number]

/** Ids on this backend are short cuids; anything longer is a mangled URL. */
const MAX_ID_LENGTH = 64

export interface UseLedgerListParams {
  readonly query: GiftTransactionQuery
  readonly filters: Readonly<Partial<Record<LedgerFilterKey, string>>>
  readonly page: number
  readonly limit: number
  readonly setFilter: (key: LedgerFilterKey, value: string | undefined) => void
  readonly setPage: (page: number) => void
  readonly setLimit: (limit: number) => void
  readonly clearAll: () => void
  readonly activeFilterCount: number
}

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const parsed = Number.parseInt(params.get(key) ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * ⚠️ An empty value is dropped: live, `senderId=` is ignored and returns
 * everything, so forwarding it would show an "applied" filter over an
 * unfiltered list.
 */
function readId(params: URLSearchParams, key: LedgerFilterKey): string | undefined {
  const raw = params.get(key)?.trim()
  return raw && raw.length <= MAX_ID_LENGTH ? raw : undefined
}

export function useLedgerListParams(): UseLedgerListParams {
  const [searchParams, setSearchParams] = useSearchParams()

  const senderId = readId(searchParams, 'senderId')
  const receiverId = readId(searchParams, 'receiverId')
  const contextId = readId(searchParams, 'contextId')

  const page = readInt(searchParams, 'page', 1)
  const limit = Math.min(
    readInt(searchParams, 'limit', DEFAULT_PAGE_SIZE),
    MAX_LIST_LIMIT,
  )

  const filters = useMemo(
    () => ({
      ...(senderId ? { senderId } : {}),
      ...(receiverId ? { receiverId } : {}),
      ...(contextId ? { contextId } : {}),
    }),
    [senderId, receiverId, contextId],
  )

  const query = useMemo<GiftTransactionQuery>(
    () => ({ page, limit, ...filters }),
    [page, limit, filters],
  )

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
    (key: LedgerFilterKey, value: string | undefined) =>
      update((params) => {
        if (value) params.set(key, value)
        else params.delete(key)
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
    (next: number) => update((params) => params.set('limit', String(next))),
    [update],
  )

  const clearAll = useCallback(
    () =>
      update((params) => {
        for (const key of LEDGER_FILTER_KEYS) params.delete(key)
      }),
    [update],
  )

  return {
    query,
    filters,
    page,
    limit,
    setFilter,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount: Object.keys(filters).length,
  }
}
