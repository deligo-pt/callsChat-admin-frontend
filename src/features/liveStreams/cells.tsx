import { Mic, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'

import { ROUTES } from '@/app/routes'
import { DateTime, StatusBadge } from '@/components/display'
import { STOP_ROW_CLICK } from '@/components/wallet'
import { cn } from '@/lib/cn'
import { formatCount, formatDuration } from '@/lib/format'
import { humaniseEnum } from '@/lib/status'
import { hostName, roomDuration, type LiveRoom } from '@/types/liveRooms'

import { topicLabel, typeLabel } from './labels'

/**
 * How one row of the Live streams page is drawn (plan.md Live §5.1).
 *
 * Times are Bangladesh time, as on the wallet ledger. Names, never raw ids.
 */

export const LIVE_TIME_ZONE = 'Asia/Dhaka'

/** Now, re-read every second while `ticking` — for a live room's duration. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [ticking])
  return now
}

const isOnAir = (room: LiveRoom) => room.status === 'LIVE' || room.status === 'PAUSED'

/**
 * The title, as a real link to the room — so it opens in a new tab as well as
 * by clicking the row — carrying the list's query so "back" returns here.
 */
export function StreamCell({ row }: { row: LiveRoom }) {
  const { search } = useLocation()
  const topic = topicLabel(row.topic)
  const TypeIcon = row.type === 'VIDEO' ? Video : Mic

  return (
    <span className="flex min-w-0 flex-col gap-0.5 lg:min-w-[12rem]">
      <Link
        to={ROUTES.liveStream(row.id)}
        state={{ from: search }}
        className="line-clamp-2 font-medium wrap-anywhere text-primary hover:underline"
        title={row.title}
        {...STOP_ROW_CLICK}
      >
        {row.title.trim() || 'Untitled stream'}
      </Link>
      <span className="inline-flex flex-wrap items-center gap-x-1.5 text-caption text-foreground-muted">
        <TypeIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{typeLabel(row.type)}</span>
        {topic ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{topic}</span>
          </>
        ) : null}
      </span>
    </span>
  )
}

/**
 * Everyone who opens a room is a host, so the badge says it — and says when
 * they are not in good standing. History rows carry no host profile; there the
 * badge reads plain "Host".
 */
function LiveHostBadge({ status }: { status: string | null | undefined }) {
  const standing = status && status !== 'ACTIVE' ? status : null
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-0.5 text-overline whitespace-nowrap',
        standing
          ? 'bg-warning-soft text-warning-foreground'
          : 'bg-info-soft text-info-foreground',
      )}
    >
      {standing ? `Host · ${humaniseEnum(standing)}` : 'Host'}
    </span>
  )
}

export function HostCell({ row }: { row: LiveRoom }) {
  const name = hostName(row.host)
  const username = row.host.profile?.username?.trim()
  const profile = row.host.liveHostProfile
  const agency = profile?.agency?.name?.trim()

  return (
    <span className="flex min-w-0 flex-col gap-0.5 lg:min-w-[10rem]">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium wrap-anywhere">{name}</span>
        <LiveHostBadge status={profile?.status} />
      </span>
      {username && username !== name ? (
        <span className="truncate text-caption text-foreground-muted">@{username}</span>
      ) : null}
      {agency ? (
        <span className="truncate text-caption text-foreground-muted">
          Agency: {agency}
        </span>
      ) : null}
    </span>
  )
}

export function RoomStatusCell({ row }: { row: LiveRoom }) {
  if (row.status === 'LIVE') {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className="relative flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        <span className="text-body">Live</span>
      </span>
    )
  }
  return <StatusBadge domain="liveRoom" value={row.status} variant="dot" />
}

export function StartedCell({ row }: { row: LiveRoom }) {
  return (
    <span className="whitespace-nowrap">
      <DateTime value={row.startedAt} timeZone={LIVE_TIME_ZONE} />
    </span>
  )
}

export function DurationCell({ row }: { row: LiveRoom }) {
  const onAir = isOnAir(row)
  const now = useNow(onAir)
  return (
    <span className="tabular whitespace-nowrap">
      {formatDuration(roomDuration(row, now))}
      {onAir ? <span className="sr-only"> so far</span> : null}
    </span>
  )
}

/** Now · peak while on air; peak (and total, when sent) once ended. */
export function ViewersCell({ row }: { row: LiveRoom }) {
  const peak = row.peakViewers ?? null
  if (isOnAir(row)) {
    const current = row.currentViewers ?? null
    return (
      <span className="tabular whitespace-nowrap">
        {current === null ? '—' : `${formatCount(current)} now`}
        <span className="text-foreground-muted">
          {' '}
          · peak {peak === null ? '—' : formatCount(peak)}
        </span>
      </span>
    )
  }
  return (
    <span className="tabular whitespace-nowrap">
      {peak === null ? '—' : `Peak ${formatCount(peak)}`}
      {typeof row.totalViewers === 'number' ? (
        <span className="text-foreground-muted">
          {' '}
          · {formatCount(row.totalViewers)} total
        </span>
      ) : null}
    </span>
  )
}

/**
 * People on a seat, **not counting the host** (confirmed by the backend team
 * 2026-11-07). History rows carry no count — and an ended stage is empty.
 */
export function StageCell({ row }: { row: LiveRoom }) {
  const count = row.activeParticipantsCount
  if (!isOnAir(row) || typeof count !== 'number') {
    return <span className="text-foreground-subtle">—</span>
  }
  const seats = row.maxSeats ?? 10
  return (
    <span className="tabular whitespace-nowrap">
      {formatCount(count)}
      <span className="text-foreground-muted"> of {formatCount(seats)} seats</span>
    </span>
  )
}

export function ModActionsCell({ row }: { row: LiveRoom }) {
  const count = row._count?.moderationLogs
  if (typeof count !== 'number')
    return <span className="text-foreground-subtle">—</span>
  return (
    <span
      className={cn(
        'tabular whitespace-nowrap',
        count > 0 ? 'font-medium text-warning-foreground' : 'text-foreground-muted',
      )}
    >
      {formatCount(count)} {count === 1 ? 'action' : 'actions'}
    </span>
  )
}
