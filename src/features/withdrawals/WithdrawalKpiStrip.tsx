import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/cn'
import { formatCount, formatPercent } from '@/lib/format'
import type { WithdrawalStats } from '@/types/withdrawals'

import { formatBdt } from './labels'
import type { WithdrawalTab } from './useWithdrawalParams'

/**
 * Four counters from `GET /admin/withdrawals/stats` (plan.md W1).
 *
 * Platform-wide and blind to the filters — the heading says so. A tile is a
 * button that opens its tab, because "how many are waiting" is usually
 * followed by "show me them".
 */
export function WithdrawalKpiStrip({
  stats,
  loading,
  failed,
  onOpen,
}: {
  stats: WithdrawalStats | undefined
  loading: boolean
  failed: boolean
  onOpen: (tab: WithdrawalTab) => void
}) {
  const s = stats
  const processed = s ? s.paid.count + s.rejected.count : 0
  const rejectionRate = s && processed > 0 ? s.rejected.count / processed : null

  const tiles: readonly {
    label: string
    tab: WithdrawalTab
    value: string | null
    detail: string | null
    /** A second caption line, so a tile never wraps mid-phrase. */
    note?: string | null
    urgent?: boolean
  }[] = [
    {
      label: 'Needs review',
      tab: 'PENDING',
      value: s ? formatCount(s.pending.count) : null,
      detail: s ? `${formatBdt(s.pending.amountBdt)} requested` : null,
      urgent: Boolean(s && s.pending.count > 0),
    },
    {
      label: 'Approved, not paid yet',
      tab: 'APPROVED',
      value: s ? formatCount(s.approved.count) : null,
      detail: s ? `${formatBdt(s.approved.amountBdt)} to send` : null,
    },
    {
      label: 'Paid out',
      tab: 'PAID',
      value: s ? formatBdt(s.paid.amountBdt) : null,
      detail: s ? `${formatCount(s.paid.count)} payouts` : null,
    },
    {
      label: 'Rejected',
      tab: 'REJECTED',
      value: s ? formatCount(s.rejected.count) : null,
      detail:
        s && rejectionRate !== null
          ? `${formatPercent(rejectionRate, { fractionDigits: 0 })} of reviewed`
          : null,
      note: s ? `${formatCount(s.cancelled.count)} cancelled by hosts` : null,
    },
  ]

  return (
    <section
      className="rounded-md border border-border bg-surface p-3"
      aria-labelledby="withdrawal-kpi-heading"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id="withdrawal-kpi-heading"
          className="text-overline text-foreground-subtle uppercase"
        >
          Platform-wide · all time
        </h2>
        {failed && !s ? (
          <p className="text-caption text-danger-foreground" role="status">
            The counters could not be loaded. They retry on their own.
          </p>
        ) : (
          <p className="text-caption text-foreground-muted">
            Not affected by the filters. Updates every 30 seconds.
          </p>
        )}
      </div>
      <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.label} className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(tile.tab)}
              className={cn(
                'flex h-full w-full min-w-0 flex-col rounded-md px-3 py-2 text-left transition-colors',
                tile.urgent
                  ? 'bg-warning-soft hover:bg-warning-soft/80'
                  : 'bg-surface-muted hover:bg-surface-muted/70',
              )}
              aria-label={`${tile.label}: ${tile.value ?? 'loading'}. Show these requests.`}
            >
              <span
                className={cn(
                  'text-caption',
                  tile.urgent ? 'text-warning-foreground' : 'text-foreground-muted',
                )}
              >
                {tile.label}
              </span>
              <span className="tabular text-h4 font-semibold break-words text-foreground sm:text-h3">
                {loading || tile.value === null ? (
                  failed ? (
                    <span className="text-foreground-subtle">—</span>
                  ) : (
                    <Skeleton className="mt-1 h-6 w-16" />
                  )
                ) : (
                  tile.value
                )}
              </span>
              {tile.detail ? (
                <span className="text-caption text-foreground-muted">
                  {tile.detail}
                </span>
              ) : null}
              {tile.note ? (
                <span className="text-caption text-foreground-muted">{tile.note}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
