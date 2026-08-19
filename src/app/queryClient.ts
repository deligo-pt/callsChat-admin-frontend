import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { isAppError, isClientError, UnauthorizedError } from '@/api/errors'

/**
 * Query client defaults (plan.md §2.4).
 *
 * The important rules:
 *  - 4xx responses are NEVER retried. A 403 will not become a 200 on attempt
 *    three, and retrying a 409 on a state transition just hammers the backend.
 *  - Finance data does not refetch on window focus. An operator tabbing away
 *    mid-review should not have the ledger shift under them.
 *  - A 401 from ANY request ends the session through one handler.
 *
 * `onUnauthorized` must NOT clear the cache: the session itself is a query, so
 * clearing it here would drop the in-flight bootstrap, trigger a refetch, and
 * loop. Ending the session is a state change (session -> null); discarding
 * cached records belongs to the explicit sign-out path.
 */
export function createQueryClient(onUnauthorized: () => void): QueryClient {
  function handleError(error: unknown): void {
    if (error instanceof UnauthorizedError) onUnauthorized()
  }

  return new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (isClientError(error)) return false
          if (isAppError(error) && error.status === 0) return failureCount < 1
          return failureCount < 2
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        /*
         * Mutations are never retried automatically. Even with idempotency
         * keys, an automatic retry of a payout decision should be a deliberate
         * human action.
         */
        retry: false,
      },
    },
  })
}
