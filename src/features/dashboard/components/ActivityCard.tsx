import { lazy, Suspense, useState, type CSSProperties } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { tabsListVariants } from '@/components/ui/tabs'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import { DASHBOARD_TIMEFRAMES, type TrendPoint } from '@/types/dashboard'

import { useDashboardTrends, useRateLimitToast } from '../useDashboard'
import { useDashboardRange } from '../useDashboardRange'
import {
  isQuiet,
  pointLabel,
  RANGE_LABELS,
  SERIES,
  summarise,
  type SeriesKey,
} from './activity'
import { DashboardSection } from './DashboardSection'
import { describeProblem } from './errorText'

const ActivityChart = lazy(() => import('./ActivityChart'))

/**
 * Activity over time (plan.md DB3): sign-ups, calls and active sessions from
 * `GET /admin/dashboard/trends`, for 24h / 7d / 30d.
 *
 * - The range lives in the URL (D7). Switching keeps the old chart, dimmed,
 *   until the new one arrives.
 * - Each series toggle also shows its figure for the period. At least one
 *   series stays on, so the chart is never empty by accident.
 * - The chart is decoration for sighted users; a visually hidden table
 *   carries the same numbers (D6).
 */
export function ActivityCard({
  className,
  style,
}: {
  className?: string | undefined
  style?: CSSProperties | undefined
}) {
  const [range, setRange] = useDashboardRange()
  const trends = useDashboardTrends(range)
  useRateLimitToast(trends.error)
  const problem =
    trends.isError && !trends.data ? describeProblem(trends.error, 'activity') : null
  const [visible, setVisible] = useState<ReadonlySet<SeriesKey>>(
    () => new Set(SERIES.map((s) => s.key)),
  )

  const points = trends.data?.points ?? []
  const summary = summarise(points)
  const quiet = trends.data ? isQuiet(points) : false
  /* `keepPreviousData` shows the last range while the new one loads. */
  const switching = trends.isPlaceholderData

  function toggle(key: SeriesKey) {
    setVisible((current) => {
      if (current.has(key) && current.size === 1) return current
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <DashboardSection
      title="Activity"
      description={RANGE_LABELS[range]}
      className={className}
      style={style}
      loading={trends.isPending}
      skeleton={<ActivitySkeleton />}
      error={problem?.message}
      errorTone={problem?.tone}
      onRetry={problem?.retry ? () => void trends.refetch() : undefined}
      action={
        <div role="group" aria-label="Time range" className={tabsListVariants()}>
          {DASHBOARD_TIMEFRAMES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              title={RANGE_LABELS[value]}
              onClick={() => setRange(value)}
              className={cn(
                'inline-flex h-full items-center rounded-md px-2.5 text-body font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                range === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-foreground/60 hover:text-foreground',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex h-full flex-col gap-4" aria-busy={switching || undefined}>
        <div
          role="group"
          aria-label="Series shown"
          className="grid gap-2 sm:grid-cols-3"
        >
          {SERIES.map((s) => {
            const on = visible.has(s.key)
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(s.key)}
                className={cn(
                  'flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:block sm:py-2',
                  on
                    ? 'border-border bg-card hover:bg-surface-sunken'
                    : 'border-dashed border-border bg-transparent opacity-60 hover:opacity-100',
                )}
              >
                <span className="flex items-center gap-1.5 text-caption text-foreground-muted">
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      on ? s.dot : 'bg-neutral',
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="flex flex-wrap items-baseline justify-end gap-x-1.5 sm:mt-0.5 sm:justify-start">
                  <span className="text-lg font-semibold text-foreground tabular-nums sm:text-xl">
                    {formatCount(summary[s.key].value)}
                  </span>
                  <span className="text-caption text-foreground-muted">
                    {summary[s.key].caption}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div
          className={cn(
            'relative h-72 min-h-72 flex-1 transition-opacity sm:h-80',
            switching && 'opacity-60',
          )}
        >
          <Suspense fallback={<Skeleton className="size-full" />}>
            <ActivityChart points={points} timeframe={range} visible={visible} />
          </Suspense>
          {quiet ? (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-body text-foreground-muted">
              <span className="rounded-full border border-border bg-card px-3 py-1 shadow-sm">
                No activity in this period
              </span>
            </p>
          ) : null}
        </div>

        <ActivityTable points={points} range={range} />
      </div>
    </DashboardSection>
  )
}

function ActivityTable({
  points,
  range,
}: {
  points: readonly TrendPoint[]
  range: (typeof DASHBOARD_TIMEFRAMES)[number]
}) {
  return (
    /* `sr-only` cannot shrink a table (tables grow to their content), so the
     * hiding box is a wrapper. */
    <div className="sr-only">
      <table>
        <caption>Activity, {RANGE_LABELS[range].toLowerCase()}</caption>
        <thead>
          <tr>
            <th scope="col">{range === '24h' ? 'Hour' : 'Day'}</th>
            <th scope="col">Sign-ups</th>
            <th scope="col">Calls</th>
            <th scope="col">Call minutes</th>
            <th scope="col">Active sessions</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.at}>
              <th scope="row">{pointLabel(p.at, range)}</th>
              <td>{formatCount(p.signups)}</td>
              <td>{formatCount(p.calls)}</td>
              <td>{formatCount(p.callMinutes)}</td>
              <td>{formatCount(p.activeSessions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid gap-2 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-72 sm:h-80" />
    </div>
  )
}
