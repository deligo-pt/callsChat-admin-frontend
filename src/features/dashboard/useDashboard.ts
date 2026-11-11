import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'

import {
  fetchDashboardSnapshot,
  fetchDashboardTrends,
  fetchEconomyRates,
} from '@/api/dashboard'
import { ForbiddenError, RateLimitedError } from '@/api/errors'
import { queryKeys } from '@/api/queryKeys'
import { fetchTopUpRequests } from '@/api/wallet'
import type { DashboardTimeframe } from '@/types/dashboard'

/**
 * Dashboard reads (plan.md DB0, D5).
 *
 * The snapshot polls every 30s, and only while the tab is visible: TanStack's
 * `refetchIntervalInBackground` is off by default, so a hidden tab costs the
 * server nothing. Returning to the tab refetches straight away.
 */

export const SNAPSHOT_POLL_MS = 30_000
export const TRENDS_POLL_MS = 5 * 60_000
/** After a 429, wait this long before asking again (plan.md DB5). */
export const RATE_LIMIT_BACKOFF_MS = 2 * 60_000

/**
 * The poll interval, given how the last request went (plan.md DB5).
 *
 * - **403:** stop. A permission will not appear by asking every 30 seconds;
 *   Refresh or a reload asks again.
 * - **429:** back off to two minutes, then return to the normal pace once a
 *   request succeeds. The query client never retries 4xx, so this is the only
 *   thing that would otherwise keep hitting a server that asked us to slow
 *   down.
 */
export function pollInterval(normalMs: number) {
  /* Structural, so one helper fits every query's data type. */
  return (query: { state: { error: unknown } }): number | false => {
    const error = query.state.error
    if (error instanceof ForbiddenError) return false
    if (error instanceof RateLimitedError)
      return Math.max(normalMs, RATE_LIMIT_BACKOFF_MS)
    return normalMs
  }
}

/**
 * One toast for a 429, however many dashboard sources hit it: they share the
 * toast id, so the second one replaces the first rather than stacking.
 */
export function useRateLimitToast(error: unknown): void {
  const limited = error instanceof RateLimitedError
  useEffect(() => {
    if (!limited) return
    toast.warning('The server asked us to slow down', {
      id: 'dashboard-rate-limited',
      description: 'The dashboard will refresh less often for a couple of minutes.',
    })
  }, [limited])
}

export function useDashboardSnapshot() {
  return useQuery({
    queryKey: queryKeys.dashboard.snapshot(),
    queryFn: ({ signal }) => fetchDashboardSnapshot(signal),
    refetchInterval: pollInterval(SNAPSHOT_POLL_MS),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  })
}

export function useDashboardTrends(timeframe: DashboardTimeframe) {
  return useQuery({
    queryKey: queryKeys.dashboard.trends(timeframe),
    queryFn: ({ signal }) => fetchDashboardTrends(timeframe, signal),
    refetchInterval: pollInterval(TRENDS_POLL_MS),
    refetchIntervalInBackground: false,
    staleTime: 60_000,
    /* Keep the old chart on screen while another timeframe loads. */
    placeholderData: keepPreviousData,
  })
}

/** Payout rates and revenue split — changes rarely, so cached for 10 minutes. */
export function useEconomyRates(enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.economyRates(),
    queryFn: ({ signal }) => fetchEconomyRates(signal),
    staleTime: 10 * 60_000,
    enabled,
  })
}

const PENDING_TOP_UPS = { status: 'PENDING', page: 1, limit: 1 } as const

/**
 * How many top-up requests wait for approval (plan.md DB4). A one-row
 * `PENDING` page: the server's `total` is the count, measured on staging
 * 2026-11-11. Shares the top-up list's cache key, and polls with the snapshot.
 */
export function usePendingTopUpCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.topUpRequests.list(PENDING_TOP_UPS),
    queryFn: ({ signal }) => fetchTopUpRequests(PENDING_TOP_UPS, signal),
    select: (page) => page.pagination.total,
    refetchInterval: pollInterval(SNAPSHOT_POLL_MS),
    refetchIntervalInBackground: false,
    enabled,
  })
}
