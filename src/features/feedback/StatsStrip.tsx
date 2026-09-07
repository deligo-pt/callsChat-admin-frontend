import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import { resolveStatus, TONE_DOT_CLASSES } from '@/lib/status'
import { FEEDBACK_STATUS_VALUES, type FeedbackStats } from '@/types/feedback'

/**
 * The six status counts — `GET /admin/feedbacks/stats`
 * (feedback_management_plan.md §5.1).
 *
 * ⚠️ **These are global, and the label says so.** The stats route takes no
 * query parameters, so the numbers describe every ticket in the system
 * regardless of what the queue below is filtered to. A strip that appeared to
 * respond to the filter bar while actually reporting global counts would be
 * the more misleading design, so it is deliberately not wired to the filters
 * and is headed *"All tickets"*.
 *
 * The one place the strip and the list do connect is the direction that cannot
 * lie: each count is a button that **sets** the corresponding status filter.
 * Pressing "Pending" asks the server for pending tickets; it does not claim
 * that the number shown was the answer.
 */

export interface StatsStripProps {
  stats: FeedbackStats | undefined
  loading?: boolean
  /** The status filter currently applied, so the matching chip reads pressed. */
  activeStatus?: string | undefined
  /** Called with the status to apply, or `undefined` to clear it. */
  onSelectStatus: (status: string | undefined) => void
  className?: string
}

/** Which `FeedbackStats` key holds each status count. */
const STAT_KEY = {
  PENDING: 'pending',
  REVIEWING: 'reviewing',
  IN_PROGRESS: 'inProgress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  REOPENED: 'reopened',
} as const satisfies Record<
  (typeof FEEDBACK_STATUS_VALUES)[number],
  keyof FeedbackStats
>

export function StatsStrip({
  stats,
  loading = false,
  activeStatus,
  onSelectStatus,
  className,
}: StatsStripProps) {
  return (
    <section
      className={cn('rounded-md border border-border bg-surface p-3', className)}
      aria-labelledby="feedback-stats-heading"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="feedback-stats-heading"
          className="text-overline text-foreground-subtle uppercase"
        >
          All tickets
        </h2>
        {/*
         * The total is stated beside the heading rather than as a seventh
         * chip: it is not a status, and a chip for it would imply a filter
         * value that does not exist.
         */}
        {stats ? (
          <span className="text-caption text-foreground-muted">
            {formatCount(stats.total)} in total, across every filter
          </span>
        ) : null}
      </div>

      {/*
       * §6: horizontal scroll at 360 rather than a wrapped grid of six
       * quarter-width chips, a 3 × 2 grid at `md`, one row at `lg`. The
       * scroller is the element that scrolls — the page itself must not.
       */}
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 lg:grid-cols-6">
        {FEEDBACK_STATUS_VALUES.map((status) => {
          const { label, tone } = resolveStatus('feedback', status)
          const pressed = activeStatus === status
          const count = stats?.[STAT_KEY[status]]

          return (
            <li key={status} className="min-w-0 shrink-0 md:shrink">
              <button
                type="button"
                aria-pressed={pressed}
                onClick={() => onSelectStatus(pressed ? undefined : status)}
                className={cn(
                  'flex w-full min-w-[7.5rem] flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
                  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  pressed
                    ? 'border-primary bg-primary-soft'
                    : 'border-border bg-surface-muted hover:border-foreground-subtle',
                )}
              >
                {loading || count === undefined ? (
                  <Skeleton className="h-6 w-10" />
                ) : (
                  <span className="tabular text-h3">{formatCount(count)}</span>
                )}
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      TONE_DOT_CLASSES[tone],
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate text-caption text-foreground-muted">
                    {label}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
