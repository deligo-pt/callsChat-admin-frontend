import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'

import { queryKeys } from '@/api/queryKeys'
import type { Paginated } from '@/types/common'
import type { UserSummary } from '@/types/identity'

import { fetchUsers } from './api'
import type { HostFilter, UserListParams } from './listParams'
import {
  fetchHostRoster,
  HOST_ROSTER_KEY,
  HOST_ROSTER_STALE_TIME,
} from './useHostRoster'

/**
 * The user directory, with the Host filter the API cannot apply (plan.md §3,
 * phase T0).
 *
 * Without a Host filter this is the plain server query: the browser never
 * sorts, filters or pages a set it holds.
 *
 * ⚠️ **With one, the roster decides**, because `?isHost=` returns 0 users for
 * every value and `isHost` is false for every user (H1, H2). Measured
 * 2026-11-01: `?search=<user id>` returns exactly that user, and the server's
 * status / role / type / restriction filters combine with it. So:
 *
 *   - **Hosts** — each roster id is looked up with the active server filters,
 *     then the typed search, sort and paging are applied here, over a set the
 *     size of the roster (4 today).
 *   - **Non-hosts** — the server page, minus roster members. The total is the
 *     server's minus the hosts that match the same filters, so the count is
 *     exact; a page can hold fewer rows than the page size, but every
 *     non-host is on exactly one page.
 *
 * Both go away when H1 / H2 are fixed and `isHost` can be sent to the API.
 */

/**
 * Every host id, and the looked-up hosts that match the active filters
 * (unsorted).
 */
async function matchingHosts(
  client: QueryClient,
  params: UserListParams,
  signal?: AbortSignal,
): Promise<{ ids: ReadonlySet<string>; hosts: UserSummary[] }> {
  const roster = await client.fetchQuery({
    queryKey: HOST_ROSTER_KEY,
    queryFn: ({ signal: rosterSignal }) => fetchHostRoster(rosterSignal),
    staleTime: HOST_ROSTER_STALE_TIME,
  })

  const { search, page: _page, limit: _limit, ...serverFilters } = params
  const found = await Promise.all(
    [...roster.keys()].map(async (id) => {
      /* `search` matches names and e-mails too; keep only the exact id. */
      const result = await fetchUsers(
        { ...serverFilters, page: 1, limit: 5, search: id },
        signal,
      )
      return result.data.find((user) => user.id === id) ?? null
    }),
  )

  const term = search?.trim().toLowerCase()
  const hosts = found.filter((user): user is UserSummary => {
    if (!user) return false
    if (!term) return true
    return [user.id, user.displayName, user.username, user.email].some((value) =>
      value?.toLowerCase().includes(term),
    )
  })
  return { ids: new Set(roster.keys()), hosts }
}

const SORT_VALUE: Record<string, (user: UserSummary) => string | null> = {
  createdAt: (user) => user.createdAt,
  displayName: (user) => user.displayName.toLowerCase(),
  status: (user) => user.status,
  lastActiveAt: (user) => user.lastActiveAt,
}

/** The same order the API gives: `sortBy` / `sortOrder`, nulls last. */
function sortUsers(users: UserSummary[], params: UserListParams): UserSummary[] {
  const read = SORT_VALUE[params.sortBy] ?? SORT_VALUE['createdAt']!
  const sign = params.sortOrder === 'asc' ? 1 : -1
  return [...users].sort((a, b) => {
    const left = read(a)
    const right = read(b)
    if (left === right) return 0
    if (left === null) return 1
    if (right === null) return -1
    return left < right ? -sign : sign
  })
}

async function fetchDirectory(
  client: QueryClient,
  params: UserListParams,
  host: HostFilter | undefined,
  signal?: AbortSignal,
): Promise<Paginated<UserSummary>> {
  if (!host) return fetchUsers(params, signal)

  if (host === 'host') {
    const hosts = sortUsers((await matchingHosts(client, params, signal)).hosts, params)
    const start = (params.page - 1) * params.limit
    return {
      success: true,
      data: hosts.slice(start, start + params.limit),
      pagination: {
        page: params.page,
        limit: params.limit,
        total: hosts.length,
        totalPages: Math.ceil(hosts.length / params.limit),
      },
    }
  }

  const [page, { ids, hosts }] = await Promise.all([
    fetchUsers(params, signal),
    matchingHosts(client, params, signal),
  ])
  return {
    ...page,
    /* Every roster member leaves the page; only the matching ones leave the total. */
    data: page.data.filter((user) => !ids.has(user.id)),
    pagination: {
      ...page.pagination,
      total: Math.max(0, page.pagination.total - hosts.length),
    },
  }
}

export function useUserDirectory(
  params: UserListParams,
  host: HostFilter | undefined,
  enabled = true,
) {
  const client = useQueryClient()
  return useQuery({
    queryKey: host
      ? queryKeys.users.list({ ...params, host })
      : queryKeys.users.list(params),
    queryFn: ({ signal }) => fetchDirectory(client, params, host, signal),
    enabled,
    /*
     * Keep the previous page visible while the next one loads. Without this,
     * paging or changing a filter blanks the table to a skeleton on every
     * keystroke, which reads as a broken page rather than a loading one.
     */
    placeholderData: keepPreviousData,
  })
}
