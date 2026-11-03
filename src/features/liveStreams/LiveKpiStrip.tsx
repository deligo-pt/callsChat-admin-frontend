import { Skeleton } from '@/components/ui/skeleton'
import { formatCount, formatDiamonds } from '@/lib/format'
import type { LiveAnalytics } from '@/types/liveRooms'

/**
 * Six platform counters — `GET /admin/live/rooms/analytics` (plan.md Live §5.1).
 *
 * ⚠️ **Platform-wide, and blind to the filters below.** The route takes no
 * parameters, so the heading says so: a strip that seemed to follow the filter
 * bar while reporting global numbers would be the misleading design.
 *
 * Refreshed every 30 s (`useLiveAnalytics`).
 */
export function LiveKpiStrip({
  analytics,
  loading,
  failed,
}: {
  analytics: LiveAnalytics | undefined
  loading: boolean
  failed: boolean
}) {
  const a = analytics
  const tiles: readonly {
    label: string
    value: string | null
    detail?: string | null
    diamonds?: boolean
  }[] = [
    {
      label: 'Live now',
      value: a ? formatCount(a.activeRoomsTotal) : null,
      detail: a
        ? `${formatCount(a.activeAudioRooms)} audio · ${formatCount(a.activeVideoRooms)} video`
        : null,
    },
    { label: 'Ended today', value: a ? formatCount(a.todayEndedRooms) : null },
    {
      label: 'Suspended hosts',
      value: a ? formatCount(a.suspendedHostsCount) : null,
    },
    {
      label: 'Moderation actions today',
      value: a ? formatCount(a.todayModerationActions) : null,
    },
    {
      label: 'Diamonds spent today',
      value: a ? formatDiamonds(a.todayDiamondsTurnover) : null,
      diamonds: true,
    },
    {
      label: 'Host earnings today',
      value: a ? formatDiamonds(a.todayHostEarningsDiamonds) : null,
      diamonds: true,
    },
  ]

  return (
    <section
      className="rounded-md border border-border bg-surface p-3"
      aria-labelledby="live-kpi-heading"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id="live-kpi-heading"
          className="text-overline text-foreground-subtle uppercase"
        >
          Platform-wide · today
        </h2>
        {failed && !a ? (
          <p className="text-caption text-danger-foreground" role="status">
            The live counters could not be loaded. They retry on their own.
          </p>
        ) : (
          <p className="text-caption text-foreground-muted">
            Not affected by the filters. Updates every 30 seconds.
          </p>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="min-w-0 rounded-md bg-surface-muted px-3 py-2"
          >
            <dt className="text-caption text-foreground-muted">{tile.label}</dt>
            <dd className="tabular text-h4 font-semibold break-words text-foreground sm:text-h3">
              {loading || tile.value === null ? (
                failed ? (
                  <span className="text-foreground-subtle">—</span>
                ) : (
                  <Skeleton className="mt-1 h-6 w-16" />
                )
              ) : (
                <>
                  {tile.value}
                  {tile.diamonds ? <span className="sr-only"> Diamonds</span> : null}
                </>
              )}
            </dd>
            {tile.detail ? (
              <dd className="text-caption text-foreground-muted">{tile.detail}</dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  )
}
