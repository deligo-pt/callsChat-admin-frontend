import { ArrowRight, Gem, Mic, PhoneCall, Radio, Users, Video } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'

import { ROUTES } from '@/app/routes'
import { Skeleton } from '@/components/ui/skeleton'
import { useLiveAnalytics } from '@/features/liveStreams/useLiveRooms'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import type { DashboardSnapshot } from '@/types/dashboard'

import { CountUp } from './CountUp'
import { DashboardSection, SectionError } from './DashboardSection'
import { describeProblem } from './errorText'
import { share } from './helpers'
import { IconBadge } from './StatCard'

/**
 * "Live now" (plan.md §3, DB2): who is connected, what calls are running, and
 * — for staff who can see live streaming — the live rooms.
 *
 * - Sessions and calls come from the snapshot's `liveTelemetry`.
 * - Live rooms come from `GET /admin/live/rooms/analytics` (§1.4), because the
 *   snapshot does not return `liveStreamingOverview` on staging (O1). That
 *   query already polls every 30s, the same pace as the snapshot.
 *
 * The card uses a container query, so its three blocks sit side by side when
 * the card is wide and stack when it is narrow (beside the chart, or a phone).
 */

type Telemetry = DashboardSnapshot['liveTelemetry']
type Platform = keyof Telemetry['activeSessionsByPlatform']

const PLATFORMS: { key: Platform; label: string; fill: string }[] = [
  { key: 'web', label: 'Web', fill: 'bg-primary' },
  { key: 'android', label: 'Android', fill: 'bg-success' },
  { key: 'ios', label: 'iOS', fill: 'bg-accent' },
  { key: 'desktop', label: 'Desktop', fill: 'bg-warning' },
]

export function LiveNowCard({
  telemetry,
  loading,
  canSeeLive,
  unavailable = false,
  className,
  style,
}: {
  telemetry: Telemetry | undefined
  loading: boolean
  canSeeLive: boolean
  /** The snapshot failed with nothing to show (DB5); the page banner has Retry. */
  unavailable?: boolean | undefined
  className?: string | undefined
  style?: CSSProperties | undefined
}) {
  return (
    <DashboardSection
      title="Live now"
      error={unavailable ? 'Not available right now.' : null}
      errorTone="muted"
      description="Connected right now. Refreshes every 30 seconds."
      loading={loading || !telemetry}
      skeleton={<LiveNowSkeleton withRooms={canSeeLive} />}
      className={cn('@container', className)}
      style={style}
    >
      {telemetry ? (
        <div
          className={cn(
            'grid gap-5 @2xl:gap-0 @2xl:divide-x @2xl:divide-border',
            canSeeLive ? '@2xl:grid-cols-3' : '@2xl:grid-cols-2',
          )}
        >
          <Block className="@2xl:pr-5">
            <SessionsBlock telemetry={telemetry} />
          </Block>
          <Block className="border-t border-border pt-5 @2xl:border-t-0 @2xl:px-5 @2xl:pt-0">
            <CallsBlock calls={telemetry.ongoingCalls} />
          </Block>
          {canSeeLive ? (
            <Block className="border-t border-border pt-5 @2xl:border-t-0 @2xl:pt-0 @2xl:pl-5">
              <RoomsBlock />
            </Block>
          ) : null}
        </div>
      ) : null}
    </DashboardSection>
  )
}

function Block({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-w-0 space-y-4', className)}>{children}</div>
}

function BlockHeading({
  icon,
  tone,
  label,
  value,
}: {
  icon: typeof Users
  tone: 'primary' | 'success' | 'accent'
  label: string
  value: number
}) {
  return (
    <div className="flex items-center gap-3">
      <IconBadge icon={icon} tone={tone} className="size-10" />
      <div className="min-w-0">
        <h3 className="text-caption font-medium text-foreground-muted">{label}</h3>
        <CountUp
          value={value}
          format={formatCount}
          className="text-2xl leading-tight font-semibold tracking-tight text-foreground"
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function SessionsBlock({ telemetry }: { telemetry: Telemetry }) {
  const byPlatform = telemetry.activeSessionsByPlatform
  /* The bar is split by the platform counts; their sum is what it divides. */
  const total = PLATFORMS.reduce((sum, p) => sum + byPlatform[p.key], 0)
  const summary =
    total === 0
      ? 'No sessions on any platform'
      : PLATFORMS.map((p) => `${p.label} ${formatCount(byPlatform[p.key])}`).join(', ')

  return (
    <>
      <BlockHeading
        icon={Users}
        tone="primary"
        label="Active sessions"
        value={telemetry.currentActiveSessions}
      />

      <div
        role="img"
        aria-label={`Sessions by platform: ${summary}`}
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-sunken"
      >
        {PLATFORMS.map((p) => {
          const ratio = share(byPlatform[p.key], total)
          return ratio > 0 ? (
            <span
              key={p.key}
              className={cn(
                'h-full animate-in duration-700 ease-out fade-in slide-in-from-left-[100%] motion-reduce:animate-none',
                p.fill,
              )}
              style={{ width: `${ratio * 100}%` }}
            />
          ) : null
        })}
      </div>

      <ul
        className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-caption"
        aria-hidden="true"
      >
        {PLATFORMS.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-foreground-muted">
              <span className={cn('size-2 shrink-0 rounded-full', p.fill)} />
              <span className="truncate">{p.label}</span>
            </span>
            <span className="font-medium text-foreground tabular-nums">
              {formatCount(byPlatform[p.key])}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

function CallsBlock({ calls }: { calls: Telemetry['ongoingCalls'] }) {
  return (
    <>
      <BlockHeading
        icon={PhoneCall}
        tone="success"
        label="Ongoing calls"
        value={calls.total}
      />
      <dl className="grid grid-cols-2 gap-3">
        <MiniStat label="One-to-one" value={calls.active1v1} />
        <MiniStat label="Group" value={calls.activeGroup} />
      </dl>
      {calls.total === 0 ? (
        <p className="text-caption text-foreground-muted">No calls in progress.</p>
      ) : null}
    </>
  )
}

function RoomsBlock() {
  const analytics = useLiveAnalytics()
  const data = analytics.data

  if (analytics.isPending) return <RoomsSkeleton />
  if (!data) {
    const problem = describeProblem(analytics.error, 'live rooms')
    return (
      <SectionError
        message={problem.message}
        tone={problem.tone}
        onRetry={problem.retry ? () => void analytics.refetch() : undefined}
      />
    )
  }

  return (
    <>
      <BlockHeading
        icon={Radio}
        tone="accent"
        label="Live rooms"
        value={data.activeRoomsTotal}
      />
      <dl className="grid grid-cols-2 gap-3">
        <MiniStat label="Audio" value={data.activeAudioRooms} icon={Mic} />
        <MiniStat label="Video" value={data.activeVideoRooms} icon={Video} />
        <MiniStat label="Ended today" value={data.todayEndedRooms} />
        <MiniStat
          label="Gifted today"
          value={data.todayDiamondsTurnover}
          unit="diamonds"
          icon={Gem}
        />
      </dl>
      <Link
        to={ROUTES.liveStreams}
        className="inline-flex items-center gap-1 rounded-sm text-caption font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Open live streams <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </>
  )
}

function MiniStat({
  label,
  value,
  unit,
  icon: Icon,
}: {
  label: string
  value: number
  /** Shown after the number, e.g. "4,500 diamonds", so a figure never stands bare. */
  unit?: string
  icon?: typeof Users
}) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-sunken px-3 py-2">
      <dt className="flex items-center gap-1 truncate text-caption text-foreground-muted">
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        {label}
      </dt>
      <dd className="text-body font-semibold text-foreground tabular-nums">
        {formatCount(value)}
        {unit ? (
          <>
            {' '}
            <span className="text-caption font-normal text-foreground-muted">
              {unit}
            </span>
          </>
        ) : null}
      </dd>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function RoomsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-12" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  )
}

function LiveNowSkeleton({ withRooms }: { withRooms: boolean }) {
  return (
    <div
      className={cn('grid gap-5', withRooms ? '@2xl:grid-cols-3' : '@2xl:grid-cols-2')}
      aria-hidden="true"
    >
      {[0, 1, ...(withRooms ? [2] : [])].map((i) => (
        <RoomsSkeleton key={i} />
      ))}
    </div>
  )
}
