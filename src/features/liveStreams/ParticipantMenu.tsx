import { Ban, Mic, MicOff, MoreHorizontal, UserX } from 'lucide-react'
import { useState } from 'react'

import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ParticipantAction } from '@/types/liveRooms'

import { useLiveWrite } from './useLiveModeration'

/**
 * Mute / Unmute / Kick / Block for one person in a room (plan.md Live §5.3).
 *
 * Not offered for the host: the way to stop a host is Terminate, which says
 * what it does to the whole room. Mute or Unmute is offered by the person's
 * current state, never both.
 */

const COPY: Readonly<
  Record<
    ParticipantAction,
    { title: string; confirm: string; effect: (name: string) => string }
  >
> = {
  MUTE: {
    title: 'Mute this speaker',
    confirm: 'Mute',
    effect: (name) =>
      `${name}'s microphone is muted straight away. They stay on their seat, and can be unmuted from here.`,
  },
  UNMUTE: {
    title: 'Unmute this speaker',
    confirm: 'Unmute',
    effect: (name) => `${name}'s microphone is turned back on.`,
  },
  KICK: {
    title: 'Remove from the room',
    confirm: 'Remove',
    effect: (name) =>
      `${name} is removed from the room straight away — from their seat too, if they have one. They can join again.`,
  },
  BLOCK: {
    title: 'Block from the room',
    confirm: 'Block',
    effect: (name) =>
      `${name} is removed from the room and cannot join it again for as long as it runs.`,
  },
}

export function ParticipantMenu({
  roomId,
  userId,
  name,
  muted,
  seated,
}: {
  roomId: string
  userId: string
  name: string
  muted: boolean
  seated: boolean
}) {
  const write = useLiveWrite()
  const [action, setAction] = useState<ParticipantAction | null>(null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="-mt-1 -mr-1 size-8 shrink-0"
            aria-label={`Actions for ${name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {seated ? (
            muted ? (
              <DropdownMenuItem onSelect={() => setAction('UNMUTE')}>
                <Mic /> Unmute
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setAction('MUTE')}>
                <MicOff /> Mute
              </DropdownMenuItem>
            )
          ) : null}
          <DropdownMenuItem onSelect={() => setAction('KICK')}>
            <UserX /> Remove from room
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* `-foreground` red: the theme's `destructive` red fails AA on white. */}
          <DropdownMenuItem
            className="text-danger-foreground focus:text-danger-foreground"
            onSelect={() => setAction('BLOCK')}
          >
            <Ban className="text-danger-foreground" /> Block
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {action ? (
        <ConfirmActionDialog
          open
          onOpenChange={(next) => !next && setAction(null)}
          title={COPY[action].title}
          target={name}
          effect={COPY[action].effect(name)}
          severity={
            action === 'BLOCK' ? 'critical' : action === 'UNMUTE' ? 'info' : 'warning'
          }
          confirmLabel={COPY[action].confirm}
          loading={write.isPending}
          onConfirm={(reason) =>
            write.mutate(
              { kind: 'participant', roomId, userId, action, reason },
              { onSuccess: () => setAction(null) },
            )
          }
        />
      ) : null}
    </>
  )
}
