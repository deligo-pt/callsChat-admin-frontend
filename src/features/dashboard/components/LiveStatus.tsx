import { RotateCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

import { agoLabel } from './helpers'

/**
 * The header's live indicator (plan.md D5): a pulsing dot, "Updated 12s ago",
 * and a Refresh button.
 *
 * - **Live** (green pulse): the last poll succeeded.
 * - **Reconnecting** (amber, no pulse): the last poll failed; the numbers shown
 *   are the last good ones, and polling carries on.
 *
 * The "ago" text ticks every 5s. It is not a live region: announcing it every
 * few seconds would drown a screen reader. A separate polite region speaks
 * only when something changes that a listener would want to know (DB5):
 *
 * - updates pause (a poll failed) or resume;
 * - a Refresh they asked for has finished.
 *
 * A routine 30s poll says nothing.
 */

function useAnnouncement(
  failing: boolean,
  refreshing: boolean,
  requested: { current: boolean },
) {
  const [message, setMessage] = useState('')
  const [wasFailing, setWasFailing] = useState(failing)
  const [wasRefreshing, setWasRefreshing] = useState(refreshing)

  /* Derived during render from the previous values: no effect, no extra paint. */
  const statusChanged = failing !== wasFailing
  if (statusChanged) {
    setWasFailing(failing)
    setMessage(
      failing ? 'Live updates paused. Trying to reconnect.' : 'Live updates resumed.',
    )
  }
  if (refreshing !== wasRefreshing) {
    setWasRefreshing(refreshing)
    /* "Resumed" says more than "refreshed", so it wins when both happen at once. */
    if (!refreshing && requested.current && !failing && !statusChanged) {
      setMessage('Dashboard figures refreshed.')
    }
  }
  return message
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function LiveStatus({
  updatedAt,
  failing,
  refreshing,
  onRefresh,
}: {
  updatedAt: number
  failing: boolean
  refreshing: boolean
  onRefresh: () => void
}) {
  const now = useNow(5_000)
  const requested = useRef(false)
  const announcement = useAnnouncement(failing, refreshing, requested)

  useEffect(() => {
    if (!refreshing) requested.current = false
  }, [refreshing])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-caption">
        <span className="relative flex size-2.5" aria-hidden="true">
          {!failing ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
          ) : null}
          <span
            className={cn(
              'relative inline-flex size-2.5 rounded-full',
              failing ? 'bg-warning' : 'bg-success',
            )}
          />
        </span>
        <span className="font-medium text-foreground">
          {failing ? 'Reconnecting' : 'Live'}
        </span>
        <span className="text-foreground-muted">· {agoLabel(updatedAt, now)}</span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          requested.current = true
          onRefresh()
        }}
        aria-busy={refreshing || undefined}
      >
        <RotateCw
          className={cn(refreshing && 'animate-spin motion-reduce:animate-none')}
          aria-hidden="true"
        />
        Refresh
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  )
}
