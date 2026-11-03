import { ArrowLeft, Mic, Video } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { toast } from 'sonner'

import { isAppError, NotFoundError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import { CopyableId, DateTime, KeyValueGrid, PageHeader } from '@/components/display'
import { ErrorState, LoadingState, NotFoundState } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { humaniseEnum } from '@/lib/status'
import { hostName, type LiveRoomDetail } from '@/types/liveRooms'

import { DurationCell, LIVE_TIME_ZONE, RoomStatusCell } from './cells'
import { topicLabel, typeLabel } from './labels'
import {
  AudienceCard,
  AuditLogCard,
  MoneyCard,
  StageCard,
  StatusCard,
} from './roomSections'
import { ListenPanel } from './ListenPanel'
import { RoomActions } from './RoomActions'
import { useLiveRoom } from './useLiveRooms'

/**
 * One live room — `/live-streams/:roomId` (plan.md Live §5.2, phase L2).
 *
 * Moderation (L3): Warn, Lockdown, Purge chat, Terminate in the header and a
 * ⋯ menu per person — only on a room still on air (Live or Paused) and only
 * with `live.moderate`. An ended room says so rather than showing buttons
 * that cannot work.
 *
 * ⚠️ The stage and audience shapes are the guide's — no room has been live on
 * staging (plan.md L-B6); they are drawn from the mock's live fixtures.
 */

interface Back {
  readonly href: string
  readonly label: string
}

/** Only a list query this page itself put in `state.from` — never a free URL. */
const LIST_QUERY = /^\?[A-Za-z0-9_.~%+=&-]{0,300}$/

/**
 * Where else a room is opened from (plan.md Live L4), each matched exactly and
 * given a fixed label — a `backTo` is never followed as a free URL, and the
 * label is never the caller's to choose.
 */
const BACK_TARGETS: readonly { pattern: RegExp; label: string }[] = [
  {
    pattern: /^\/diamonds\/transactions(\?[A-Za-z0-9_.~%+=&-]{0,300})?$/,
    label: 'Gift transactions',
  },
  { pattern: /^\/hosts(\?[A-Za-z0-9_.~%+=&-]{0,300})?$/, label: 'Live hosts' },
  {
    pattern: /^\/users\/[A-Za-z0-9_-]{1,64}(\?tab=[a-z-]{1,32})?$/,
    label: 'Back to the account',
  },
]

function useBack(): Back {
  const state: unknown = useLocation().state
  const record =
    state && typeof state === 'object' ? (state as Record<string, unknown>) : {}
  const { from, backTo } = record

  if (typeof backTo === 'string') {
    const target = BACK_TARGETS.find(({ pattern }) => pattern.test(backTo))
    if (target) return { href: backTo, label: target.label }
  }
  return {
    href:
      typeof from === 'string' && LIST_QUERY.test(from)
        ? `${ROUTES.liveStreams}${from}`
        : ROUTES.liveStreams,
    label: 'Live streams',
  }
}

function BackLink({ back }: { back: Back }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-2.5 max-w-full self-start" asChild>
      <Link to={back.href}>
        <ArrowLeft /> <span className="truncate">{back.label}</span>
      </Link>
    </Button>
  )
}

function HostLine({ detail }: { detail: LiveRoomDetail }) {
  const canOpenUser = useCan(PERMISSIONS.usersView)
  const canOpenRoster = useCan(PERMISSIONS.hostApplicationsView)
  const { host } = detail.room
  const name = hostName(host)
  const username = host.profile?.username?.trim()
  const standing = host.liveHostProfile?.status
  const notGood = standing && standing !== 'ACTIVE' ? standing : null
  const agency = host.liveHostProfile?.agency?.name?.trim()

  const badgeClass = cn(
    'inline-flex items-center rounded-sm px-1.5 py-0.5 text-overline whitespace-nowrap',
    notGood
      ? 'bg-warning-soft text-warning-foreground'
      : 'bg-info-soft text-info-foreground',
  )
  const badgeText = notGood ? `Host · ${humaniseEnum(notGood)}` : 'Host'

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {canOpenUser ? (
        <Link
          to={ROUTES.user(host.id)}
          className="font-medium wrap-anywhere text-primary hover:underline"
        >
          {name}
        </Link>
      ) : (
        <span className="font-medium wrap-anywhere">{name}</span>
      )}
      {canOpenRoster ? (
        <Link
          to={
            username
              ? `${ROUTES.hosts}?search=${encodeURIComponent(username)}`
              : ROUTES.hosts
          }
          className={cn(badgeClass, 'hover:underline')}
          aria-label={`${badgeText} — open in Live hosts`}
        >
          {badgeText}
        </Link>
      ) : (
        <span className={badgeClass}>{badgeText}</span>
      )}
      {username && username !== name ? (
        <span className="text-caption text-foreground-muted">@{username}</span>
      ) : null}
      {agency ? (
        <span className="basis-full text-caption text-foreground-muted">
          Agency: {agency}
        </span>
      ) : null}
    </span>
  )
}

function Header({
  detail,
  canModerate,
}: {
  detail: LiveRoomDetail
  canModerate: boolean
}) {
  const { room } = detail
  const topic = topicLabel(room.topic)
  const TypeIcon = room.type === 'VIDEO' ? Video : Mic

  return (
    <section
      aria-label="Stream"
      className="space-y-4 rounded-md border border-border bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <RoomStatusCell row={room} />
        <span className="inline-flex items-center gap-1.5 text-caption text-foreground-muted">
          <TypeIcon className="size-3.5" aria-hidden="true" />
          {typeLabel(room.type)}
          {topic ? ` · ${topic}` : ''}
        </span>
        {room.status !== 'ENDED' ? (
          <span className="text-caption text-foreground-muted sm:ml-auto">
            Updates every 5 seconds
          </span>
        ) : null}
      </div>
      <KeyValueGrid
        columns={3}
        className="lg:grid-cols-4 xl:grid-cols-4"
        items={[
          { label: 'Host', value: <HostLine detail={detail} /> },
          {
            label: 'Started',
            value: <DateTime value={room.startedAt} timeZone={LIVE_TIME_ZONE} />,
          },
          {
            label: room.status === 'ENDED' ? 'Lasted' : 'On air for',
            value: <DurationCell row={room} />,
          },
          ...(room.status === 'ENDED'
            ? [
                {
                  label: 'Ended',
                  value: <DateTime value={room.endedAt} timeZone={LIVE_TIME_ZONE} />,
                },
              ]
            : []),
        ]}
      />
      {canModerate && room.status !== 'ENDED' ? (
        <div className="border-t border-border pt-4">
          <RoomActions room={room} />
        </div>
      ) : null}
      {room.status === 'ENDED' ? (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-body text-foreground-muted">
          This stream has ended. Moderation actions are only available while a room is
          live.
        </p>
      ) : null}
    </section>
  )
}

export function LiveRoomPage() {
  const { roomId = '' } = useParams<{ roomId: string }>()
  const back = useBack()
  const query = useLiveRoom(roomId)
  const mayModerate = useCan(PERMISSIONS.liveModerate)
  const mayListen = useCan(PERMISSIONS.liveListen)
  const status = query.data?.room.status

  /*
   * L5: a stream that ends while this page is open says so — its buttons and
   * stage disappear on the next refresh, and an operator mid-action should
   * know why rather than see the page change silently.
   */
  const lastStatus = useRef(status)
  useEffect(() => {
    const was = lastStatus.current
    lastStatus.current = status
    if ((was === 'LIVE' || was === 'PAUSED') && status === 'ENDED') {
      toast.info('This stream has ended.')
    }
  }, [status])

  if (query.isPending || query.isError) {
    const notFound = query.error instanceof NotFoundError
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <BackLink back={back} />
          <PageHeader title="Live stream" />
        </div>
        {query.isPending ? (
          <LoadingState variant="detail" />
        ) : notFound ? (
          <NotFoundState
            title="Stream not found"
            description="No live room has this id. Check the link, or find the stream in Live streams."
          />
        ) : (
          <ErrorState
            {...(isAppError(query.error) ? { description: query.error.message } : {})}
            {...(isAppError(query.error) && query.error.correlationId
              ? { correlationId: query.error.correlationId }
              : {})}
            onRetry={() => void query.refetch()}
          />
        )}
      </div>
    )
  }

  const detail = query.data
  const { room } = detail
  const onAir = room.status === 'LIVE' || room.status === 'PAUSED'
  const canModerate = mayModerate && onAir

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <BackLink back={back} />
        <PageHeader title={room.title.trim() || 'Untitled stream'} />
      </div>

      <Header detail={detail} canModerate={canModerate} />

      {/* L6: Super Admin only, and only while the room is on air and not paused. */}
      {mayListen && room.status === 'LIVE' ? <ListenPanel room={room} /> : null}

      {/* An ended room has no stage or audience — the header already says so. */}
      {onAir ? <StageCard room={room} onAir canModerate={canModerate} /> : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <StatusCard detail={detail} onAir={onAir} />
        <MoneyCard detail={detail} />
      </div>

      {onAir ? <AudienceCard room={room} onAir canModerate={canModerate} /> : null}

      <AuditLogCard logs={room.moderationLogs} />

      <details className="rounded-md border border-border bg-surface p-4 text-caption sm:px-6">
        <summary className="cursor-pointer text-foreground-muted">
          Technical details
        </summary>
        <KeyValueGrid
          className="mt-4"
          items={[
            { label: 'Room ID', value: <CopyableId value={room.id} label="Room ID" /> },
            {
              label: 'LiveKit room name',
              value: room.livekitRoomName ? (
                <CopyableId value={room.livekitRoomName} label="LiveKit room name" />
              ) : (
                '—'
              ),
            },
            {
              label: 'Host ID',
              value: <CopyableId value={room.host.id} label="Host ID" />,
            },
          ]}
        />
      </details>
    </div>
  )
}
