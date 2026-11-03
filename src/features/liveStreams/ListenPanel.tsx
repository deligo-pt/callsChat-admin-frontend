import { Headphones, Loader2, Square, Volume2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { formatCount } from '@/lib/format'
import type { LiveRoom } from '@/types/liveRooms'

import { useStealthListener } from './useStealthListener'

/**
 * "Listen silently" (plan.md Live §5.4, phase L6). Super Admin only, and
 * only on a room that is LIVE; the page checks both before rendering this.
 *
 * Audio only, never recorded, invisible to the room. The chat feed is not
 * part of it (plan.md §0).
 */
export function ListenPanel({ room }: { room: LiveRoom }) {
  const listener = useStealthListener(room.id)
  const { state, stop } = listener
  const [confirming, setConfirming] = useState(false)
  const volumeId = useId()

  // The room went off air (L5 polling): hang up rather than sit on a dead line.
  const live = room.status === 'LIVE'
  useEffect(() => {
    if (!live) stop()
  }, [live, stop])

  const busy = state.phase === 'connecting'
  const listening = state.phase === 'listening'

  return (
    <section
      aria-label="Listen silently"
      className="space-y-3 rounded-md border border-border bg-surface p-4 sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="flex items-center gap-2 text-h4 font-semibold">
            <Headphones className="size-4" aria-hidden="true" />
            Listen silently
          </h2>
          <p className="text-caption text-foreground-muted">
            Hear the stage audio without joining. Nobody in the room can see you, and
            nothing is recorded. Super Admin only.
          </p>
        </div>

        {listening ? (
          <Button variant="outline" onClick={stop}>
            <Square /> Stop listening
          </Button>
        ) : (
          <Button onClick={() => setConfirming(true)} disabled={busy || !live}>
            {busy ? <Loader2 className="animate-spin" /> : <Headphones />}
            {busy ? 'Connecting…' : 'Listen'}
          </Button>
        )}
      </div>

      {listening ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-3">
          <span
            role="status"
            className="inline-flex items-center gap-2 text-body font-medium text-success-foreground"
          >
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            Listening ·{' '}
            {state.speakers === 0
              ? 'nobody is speaking'
              : `${formatCount(state.speakers)} ${state.speakers === 1 ? 'speaker' : 'speakers'}`}
          </span>
          <label
            htmlFor={volumeId}
            className="inline-flex items-center gap-2 text-caption text-foreground-muted"
          >
            <Volume2 className="size-4" aria-hidden="true" />
            Volume
            <input
              id={volumeId}
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(listener.volume * 100)}
              onChange={(event) => listener.setVolume(Number(event.target.value) / 100)}
              className="w-32 accent-primary"
            />
          </label>
          {state.blocked ? (
            <Button variant="outline" size="sm" onClick={() => void listener.resume()}>
              The browser paused the sound — play it
            </Button>
          ) : null}
        </div>
      ) : null}

      {state.phase === 'error' ? (
        <p role="alert" className="text-caption text-danger-foreground">
          {state.message}
        </p>
      ) : null}

      {confirming ? (
        <ConfirmActionDialog
          open
          onOpenChange={(next) => !next && setConfirming(false)}
          title="Listen silently"
          target={room.title.trim() || 'Untitled stream'}
          effect="You will hear the stage audio of this room live. Nobody in the room is told, you do not appear in the audience, and you cannot speak. Nothing is recorded or saved. The listening stops when you press Stop, leave this page, or the stream ends."
          severity="info"
          reason="none"
          confirmLabel="Start listening"
          onConfirm={() => {
            setConfirming(false)
            void listener.start()
          }}
        />
      ) : null}
    </section>
  )
}
