import { useQuery } from '@tanstack/react-query'

import { NotFoundError } from '@/api/errors'
import { fetchLiveRoom } from '@/api/liveRooms'
import { queryKeys } from '@/api/queryKeys'

/**
 * A live room's title, from its id — for places that only hold the id, like
 * a gift's `contextId` (plan.md Live L4).
 *
 * Its own key under the room's detail key: the room page treats a missing
 * room as an error and this treats it as `null`, so the two must not share an
 * entry — but invalidating the room still refreshes the title. One request
 * per room however many rows sent gifts in it. Off without `live.view`.
 *
 * `data`: the title (blank titles read "Untitled stream"), or `null` when the
 * room no longer exists.
 */
export function useLiveRoomTitle(roomId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.liveRooms.detail(roomId), 'title'],
    queryFn: async ({ signal }) => {
      try {
        return await fetchLiveRoom(roomId, signal)
      } catch (error) {
        if (error instanceof NotFoundError) return null
        throw error
      }
    },
    select: (detail) => (detail ? detail.room.title.trim() || 'Untitled stream' : null),
    enabled: enabled && roomId.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
