import { useNavigate } from 'react-router'

import { ROUTES } from '@/app/routes'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import type { HostApplicationStats } from '@/types/hosts'

import { ANY } from './listParams'

/**
 * The six counters — `GET /admin/live/host-applications/stats` (plan.md §4.4).
 *
 * ⚠️ **Local to this feature, not the announcements `StatsStrip` generalised.**
 * That one is bound to its own stats shape and its own tile semantics
 * (filterable status vs. unfilterable reach metrics), and bending it to fit a
 * second module with a *different* split would have made one component serve
 * two meanings badly. Logged as duplication on purpose rather than hidden
 * behind a premature abstraction.
 *
 * ⚠️ **The strip spans two screens, which is the thing to get right here.**
 * Four of the six counters describe applications and can narrow the queue
 * below. The other two — `activeHostsCount` and `suspendedHostsCount` —
 * describe the **roster**, a different route on a different page. A tile that
 * filtered this queue by them would promise an answer the list route cannot
 * give, so they navigate to `/hosts` instead and are visually separated to say
 * so before they are clicked.
 *
 * ⚠️ **The numbers are platform-wide and ignore every filter.** The stats route
 * takes no query parameters at all. The heading says so, because a strip that
 * appeared to respond to the filter bar while reporting global counts is the
 * more misleading design.
 */

export interface StatsStripProps {
  stats: HostApplicationStats | undefined
  loading?: boolean
  /** Status filter currently applied, so the matching tile reads pressed. */
  activeStatus?: string | undefined
  onSelectStatus: (status: string) => void
  className?: string
}

interface Tile {
  readonly id: string
  readonly label: string
  readonly count: number | undefined
  readonly dot: string
}

export function StatsStrip({
  stats,
  loading = false,
  activeStatus,
  onSelectStatus,
  className,
}: StatsStripProps) {
  const navigate = useNavigate()

  /** The four that genuinely narrow the queue below. */
  const queueTiles: Tile[] = [
    {
      id: ANY,
      label: 'All applications',
      count: stats?.totalApplications,
      dot: 'bg-neutral-foreground',
    },
    {
      id: 'PENDING',
      label: 'Pending review',
      count: stats?.pendingCount,
      dot: 'bg-warning',
    },
    {
      id: 'APPROVED',
      label: 'Approved',
      count: stats?.approvedCount,
      dot: 'bg-success',
    },
    {
      id: 'REJECTED',
      label: 'Rejected',
      count: stats?.rejectedCount,
      dot: 'bg-danger',
    },
  ]

  /** The two that belong to the roster, not to this queue. */
  const rosterTiles: Tile[] = [
    {
      id: 'ACTIVE',
      label: 'Active live hosts',
      count: stats?.activeHostsCount,
      dot: 'bg-info',
    },
    {
      id: 'SUSPENDED',
      label: 'Suspended or banned',
      count: stats?.suspendedHostsCount,
      dot: 'bg-danger',
    },
  ]

  if (loading) {
    return (
      <div
        className={cn('flex gap-3 overflow-x-auto pb-1', className)}
        aria-label="Loading platform totals"
        role="status"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-[4.5rem] w-40 shrink-0 rounded-md" />
        ))}
      </div>
    )
  }

  if (!stats) return null

  return (
    <section aria-label="All host applications" className={cn('space-y-2', className)}>
      <p className="text-caption text-foreground-muted">
        Platform totals, unaffected by the filters below.
      </p>

      {/*
       * Horizontally scrollable below `md` by design — the strip scrolls
       * itself rather than the page, which `expectNoSidewaysScroll` allows and
       * every other stats strip in this panel does.
       */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {queueTiles.map((tile) => {
          const pressed = (activeStatus ?? ANY) === tile.id

          return (
            <button
              key={tile.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => onSelectStatus(tile.id)}
              className={cn(
                'min-w-40 shrink-0 rounded-md border px-4 py-3 text-left transition-colors',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                pressed
                  ? 'border-primary bg-primary-soft'
                  : 'border-border bg-surface hover:border-foreground-muted',
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn('size-2 shrink-0 rounded-full', tile.dot)}
                  aria-hidden="true"
                />
                <span className="text-overline text-foreground-muted">
                  {tile.label}
                </span>
              </span>
              <span className="mt-1 block tabular text-h4">
                {tile.count === undefined ? '—' : formatCount(tile.count)}
              </span>
            </button>
          )
        })}

        {/*
         * ⚠️ Separated by a rule, and they navigate rather than filter.
         *
         * These two count hosts, and the queue beside them lists applications.
         * Making all six look alike would promise that clicking "Active live
         * hosts" narrows the table below, which the list route cannot do.
         */}
        <div className="w-px shrink-0 self-stretch bg-border" aria-hidden="true" />

        {rosterTiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() => void navigate(`${ROUTES.hosts}?status=${tile.id}`)}
            className={cn(
              'min-w-40 shrink-0 rounded-md border border-dashed border-border bg-surface px-4 py-3 text-left transition-colors',
              'outline-none hover:border-foreground-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn('size-2 shrink-0 rounded-full', tile.dot)}
                aria-hidden="true"
              />
              <span className="text-overline text-foreground-muted">{tile.label}</span>
            </span>
            <span className="mt-1 block tabular text-h4">
              {tile.count === undefined ? '—' : formatCount(tile.count)}
            </span>
            <span className="mt-0.5 block text-caption text-foreground-muted">
              Opens the host roster
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
