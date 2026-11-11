import { formatCount } from '@/lib/format'
import type { DashboardTimeframe, TrendPoint } from '@/types/dashboard'

/**
 * Series, labels and totals for the activity chart (plan.md DB3). Kept out of
 * the component files so the lazily loaded chart and the card share them.
 */

export type SeriesKey = 'signups' | 'calls' | 'activeSessions'

export interface SeriesDef {
  readonly key: SeriesKey
  readonly label: string
  /** A design token, read by the SVG through `var()` (D3). */
  readonly color: string
  /** The same token as a Tailwind class, for the legend dot. */
  readonly dot: string
}

export const SERIES: readonly SeriesDef[] = [
  {
    key: 'signups',
    label: 'Sign-ups',
    color: 'var(--color-primary)',
    dot: 'bg-primary',
  },
  { key: 'calls', label: 'Calls', color: 'var(--color-success)', dot: 'bg-success' },
  {
    key: 'activeSessions',
    label: 'Active sessions',
    color: 'var(--color-accent)',
    dot: 'bg-accent',
  },
]

export const RANGE_LABELS: Record<DashboardTimeframe, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
}

/*
 * 24h buckets are real instants, so they show in the admin's local time.
 * 7d / 30d buckets are server calendar days (`YYYY-MM-DD`, read as UTC
 * midnight): formatting those in local time would print the day before for
 * anyone west of UTC, so they are formatted as the date the server meant.
 */
export function axisLabel(at: string, timeframe: DashboardTimeframe): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  return timeframe === '24h'
    ? date.toLocaleTimeString(undefined, { hour: 'numeric' })
    : date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
}

export function pointLabel(at: string, timeframe: DashboardTimeframe): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return at
  return timeframe === '24h'
    ? date.toLocaleString(undefined, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
}

export interface SeriesSummary {
  readonly value: number
  readonly caption: string
}

/**
 * The figure above each toggle. Sign-ups and calls add up over the period;
 * active sessions are a level at each moment, so adding them would count the
 * same person many times — the peak is the honest summary.
 */
export function summarise(
  points: readonly TrendPoint[],
): Record<SeriesKey, SeriesSummary> {
  let signups = 0
  let calls = 0
  let minutes = 0
  let peak = 0
  for (const p of points) {
    signups += p.signups
    calls += p.calls
    minutes += p.callMinutes
    peak = Math.max(peak, p.activeSessions)
  }
  return {
    signups: { value: signups, caption: 'in total' },
    calls: { value: calls, caption: `${formatCount(minutes)} min in total` },
    activeSessions: { value: peak, caption: 'at the peak' },
  }
}

export function isQuiet(points: readonly TrendPoint[]): boolean {
  return points.every((p) => p.signups === 0 && p.calls === 0 && p.activeSessions === 0)
}
