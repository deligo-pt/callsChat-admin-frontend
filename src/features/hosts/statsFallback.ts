import { useQueries } from '@tanstack/react-query'

import { fetchHostApplications, fetchLiveHosts } from '@/api/hosts'
import { queryKeys } from '@/api/queryKeys'
import type { HostApplicationStats } from '@/types/hosts'

/**
 * The six counters, rebuilt from the list routes — phase W0.
 *
 * ⚠️ **This exists because `GET /admin/live/host-applications/stats` started
 * returning `404` between 2026-10-15 and 2026-10-27** (plan.md O1). It is not
 * a design; it is a splint. The route's `:id` handler now swallows the literal
 * `stats` segment — the 404 body is `"Host application not found"`, the
 * *application* message rather than a route error, which is the proof. Our own
 * MSW handler documents the same hazard and registers `/stats` first to avoid
 * it.
 *
 * ⚠️ **It runs only when the real endpoint has failed.** `enabled` is driven by
 * the stats query's error state, so on a healthy backend not one of these
 * requests is made — and the day the route is fixed this file stops executing
 * by itself, with no flag to unset and no cleanup to remember. A fallback that
 * has to be removed by hand becomes permanent.
 *
 * ⚠️ **Six reads of `limit=1`, for `pagination.total` alone.** The rows are
 * thrown away. That is the whole trick: every count the dead endpoint used to
 * return is still derivable from a route that works, and `limit=1` makes each
 * one about as cheap as a HEAD.
 *
 * ⚠️ **`totalApplications` is read, never summed.** Adding the three status
 * counts would be one query cheaper and silently wrong the day a fourth status
 * appears — the top-up queue on this same backend already has a `CANCELLED`
 * the host queue does not.
 */

/** `limit: 1` — we want the count in `pagination.total`, not the rows. */
const PROBE = { page: 1, limit: 1 } as const

type Probe = readonly [key: readonly unknown[], run: () => Promise<number>]

function applicationProbe(status?: 'PENDING' | 'APPROVED' | 'REJECTED'): Probe {
  const params = { ...PROBE, ...(status ? { status } : {}) }
  return [
    queryKeys.hostApplications.count(params),
    async () => (await fetchHostApplications(params)).pagination.total,
  ]
}

function hostProbe(status: 'ACTIVE' | 'SUSPENDED' | 'BANNED'): Probe {
  const params = { ...PROBE, status }
  return [
    queryKeys.hosts.count(params),
    async () => (await fetchLiveHosts(params)).pagination.total,
  ]
}

/*
 * ⚠️ Order is load-bearing — the results array below is read positionally.
 * `SUSPENDED` and `BANNED` are separate probes because the strip's sixth tile
 * says "Suspended or banned" and covers both; the dead endpoint folded them
 * together server-side and this is where that folding now happens.
 */
const PROBES: readonly Probe[] = [
  applicationProbe(),
  applicationProbe('PENDING'),
  applicationProbe('APPROVED'),
  applicationProbe('REJECTED'),
  hostProbe('ACTIVE'),
  hostProbe('SUSPENDED'),
  hostProbe('BANNED'),
]

export interface StatsFallback {
  /** The counters, or `undefined` while nothing usable has arrived. */
  readonly stats: HostApplicationStats | undefined
  readonly isPending: boolean
}

export function useHostApplicationStatsFallback(enabled: boolean): StatsFallback {
  const results = useQueries({
    queries: PROBES.map(([queryKey, queryFn]) => ({
      queryKey,
      queryFn,
      enabled,
      staleTime: 0,
      /*
       * One attempt, as the stats query itself takes. Six probes retrying
       * three times each against a backend that is already misbehaving is six
       * ways to make a broken screen slower.
       */
      retry: false,
    })),
  })

  if (!enabled) return { stats: undefined, isPending: false }

  const isPending = results.some((result) => result.isPending)
  const counts = results.map((result) => result.data)

  /*
   * ⚠️ **All or nothing.** A partial result would let one failed probe render
   * as a real `0`, and "Pending review: 0" is the one number an operator acts
   * on by walking away. An em-dash says "unknown"; a zero says "handled".
   */
  if (counts.some((count) => typeof count !== 'number')) {
    return { stats: undefined, isPending }
  }

  const [total, pending, approved, rejected, active, suspended, banned] =
    counts as number[]

  return {
    stats: {
      totalApplications: total!,
      pendingCount: pending!,
      approvedCount: approved!,
      rejectedCount: rejected!,
      activeHostsCount: active!,
      suspendedHostsCount: suspended! + banned!,
    },
    isPending,
  }
}
