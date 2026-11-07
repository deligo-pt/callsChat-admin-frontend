import { ArrowUpRight, Lock, MicOff, Shield } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import { DateTime, KeyValueGrid, type KeyValueItem } from '@/components/display'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useUserName } from '@/components/wallet'
import { cn } from '@/lib/cn'
import { formatCount, formatDiamonds } from '@/lib/format'
import { humaniseEnum } from '@/lib/status'
import type { LiveRoomDetail, ModerationLog, StageParticipant } from '@/types/liveRooms'

import { LIVE_TIME_ZONE } from './cells'
import { ParticipantMenu } from './ParticipantMenu'
import { VIOLATION_LABELS } from './labels'

/**
 * The read-only sections of the room page (plan.md Live §5.2, L2).
 *
 * ⚠️ Names, never raw ids: gifters and moderation targets arrive as ids only
 * (plan.md L-B3), so each is looked up — one request per person, cached.
 * Nothing a room's members say or stream is rendered here.
 */

type Room = LiveRoomDetail['room']

export function Card({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const id = `live-room-${title.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'grid grid-cols-1 content-start gap-4 rounded-md border border-border bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h2 id={id} className="flex items-center text-h4 font-semibold sm:min-h-8">
          {title}
        </h2>
        {description ? (
          <p className="text-caption text-foreground-muted">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="order-last sm:order-none [&>*]:w-full sm:[&>*]:w-auto">
          {action}
        </div>
      ) : null}
      <div className="min-w-0 space-y-4 sm:col-span-2">{children}</div>
    </section>
  )
}

export function OutLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link to={to}>
        {children} <ArrowUpRight />
      </Link>
    </Button>
  )
}

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

/** A person known only by id: their name, linked to their record. */
export function PersonById({ userId }: { userId: string }) {
  const canOpen = useCan(PERMISSIONS.usersView)
  const name = useUserName(userId, canOpen)
  if (!canOpen) return <span>A user</span>
  if (name.isPending) return <Skeleton className="inline-block h-5 w-28 align-middle" />
  const label =
    name.data?.displayName?.trim() ||
    (name.data?.username ? `@${name.data.username}` : null)
  /* No record behind the id (deleted, or unreadable): no link to a dead page. */
  if (!label) return <span className="text-foreground-muted">Unknown user</span>
  return (
    <Link
      to={ROUTES.user(userId)}
      className="font-medium wrap-anywhere text-primary hover:underline"
    >
      {label}
    </Link>
  )
}

function participantName(p: StageParticipant): string {
  return (
    p.user?.profile?.displayName?.trim() ||
    (p.user?.profile?.username ? `@${p.user.profile.username.trim()}` : '') ||
    'Unnamed user'
  )
}

function initials(name: string): string {
  const letters = name
    .replace(/^@/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return letters || '?'
}

/** Initials only — the panel loads no member images from a live room. */
function Initials({ name, host = false }: { name: string; host?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full text-caption font-semibold',
        host
          ? 'bg-primary-soft text-primary-700'
          : 'bg-neutral-soft text-neutral-foreground',
      )}
    >
      {initials(name)}
    </span>
  )
}

function PersonName({ p }: { p: StageParticipant }) {
  const canOpen = useCan(PERMISSIONS.usersView)
  const name = participantName(p)
  return canOpen ? (
    <Link
      to={ROUTES.user(p.userId)}
      className="line-clamp-2 font-medium wrap-anywhere text-primary hover:underline"
      title={name}
    >
      {name}
    </Link>
  ) : (
    <span className="line-clamp-2 font-medium wrap-anywhere" title={name}>
      {name}
    </span>
  )
}

function roleLabel(role: string | null | undefined): string {
  if (!role) return 'On stage'
  if (role === 'CO_HOST') return 'Co-host'
  return humaniseEnum(role)
}

/* ------------------------------------------------------------------ *
 * Stage
 * ------------------------------------------------------------------ */

/** The host is stopped with Terminate, never from a seat menu. */
function isHost(p: StageParticipant, room: Room): boolean {
  return p.seatSlot === 1 || p.role === 'HOST' || p.userId === room.host.id
}

export function StageCard({
  room,
  onAir,
  canModerate = false,
}: {
  room: Room
  onAir: boolean
  canModerate?: boolean
}) {
  const seats = Math.max(1, Math.min(room.maxSeats ?? 10, 20))
  const locked = new Set(room.lockedSeats ?? [])
  const bySlot = new Map<number, StageParticipant>()
  for (const p of room.participants) {
    if (typeof p.seatSlot === 'number') bySlot.set(p.seatSlot, p)
  }
  const seated = bySlot.size

  return (
    <Card
      title="Stage"
      description={
        onAir
          ? `${formatCount(seated)} of ${formatCount(seats)} seats taken${
              locked.size > 0 ? ` · ${formatCount(locked.size)} locked` : ''
            }.`
          : 'The stage empties when a stream ends.'
      }
    >
      {onAir ? (
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: seats }, (_, index) => index + 1).map((slot) => {
            const p = bySlot.get(slot)
            return (
              <li
                key={slot}
                className={cn(
                  'flex min-h-28 min-w-0 flex-col gap-2 rounded-md border p-3',
                  p
                    ? 'border-border bg-surface'
                    : 'border-dashed border-border bg-surface-muted',
                )}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-overline text-foreground-subtle uppercase">
                    Seat {slot}
                    {slot === 1 ? ' · Host' : ''}
                  </span>
                  {p && canModerate && !isHost(p, room) ? (
                    <ParticipantMenu
                      roomId={room.id}
                      userId={p.userId}
                      name={participantName(p)}
                      muted={p.isMuted === true}
                      seated
                    />
                  ) : null}
                </span>
                {p ? (
                  <div className="flex min-w-0 items-start gap-2">
                    <Initials name={participantName(p)} host={slot === 1} />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <PersonName p={p} />
                      <span className="inline-flex flex-wrap items-center gap-1 text-caption text-foreground-muted">
                        {roleLabel(p.role)}
                        {p.isMuted ? (
                          <span className="inline-flex items-center gap-0.5 text-warning-foreground">
                            <MicOff className="size-3.5" aria-hidden="true" />
                            Muted
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                ) : locked.has(slot) ? (
                  <span className="inline-flex items-center gap-1.5 text-caption text-foreground-muted">
                    <Lock className="size-3.5" aria-hidden="true" />
                    Locked by the host
                  </span>
                ) : (
                  <span className="text-caption text-foreground-muted">Empty</span>
                )}
              </li>
            )
          })}
        </ol>
      ) : null}
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * Audience
 * ------------------------------------------------------------------ */

const AUDIENCE_PREVIEW = 24

export function AudienceCard({
  room,
  onAir,
  canModerate = false,
}: {
  room: Room
  onAir: boolean
  canModerate?: boolean
}) {
  const audience = room.participants.filter((p) => typeof p.seatSlot !== 'number')
  /* A busy room can hold hundreds: the first screenful, then on request. */
  const [all, setAll] = useState(false)
  const shown = all ? audience : audience.slice(0, AUDIENCE_PREVIEW)

  return (
    <Card
      title="Audience"
      description={
        onAir
          ? `${formatCount(audience.length)} ${audience.length === 1 ? 'person' : 'people'} listening without a seat.`
          : 'The audience leaves when a stream ends.'
      }
    >
      {onAir && audience.length > 0 ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <li
              key={p.id ?? p.userId}
              className="flex min-w-0 items-center gap-2 rounded-md bg-surface-muted px-3 py-2"
            >
              <Initials name={participantName(p)} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <PersonName p={p} />
                {p.joinedAt ? (
                  <span className="text-caption text-foreground-muted">
                    Joined <DateTime value={p.joinedAt} timeZone={LIVE_TIME_ZONE} />
                  </span>
                ) : null}
              </div>
              {canModerate ? (
                <ParticipantMenu
                  roomId={room.id}
                  userId={p.userId}
                  name={participantName(p)}
                  muted={p.isMuted === true}
                  seated={false}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : onAir ? (
        <p className="text-body text-foreground-muted">Nobody is in the audience.</p>
      ) : null}
      {onAir && audience.length > AUDIENCE_PREVIEW ? (
        <Button variant="outline" size="sm" onClick={() => setAll((open) => !open)}>
          {all ? 'Show fewer' : `Show all ${formatCount(audience.length)}`}
        </Button>
      ) : null}
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * Status and settings
 * ------------------------------------------------------------------ */

function OnOff({ value }: { value: boolean | undefined }) {
  if (value === undefined) return <span className="text-foreground-subtle">—</span>
  return (
    <span className={value ? 'text-success-foreground' : 'text-danger-foreground'}>
      {value ? 'On' : 'Off'}
    </span>
  )
}

export function StatusCard({
  detail,
  onAir,
}: {
  detail: LiveRoomDetail
  onAir: boolean
}) {
  const { room, telemetry } = detail
  const settings = room.audioSettings ?? {}
  const count = (value: number | null | undefined) =>
    typeof value === 'number' ? formatCount(value) : '—'

  const items: KeyValueItem[] = onAir
    ? [
        {
          label: 'Viewers now',
          value: count(telemetry?.currentLiveViewers ?? room.currentViewers),
        },
        { label: 'Peak viewers', value: count(room.peakViewers) },
        {
          label: 'Seat requests waiting',
          value: count(telemetry?.pendingSeatRequests),
        },
        {
          label: 'Host',
          value:
            telemetry?.isHostOnline === true ? (
              <span className="text-success-foreground">Online</span>
            ) : telemetry?.isHostOnline === false ? (
              <span className="text-warning-foreground">Away</span>
            ) : (
              '—'
            ),
        },
      ]
    : [
        { label: 'Peak viewers', value: count(room.peakViewers) },
        { label: 'Total viewers', value: count(room.totalViewers) },
      ]

  return (
    <Card title="Status">
      <KeyValueGrid items={items} columns={2} />
      <div className="space-y-2">
        <h3 className="text-overline text-foreground-subtle uppercase">
          Room settings
        </h3>
        <KeyValueGrid
          columns={1}
          className="grid-cols-2 sm:grid-cols-4"
          items={[
            { label: 'Chat', value: <OnOff value={settings.allowChat} /> },
            { label: 'Gifts', value: <OnOff value={settings.allowGifts} /> },
            { label: 'Reactions', value: <OnOff value={settings.allowReactions} /> },
            { label: 'Stickers', value: <OnOff value={settings.allowStickers} /> },
          ]}
        />
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

export function MoneyCard({ detail }: { detail: LiveRoomDetail }) {
  const canLedger = useCan(PERMISSIONS.ledgerView)
  const money = detail.financials
  const diamonds = (value: number | null | undefined) =>
    typeof value === 'number' ? (
      <span className="tabular">{formatDiamonds(value)} Diamonds</span>
    ) : (
      '—'
    )
  const gifters = money?.topGifters ?? []

  return (
    <Card
      title="Money"
      description="Gifts sent in this room. The host earns a share of the Diamonds spent."
      action={
        canLedger ? (
          <OutLink to={ROUTES.giftLedger({ contextId: detail.room.id })}>
            Gifts in this room
          </OutLink>
        ) : undefined
      }
    >
      <KeyValueGrid
        className="sm:grid-cols-3"
        items={[
          { label: 'Diamonds spent', value: diamonds(money?.totalDiamondsSpent) },
          { label: 'Host earned', value: diamonds(money?.diamondsEarned) },
          {
            label: 'Gifts sent',
            value:
              typeof money?.totalGiftsSent === 'number'
                ? formatCount(money.totalGiftsSent)
                : '—',
          },
        ]}
      />
      <div className="space-y-2">
        <h3 className="text-overline text-foreground-subtle uppercase">Top gifters</h3>
        {gifters.length > 0 ? (
          <ol className="divide-y divide-border rounded-md border border-border">
            {gifters.map((gifter, index) => (
              <li
                key={gifter.senderId}
                className="flex min-w-0 items-center justify-between gap-3 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-5 shrink-0 tabular text-caption text-foreground-muted">
                    {index + 1}.
                  </span>
                  <PersonById userId={gifter.senderId} />
                </span>
                <span className="shrink-0 tabular text-body">
                  {formatDiamonds(gifter._sum?.totalPrice ?? 0)}{' '}
                  <span className="text-caption text-foreground-muted">diamonds</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-body text-foreground-muted">
            No gifts were sent in this room.
          </p>
        )}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * Audit log
 * ------------------------------------------------------------------ */

const ACTION_LABELS: Readonly<Record<string, { label: string; tone: string }>> = {
  WARN: { label: 'Warning', tone: 'bg-warning-soft text-warning-foreground' },
  TERMINATE: { label: 'Terminated', tone: 'bg-danger-soft text-danger-foreground' },
  MUTE: { label: 'Muted', tone: 'bg-warning-soft text-warning-foreground' },
  UNMUTE: { label: 'Unmuted', tone: 'bg-neutral-soft text-neutral-foreground' },
  KICK: { label: 'Kicked', tone: 'bg-warning-soft text-warning-foreground' },
  BLOCK: { label: 'Blocked', tone: 'bg-danger-soft text-danger-foreground' },
  STAGE_LOCKDOWN: { label: 'Lockdown', tone: 'bg-danger-soft text-danger-foreground' },
  CHAT_PURGED: {
    label: 'Chat purged',
    tone: 'bg-warning-soft text-warning-foreground',
  },
  REAP_STALE: { label: 'Stale sweep', tone: 'bg-neutral-soft text-neutral-foreground' },
}

/** What the action was set to do, in words — from the log's `metadata`. */
function settingsUsed(log: ModerationLog): string[] {
  const meta = log.metadata ?? {}
  const flag = (key: string) => meta[key] === true
  const out: string[] = []
  if (typeof meta['violationCode'] === 'string') {
    out.push(
      `Violation: ${(VIOLATION_LABELS as Record<string, string>)[meta['violationCode']] ?? humaniseEnum(meta['violationCode'])}`,
    )
  }
  if (log.action === 'STAGE_LOCKDOWN') {
    const parts = [
      flag('muteAllStage') ? 'stage muted' : null,
      flag('disableChat') ? 'chat off' : null,
      flag('disableGifts') ? 'gifts off' : null,
    ].filter((part): part is string => part !== null)
    out.push(
      parts.length > 0 ? `Lockdown: ${parts.join(', ')}` : 'Lockdown: nothing switched',
    )
  }
  if (log.action === 'TERMINATE') {
    out.push(flag('suspendHost') ? 'Host suspended' : 'Host not suspended')
    out.push(flag('freezeEarnings') ? 'Earnings frozen' : 'Earnings not frozen')
  }
  return out
}

function adminName(log: ModerationLog): string {
  return (
    log.admin?.profile?.displayName?.trim() ||
    (log.admin?.profile?.username ? `@${log.admin.profile.username.trim()}` : '') ||
    'An admin'
  )
}

export function AuditLogCard({ logs }: { logs: readonly ModerationLog[] }) {
  const sorted = [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <Card
      title="Moderation log"
      description={
        sorted.length > 0
          ? `${formatCount(sorted.length)} ${sorted.length === 1 ? 'action' : 'actions'} on this room, newest first.`
          : undefined
      }
    >
      {sorted.length === 0 ? (
        <p className="text-body text-foreground-muted">
          No moderation action has been taken on this room.
        </p>
      ) : (
        <ol className="space-y-3">
          {sorted.map((log) => {
            const action = ACTION_LABELS[log.action] ?? {
              label: humaniseEnum(log.action),
              tone: 'bg-neutral-soft text-neutral-foreground',
            }
            const used = settingsUsed(log)
            return (
              <li
                key={log.id}
                className="space-y-2 rounded-md border border-border p-3 sm:p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-overline whitespace-nowrap',
                      action.tone,
                    )}
                  >
                    <Shield className="size-3" aria-hidden="true" />
                    {action.label}
                  </span>
                  <span className="text-caption text-foreground-muted">
                    <DateTime
                      value={log.createdAt}
                      timeZone={LIVE_TIME_ZONE}
                      variant="precise"
                    />
                  </span>
                </div>
                <KeyValueGrid
                  columns={2}
                  items={[
                    { label: 'By', value: adminName(log) },
                    ...(log.targetUserId
                      ? [
                          {
                            label: 'Who',
                            value: <PersonById userId={log.targetUserId} />,
                          },
                        ]
                      : []),
                    {
                      label: 'Reason',
                      value: (
                        <span className="wrap-anywhere whitespace-pre-wrap">
                          {log.reason?.trim() || '—'}
                        </span>
                      ),
                    },
                    ...(log.adminNotes?.trim()
                      ? [
                          {
                            label: 'Admin notes',
                            value: (
                              <span className="wrap-anywhere whitespace-pre-wrap">
                                {log.adminNotes.trim()}
                              </span>
                            ),
                          },
                        ]
                      : []),
                    ...(used.length > 0
                      ? [{ label: 'Settings used', value: used.join(' · ') }]
                      : []),
                  ]}
                />
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
