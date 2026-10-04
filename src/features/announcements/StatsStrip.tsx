import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/cn'
import { formatCompact, formatCount } from '@/lib/format'
import { resolveStatus, TONE_DOT_CLASSES } from '@/lib/status'
import type { AnnouncementStats } from '@/types/announcement'

/**
 * The five platform counters — `GET /admin/announcements/stats` (plan.md §5.1).
 *
 * ⚠️ **These are platform-wide, and the heading says so.** The stats route
 * takes no query parameters at all and ignores every filter, so the numbers
 * describe every announcement in the system regardless of what the queue below
 * is narrowed to. A strip that appeared to respond to the filter bar while
 * actually reporting global counts would be the more misleading design.
 *
 * ⚠️ **It is split in two, which the feedback strip did not need to be.** There
 * every one of the six counters was a status, so every tile could be a filter
 * button. Here only three of the five correspond to something the list route
 * can filter by; the other two are reach metrics with no filter behind them.
 * Making all five look alike would promise a filter that does not exist, so
 * they are rendered as two groups: buttons that set a filter, and figures that
 * only report.
 */

export interface StatsStripProps {
  stats: AnnouncementStats | undefined
  loading?: boolean
  /** Status filter currently applied, so the matching tile reads pressed. */
  activeStatus?: string | undefined
  /** Pinned filter currently applied — `'true'`, `'false'` or `'ALL'`. */
  activePinned?: string | undefined
  onSelectStatus: (status: string) => void
  onSelectPinned: (pinned: string) => void
  className?: string
}

export function StatsStrip({
  stats,
  loading = false,
  activeStatus,
  activePinned,
  onSelectStatus,
  onSelectPinned,
  className,
}: StatsStripProps) {
  const published = resolveStatus('announcement', 'PUBLISHED')
  const draft = resolveStatus('announcement', 'DRAFT')

  /**
   * The three facets that are genuinely filterable.
   *
   * Each tile's `onToggle` only ever *asks the server* for a narrowed list — it
   * never claims the number shown was the answer to that question. That is the
   * one direction a global counter and a filtered list can be connected without
   * lying.
   */
  const tiles = [
    {
      id: 'PUBLISHED',
      count: stats?.totalPublished,
      label: published.label,
      tone: published.tone,
      pressed: activeStatus === 'PUBLISHED',
      onToggle: () =>
        onSelectStatus(activeStatus === 'PUBLISHED' ? 'ALL' : 'PUBLISHED'),
    },
    {
      id: 'DRAFT',
      count: stats?.totalDrafts,
      label: draft.label,
      tone: draft.tone,
      pressed: activeStatus === 'DRAFT',
      onToggle: () => onSelectStatus(activeStatus === 'DRAFT' ? 'ALL' : 'DRAFT'),
    },
    {
      id: 'PINNED',
      count: stats?.totalPinned,
      label: 'Pinned',
      /*
       * `primary`, not a status tone. Pinned is not a lifecycle state — a
       * pinned announcement is also published — and borrowing a status colour
       * would put it on the same scale as the two beside it.
       */
      tone: 'primary' as const,
      pressed: activePinned === 'true',
      onToggle: () => onSelectPinned(activePinned === 'true' ? 'ALL' : 'true'),
    },
  ]

  return (
    <section
      className={cn('rounded-md border border-border bg-surface p-3', className)}
      aria-labelledby="announcement-stats-heading"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="announcement-stats-heading"
          className="text-overline text-foreground-subtle uppercase"
        >
          All announcements
        </h2>
        <span className="text-caption text-foreground-muted">
          Platform totals, unaffected by the filters below
        </span>
      </div>

      {/*
       * Horizontal scroll at 360 rather than a wrapped grid of narrow tiles,
       * three columns at `md`, five at `xl`. The scroller is the element that
       * scrolls — the page itself must not.
       */}
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 xl:grid-cols-5">
        {tiles.map((tile) => (
          <li key={tile.id} className="min-w-0 shrink-0 md:shrink">
            <button
              type="button"
              aria-pressed={tile.pressed}
              onClick={tile.onToggle}
              className={cn(
                'flex w-full min-w-[7.5rem] flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                tile.pressed
                  ? 'border-primary bg-primary-soft'
                  : 'border-border bg-surface-muted hover:border-foreground-subtle',
              )}
            >
              {loading || tile.count === undefined ? (
                <Skeleton className="h-6 w-10" />
              ) : (
                <span className="tabular text-h3">{formatCount(tile.count)}</span>
              )}
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    TONE_DOT_CLASSES[tile.tone],
                  )}
                  aria-hidden="true"
                />
                <span className="truncate text-caption text-foreground-muted">
                  {tile.label}
                </span>
              </span>
            </button>
          </li>
        ))}

        {/*
         * ⚠️ **The two reach figures, and they are not buttons.** There is no
         * `?minViews=` and no per-announcement breakdown endpoint (O10), so
         * nothing here can be clicked. Rendered as plain figures in the same
         * row so the group reads as one summary, but without a border, a
         * hover state or a pressed state — because there is nothing to press.
         */}
        {(
          [
            {
              id: 'impressions',
              count: stats?.totalImpressions,
              label: 'Views',
              /*
               * ⚠️ "Views", not "reads". `broadcast.md` §3.4 increments this on
               * every fetch of the detail route, so one person opening an
               * announcement four times counts four times.
               */
              hint: 'Total opens, including repeats by the same person',
            },
            {
              id: 'receipts',
              count: stats?.totalReadReceipts,
              label: 'Read receipts',
              /*
               * The other number, and the distinction matters: a receipt is
               * written once per user per announcement, so this is the closest
               * thing to a reader count the API offers — while `Views` is not.
               */
              hint: 'One per person per announcement',
            },
          ] as const
        ).map((figure) => (
          <li
            key={figure.id}
            className="flex min-w-[7.5rem] shrink-0 flex-col items-start gap-0.5 px-3 py-2 md:shrink"
          >
            {loading || figure.count === undefined ? (
              <Skeleton className="h-6 w-10" />
            ) : (
              <span className="tabular text-h3">{formatCompact(figure.count)}</span>
            )}
            <span className="truncate text-caption text-foreground-muted">
              {figure.label}
            </span>
            <span className="sr-only">{figure.hint}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
