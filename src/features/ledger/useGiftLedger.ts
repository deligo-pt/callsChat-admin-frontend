import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { fetchGiftTransactions, type GiftTransactionQuery } from '@/api/catalog'
import { queryKeys } from '@/api/queryKeys'

/** `GET /admin/gifts/transactions` — newest first, always (sort is ignored). */
export function useGiftLedgerQuery(query: GiftTransactionQuery) {
  return useQuery({
    queryKey: queryKeys.giftTransactions.list(query),
    queryFn: ({ signal }) => fetchGiftTransactions(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
}
