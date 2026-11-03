import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { queryKeys } from '@/api/queryKeys'
import { NotFoundError } from '@/api/errors'
import {
  fetchTopUpRequests,
  fetchWalletTransaction,
  fetchWalletTransactions,
  walletTransactionParams,
  type WalletTransactionQuery,
} from '@/api/wallet'

/** `GET /admin/wallet/transactions` for the current view (plan.md T2). */
export function useWalletLedgerQuery(query: WalletTransactionQuery) {
  return useQuery({
    /* Keyed on what is actually sent, so equivalent URLs share one entry. */
    queryKey: [...queryKeys.walletTransactions.lists(), walletTransactionParams(query)],
    queryFn: ({ signal }) => fetchWalletTransactions(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
}

/** `GET /admin/wallet/transactions/:id` — one entry, plus the current balance. */
export function useWalletTransaction(id: string) {
  return useQuery({
    queryKey: queryKeys.walletTransactions.detail(id),
    queryFn: ({ signal }) => fetchWalletTransaction(id, signal),
    enabled: id.length > 0,
    /* A missing entry is an answer, not a transient failure worth retrying. */
    retry: (failureCount, error) =>
      error instanceof NotFoundError ? false : failureCount < 1,
  })
}

/**
 * The top-up request behind a `TOP_UP` entry.
 *
 * ⚠️ There is no `GET /admin/wallet/requests/:id`, and the queue's `search`
 * does not match a request id (both measured 2026-11-01). It does match the
 * payment TrxID, which the server writes into the entry's note — so the
 * request is found by its TrxID, then confirmed by id. `null` when no request
 * with that id comes back: the entry still shows what its note says.
 */
export function useTopUpRequestFor(
  requestId: string | null,
  trxId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [...queryKeys.topUpRequests.all, 'for-entry', requestId, trxId],
    queryFn: async ({ signal }) => {
      const page = await fetchTopUpRequests({ search: trxId ?? '', limit: 100 }, signal)
      return page.data.find((request) => request.id === requestId) ?? null
    },
    enabled: enabled && Boolean(requestId) && Boolean(trxId),
    retry: false,
  })
}
