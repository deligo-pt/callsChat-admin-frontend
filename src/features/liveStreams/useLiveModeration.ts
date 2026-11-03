import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import {
  lockdownLiveRoom,
  moderateParticipant,
  purgeLiveChat,
  reapStaleRooms,
  terminateLiveRoom,
  warnLiveRoom,
  type LockdownPayload,
  type TerminatePayload,
  type WarnPayload,
} from '@/api/liveRooms'
import { queryKeys } from '@/api/queryKeys'
import type { ParticipantAction } from '@/types/liveRooms'

/**
 * The moderation writes (plan.md Live §5.3, phase L3).
 *
 * Every success refetches everything under `live-rooms` — the room, both
 * lists and the counters — and shows **the server's own sentence**. Every
 * failure is shown verbatim and leaves the dialog open with what was typed.
 *
 * ⚠️ None of these has been called against staging (plan.md L-B5, GET-only
 * probing): bodies are the guide's, and the audit trail on staging confirms
 * what six of them record.
 */

export type LiveWrite =
  | { kind: 'warn'; roomId: string; payload: WarnPayload }
  | {
      kind: 'participant'
      roomId: string
      userId: string
      action: ParticipantAction
      reason: string
    }
  | { kind: 'lockdown'; roomId: string; payload: LockdownPayload }
  | { kind: 'purge'; roomId: string; reason: string }
  | { kind: 'terminate'; roomId: string; payload: TerminatePayload }

const FALLBACK: Record<LiveWrite['kind'], string> = {
  warn: 'The warning was sent.',
  participant: 'Done.',
  lockdown: 'The lockdown is on.',
  purge: 'The chat was purged.',
  terminate: 'The stream was ended.',
}

function run(write: LiveWrite): Promise<string> {
  switch (write.kind) {
    case 'warn':
      return warnLiveRoom(write.roomId, write.payload)
    case 'participant':
      return moderateParticipant(write.roomId, write.userId, {
        action: write.action,
        reason: write.reason,
      })
    case 'lockdown':
      return lockdownLiveRoom(write.roomId, write.payload)
    case 'purge':
      return purgeLiveChat(write.roomId, write.reason)
    case 'terminate':
      return terminateLiveRoom(write.roomId, write.payload)
  }
}

export function errorText(error: unknown, fallback: string): string {
  return isAppError(error) && error.message ? error.message : fallback
}

export function useLiveWrite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    retry: false,
    onSuccess: async (message, write) => {
      toast.success(message.trim() || FALLBACK[write.kind])
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.liveRooms.all }),
        /* Terminate can suspend the host: the roster and their record change. */
        ...(write.kind === 'terminate'
          ? [
              queryClient.invalidateQueries({ queryKey: queryKeys.hosts.all }),
              queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
            ]
          : []),
      ])
    },
    onError: (error) => {
      toast.error(errorText(error, 'The action could not be completed.'))
    },
  })
}

export function useReapStale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (minutes: number) => reapStaleRooms(minutes),
    retry: false,
    onSuccess: async (result) => {
      toast.success(
        result.message.trim() ||
          (result.reapedCount === 1
            ? '1 stale stream was ended.'
            : `${result.reapedCount} stale streams were ended.`),
      )
      await queryClient.invalidateQueries({ queryKey: queryKeys.liveRooms.all })
    },
    onError: (error) => {
      toast.error(errorText(error, 'The sweep could not be run.'))
    },
  })
}
