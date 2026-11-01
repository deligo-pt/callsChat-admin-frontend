import { useQuery } from '@tanstack/react-query'

import { fetchLiveHosts } from '@/api/hosts'
import { queryKeys } from '@/api/queryKeys'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'

/**
 * Who is a host — plan.md §3, phase T0.
 *
 * ⚠️ **`isHost` on the user record cannot be trusted yet (H1).** Measured
 * 2026-11-01: it is `false` for all 30 users, including the three with an
 * `ACTIVE` host profile on `/admin/live/hosts`. So the roster is read as a
 * second source and a user counts as a host if either says so.
 *
 * ⚠️ **The whole roster, because there is no per-user lookup (H3).**
 * `/admin/live/hosts?userId=` is ignored and `/admin/live/hosts/:userId` is a
 * 404. Four rows today, one request; pages of 100 (the server's maximum)
 * until the end. This is a stop-gap that goes away when H1 is fixed.
 *
 * Only for operators who may read the roster. Everyone else gets an empty
 * map, and `isHost` alone decides.
 */

const PAGE_SIZE = 100
/** A ceiling, so a server that never reports the last page cannot loop. */
const MAX_PAGES = 20

export interface HostRosterEntry {
  readonly status: string | null
}

/** The roster as `userId → entry`. Shared by the badge and the Host filter. */
export async function fetchHostRoster(signal?: AbortSignal) {
  const roster = new Map<string, HostRosterEntry>()
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await fetchLiveHosts({ page, limit: PAGE_SIZE }, signal)
    for (const host of result.data) {
      if (host.userId) roster.set(host.userId, { status: host.status ?? null })
    }
    if (page >= result.pagination.totalPages || result.data.length === 0) break
  }
  return roster
}

export const HOST_ROSTER_KEY = [...queryKeys.hosts.all, 'roster'] as const
export const HOST_ROSTER_STALE_TIME = 5 * 60_000

const EMPTY: ReadonlyMap<string, HostRosterEntry> = new Map()

export function useHostRoster(): ReadonlyMap<string, HostRosterEntry> {
  const canRead = useCan(PERMISSIONS.hostApplicationsView)
  const query = useQuery({
    queryKey: HOST_ROSTER_KEY,
    queryFn: ({ signal }) => fetchHostRoster(signal),
    enabled: canRead,
    staleTime: HOST_ROSTER_STALE_TIME,
    /* A badge is decoration; its failure must not retry into the user list. */
    retry: false,
  })
  return (canRead && query.data) || EMPTY
}

/** The roster entry for a user, or `null` when they are not a host. */
export function useHostStatus(user: { id: string; isHost: boolean }) {
  const roster = useHostRoster()
  const entry = roster.get(user.id)
  if (entry) return entry
  return user.isHost ? { status: null } : null
}
