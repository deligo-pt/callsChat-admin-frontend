import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  fetchHostApplication,
  fetchHostApplications,
  fetchHostApplicationStats,
  fetchLiveHosts,
  reviewHostApplication,
  setLiveHostStatus,
  type HostApplicationQuery,
  type LiveHostQuery,
} from '@/api/hosts'
import { queryKeys } from '@/api/queryKeys'
import type { HostStatusPayload, ReviewPayload } from '@/types/hosts'

/**
 * Reading the host-application surfaces (plan.md §4, phase H4).
 */

/**
 * The queue — `GET /admin/live/host-applications`.
 *
 * `keepPreviousData` keeps the current page on screen while the next one
 * loads. Without it, paging or changing a filter blanks the table to a
 * skeleton, which reads as a broken page rather than a loading one.
 *
 * ⚠️ **This returns an empty page on the real backend today** (plan.md §2.1).
 * The caller must treat that as the ordinary case, not an error and not a
 * placeholder to be filled in later.
 */
export function useHostApplicationListQuery(query: HostApplicationQuery) {
  return useQuery({
    queryKey: queryKeys.hostApplications.list(query),
    queryFn: ({ signal }) => fetchHostApplications(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
}

/**
 * The counters — `GET /admin/live/host-applications/stats`.
 *
 * ⚠️ **Platform-wide, and the route takes no query parameters at all.** The
 * numbers describe every application in the system regardless of how the queue
 * below is narrowed, so whatever renders them must not let them read as
 * describing the filtered list beside them.
 *
 * ⚠️ **Two of the six counters are not about applications.**
 * `activeHostsCount` and `suspendedHostsCount` describe the *roster*, which is
 * a different route and a different screen. A tile for them must navigate to
 * `/hosts`, never filter this queue — see `StatsStrip`.
 *
 * `retry: false`: a failure here must not look like a failure of the queue it
 * decorates, so the strip is simply absent and the table stands on its own.
 * One quiet miss, not three.
 */
export function useHostApplicationStatsQuery() {
  return useQuery({
    queryKey: queryKeys.hostApplications.stats(),
    queryFn: ({ signal }) => fetchHostApplicationStats(signal),
    staleTime: 0,
    retry: false,
  })
}

/**
 * One application — `GET /admin/live/host-applications/:id`.
 *
 * ⚠️ Fetched rather than taken from the list row, although the list already
 * carries every field the drawer shows. The detail route is the only thing
 * that can report a record changing underneath an operator — another admin
 * approving it while this drawer was open — and a drawer painted from a stale
 * row would let someone reject an application that is already approved.
 */
export function useHostApplicationQuery(id: string | null) {
  return useQuery({
    queryKey: queryKeys.hostApplications.detail(id ?? ''),
    queryFn: ({ signal }) => fetchHostApplication(id ?? '', signal),
    enabled: Boolean(id),
    staleTime: 0,
  })
}

/**
 * Approve or reject — `POST /admin/live/host-applications/:id/review`.
 *
 * ⚠️ **`APPROVE` cannot be undone from this panel.** It creates or activates
 * the applicant's `LiveHostProfile`, emits `host:application_reviewed` over
 * Socket.io, and fires an in-app plus FCM push notification. There is no
 * un-approve endpoint — the nearest thing is suspending the host afterwards,
 * which is a different record and a different, visible act. The caller
 * confirms before invoking.
 *
 * ⚠️ **`retry: false`.** A retried review that actually succeeded the first
 * time would fire a second notification at the creator, and on a route with no
 * idempotency key that is the only trace it leaves.
 *
 * ⚠️ **Nothing is painted from the response.** Its success shape has never
 * been observed — the live table is empty (plan.md §2.1) — so the detail and
 * the list are both invalidated and the screen redraws from a refetch.
 */
export function useReviewHostApplicationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReviewPayload }) =>
      reviewHostApplication(id, payload),
    retry: false,
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.hostApplications.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.hostApplications.detail(variables.id),
        }),
        /*
         * ⚠️ The roster too, and only on approve in spirit — invalidated
         * unconditionally because it is cheap and the alternative is a
         * condition that silently stops being true. Approving creates a live
         * host, so a roster left cached would not show the person who was just
         * admitted.
         */
        queryClient.invalidateQueries({ queryKey: queryKeys.hosts.all }),
      ])
    },
  })
}

/* ------------------------------------------------------------------ *
 * The roster
 * ------------------------------------------------------------------ */

/** `GET /admin/live/hosts`. Empty on the live service today (plan.md §2.1). */
export function useLiveHostListQuery(query: LiveHostQuery) {
  return useQuery({
    queryKey: queryKeys.hosts.list(query),
    queryFn: ({ signal }) => fetchLiveHosts(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
}

/**
 * `PATCH /admin/live/hosts/:userId/status`.
 *
 * ⚠️ **Suspending a host who is live tears down their running room.** The
 * backend ends the `LiveRoom`, evicts every viewer, and broadcasts
 * `live:room_ended` with the reason (doc §5.2). The panel cannot see rooms, so
 * it states that consequence and can never confirm it happened (plan.md O6).
 *
 * ⚠️ **Keyed on `userId`, not the profile's own `id`.** Both appear on every
 * roster row and they are different values; sending the profile id answers
 * `404 Live host profile not found for this user`, which reads like the host
 * is gone rather than like the caller used the wrong key.
 *
 * ⚠️ `retry: false`. A retried suspension that actually succeeded the first
 * time would fire a second warning notification at the host, and this route
 * has no idempotency key.
 */
export function useSetLiveHostStatusMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: HostStatusPayload }) =>
      setLiveHostStatus(userId, payload),
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.hosts.all }),
        /*
         * The application counters move too: `activeHostsCount` and
         * `suspendedHostsCount` come from the applications stats route, and a
         * strip left cached would report a host as active moments after they
         * were banned.
         */
        queryClient.invalidateQueries({
          queryKey: queryKeys.hostApplications.stats(),
        }),
      ])
    },
  })
}
