import { useQuery } from '@tanstack/react-query'

import { queryKeys } from '@/api/queryKeys'
import { fetchUserName } from '@/api/userNames'

/**
 * The name behind a bare user id — the admin who made an adjustment.
 *
 * One request per person however many rows they made, cached for the
 * session. Keyed under the user's detail key so a change to that record
 * refreshes the name too. Off without `users.view`.
 */
export function useUserName(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.users.detail(userId), 'name'],
    queryFn: ({ signal }) => fetchUserName(userId, signal),
    enabled: enabled && userId.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
