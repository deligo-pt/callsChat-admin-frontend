import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { NotFoundError } from '@/api/errors'
import {
  fetchLiveAnalytics,
  fetchLiveRoom,
  fetchLiveRoomHistory,
  fetchLiveRooms,
  liveHistoryParams,
  liveRoomParams,
  type LiveHistoryQuery,
  type LiveRoomQuery,
} from '@/api/liveRooms'
import { queryKeys } from '@/api/queryKeys'

/**
 * Reads for the Live streams page (plan.md Live §5.1).
 *
 * Keyed on what is actually sent, so equivalent URLs share one cache entry.
 * Refresh (plan.md decision D, L5): the live list every 10 s and the counters
 * every 30 s — TanStack pauses both while the browser tab is hidden. History
 * does not change under an operator's feet, so it is not polled.
 */

export const LIVE_LIST_REFRESH_MS = 10_000
export const LIVE_ANALYTICS_REFRESH_MS = 30_000
/** The room page, while the stream is on air (plan.md Live L5). */
export const LIVE_ROOM_REFRESH_MS = 5_000

export function useLiveRoomsQuery(query: LiveRoomQuery, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.liveRooms.list(liveRoomParams(query)),
    queryFn: ({ signal }) => fetchLiveRooms(query, signal),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_LIST_REFRESH_MS,
  })
}

export function useLiveHistoryQuery(query: LiveHistoryQuery, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.liveRooms.history(liveHistoryParams(query)),
    queryFn: ({ signal }) => fetchLiveRoomHistory(query, signal),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useLiveAnalytics() {
  return useQuery({
    queryKey: queryKeys.liveRooms.analytics(),
    queryFn: ({ signal }) => fetchLiveAnalytics(signal),
    refetchInterval: LIVE_ANALYTICS_REFRESH_MS,
  })
}

/**
 * `GET /admin/live/rooms/:id` — the room page (plan.md Live §5.2, L2).
 * A missing room is an answer, not a transient failure worth retrying.
 */
export function useLiveRoom(id: string) {
  return useQuery({
    queryKey: queryKeys.liveRooms.detail(id),
    queryFn: ({ signal }) => fetchLiveRoom(id, signal),
    enabled: id.length > 0,
    retry: (failureCount, error) =>
      error instanceof NotFoundError ? false : failureCount < 1,
    /*
     * L5: every 5 s while Live or Paused — the stage, audience, viewers and
     * log move under an operator's feet. Stopped once the room has ended (it
     * can no longer change) and after an error (no polling into a 404).
     * TanStack pauses it while the browser tab is hidden.
     */
    refetchInterval: (query) => {
      const status = query.state.data?.room.status
      return status === 'LIVE' || status === 'PAUSED' ? LIVE_ROOM_REFRESH_MS : false
    },
  })
}
