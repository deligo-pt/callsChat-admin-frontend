import {
  BadgeCheck,
  Banknote,
  ChevronRight,
  Gem,
  RotateCw,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'

import { ROUTES } from '@/app/routes'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBdt } from '@/features/withdrawals/labels'
import { useWithdrawalStats } from '@/features/withdrawals/useWithdrawals'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import type { DashboardSnapshot } from '@/types/dashboard'

import { useAttentionAccess } from '../access'
import { usePendingTopUpCount } from '../useDashboard'
import { DashboardSection } from './DashboardSection'
import { describeProblem, type SectionProblem } from './errorText'
import { IconBadge, type Tone } from './StatCard'

/**
 * "Needs attention" (plan.md DB4): every queue waiting on staff, one row each,
 * opening its own screen. Replaces the old withdrawals-only dashboard card.
 *
 * - Each row shows only to someone who may open that screen, and reads its own
 *   source, so one failing endpoint marks its own row and nothing else.
 * - Withdrawals keep the old card's wording ("Waiting for review", "Approved,
 *   not paid yet"); the second row appears only while money is due.
 * - Business verification and flagged users come from the snapshot; top-ups
 *   from a one-row `PENDING` page, whose `total` is the count.
 */

interface RowModel {
  readonly key: string
  readonly icon: LucideIcon
  readonly tone: Tone
  readonly label: string
  readonly detail: string | null
  readonly count: number | undefined
  /**
   * Whether the count calls for action. Defaults to "more than zero"; flagged
   * users follow the server's `flaggedRequiresAttention` instead.
   */
  readonly urgent?: boolean
  /** The screen the row opens; `null` while that screen does not exist yet. */
  readonly to: string | null
  readonly loading: boolean
  readonly problem: SectionProblem | null
  readonly onRetry?: () => void
}

export function NeedsAttentionCard({
  snapshot,
  snapshotLoading,
  snapshotError,
  className,
  style,
}: {
  snapshot: DashboardSnapshot | undefined
  snapshotLoading: boolean
  /**
   * Set when the snapshot failed with nothing to show. Its rows say so, without
   * a Retry of their own: the page banner above already offers one.
   */
  snapshotError?: unknown
  className?: string | undefined
  style?: CSSProperties | undefined
}) {
  const access = useAttentionAccess()
  const withdrawals = useWithdrawalStats()
  const topUps = usePendingTopUpCount(access.topUps)
  const w = withdrawals.data
  const snapshotProblem = snapshotError
    ? describeProblem(snapshotError, 'this figure')
    : null

  const rows: RowModel[] = []
  if (access.withdrawals) {
    rows.push({
      key: 'withdrawals-pending',
      icon: Banknote,
      tone: 'primary',
      label: 'Withdrawals',
      /* The wording shows at once; the amount joins it when the stats arrive. */
      detail: w
        ? `Waiting for review · ${formatBdt(w.pending.amountBdt)}`
        : 'Waiting for review',
      count: w?.pending.count,
      to: ROUTES.withdrawals,
      loading: withdrawals.isPending,
      problem:
        withdrawals.isError && !w
          ? describeProblem(withdrawals.error, 'withdrawals')
          : null,
      onRetry: () => void withdrawals.refetch(),
    })
    if (w && w.approved.count > 0) {
      rows.push({
        key: 'withdrawals-approved',
        icon: Banknote,
        tone: 'success',
        label: 'Withdrawals to pay',
        detail: `Approved, not paid yet · ${formatBdt(w.approved.amountBdt)}`,
        count: w.approved.count,
        to: ROUTES.withdrawalsFor({ status: 'APPROVED' }),
        loading: false,
        problem: null,
      })
    }
  }
  if (access.topUps) {
    rows.push({
      key: 'top-ups',
      icon: Gem,
      tone: 'accent',
      label: 'Top-up requests',
      detail: 'Waiting for approval',
      count: topUps.data,
      to: ROUTES.topUps,
      loading: topUps.isPending,
      problem:
        topUps.isError && topUps.data === undefined
          ? describeProblem(topUps.error, 'top-up requests')
          : null,
      onRetry: () => void topUps.refetch(),
    })
  }
  if (access.business) {
    rows.push({
      key: 'business',
      icon: BadgeCheck,
      tone: 'locked',
      label: 'Business verification',
      detail: snapshot
        ? `Waiting for review · ${formatCount(
            snapshot.businessOverview.verified,
          )} of ${formatCount(snapshot.businessOverview.total)} verified`
        : null,
      count: snapshot?.businessOverview.pendingVerificationQueue,
      to: ROUTES.verifications,
      loading: snapshotLoading,
      problem: snapshotProblem,
    })
  }
  if (access.flagged) {
    rows.push({
      key: 'flagged',
      icon: ShieldAlert,
      tone: 'danger',
      label: 'Flagged accounts',
      detail: snapshot
        ? snapshot.kpis.flaggedRequiresAttention
          ? /*
             * Neutral on purpose: the API does not define `flagged` (plan.md
             * O9). On staging it equals waiting-for-verification + suspended,
             * which is not necessarily moderator work.
             */
            'Not in good standing'
          : 'Nothing waiting'
        : null,
      count: snapshot?.kpis.flagged,
      urgent: snapshot?.kpis.flaggedRequiresAttention ?? false,
      /* The moderation screen is not built yet, so the row shows the count only. */
      to: null,
      loading: snapshotLoading,
      problem: snapshotProblem,
    })
  }

  const waiting = rows.reduce((sum, r) => sum + (isUrgent(r) ? (r.count ?? 0) : 0), 0)
  const settled = rows.every((r) => !r.loading)

  return (
    <DashboardSection
      title="Needs attention"
      description="Queues waiting on staff."
      className={className}
      style={style}
      action={
        settled ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-caption font-medium tabular-nums',
              waiting > 0
                ? 'bg-warning-soft text-warning-foreground'
                : 'bg-success-soft text-success-foreground',
            )}
          >
            {waiting > 0 ? `${formatCount(waiting)} waiting` : 'All clear'}
          </span>
        ) : null
      }
    >
      <ul className="-mx-2 space-y-1">
        {rows.map((row) => (
          <li key={row.key}>
            <AttentionRow row={row} />
          </li>
        ))}
      </ul>
    </DashboardSection>
  )
}

function isUrgent(row: RowModel): boolean {
  return row.urgent ?? (row.count ?? 0) > 0
}

function AttentionRow({ row }: { row: RowModel }) {
  const body = (
    <>
      <IconBadge icon={row.icon} tone={row.tone} className="size-9 [&_svg]:size-4" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-foreground">
          {row.label}
        </span>
        {row.problem ? (
          <span
            className={cn(
              'block text-caption',
              row.problem.tone === 'danger'
                ? 'text-danger-foreground'
                : 'text-foreground-muted',
            )}
          >
            {row.problem.short}
          </span>
        ) : row.detail ? (
          <span className="block truncate text-caption text-foreground-muted">
            {row.detail}
          </span>
        ) : row.loading ? (
          <Skeleton className="mt-1 h-3 w-32" />
        ) : null}
      </span>
    </>
  )

  if (row.problem) {
    return (
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        {body}
        {row.problem.retry && row.onRetry && !row.loading ? (
          <Button type="button" variant="outline" size="sm" onClick={row.onRetry}>
            <RotateCw /> Retry
          </Button>
        ) : null}
      </div>
    )
  }

  const badge =
    row.loading || row.count === undefined ? (
      <Skeleton className="h-6 w-8 rounded-full" />
    ) : (
      <span
        className={cn(
          'min-w-8 rounded-full px-2 py-0.5 text-center text-caption font-semibold tabular-nums',
          isUrgent(row)
            ? 'bg-warning-soft text-warning-foreground'
            : 'bg-neutral-soft text-neutral-foreground',
        )}
      >
        {formatCount(row.count)}
      </span>
    )

  if (row.to === null) {
    return (
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        {body}
        {badge}
        {/* Keeps the count lined up with the rows that have an arrow. */}
        <span className="size-4 shrink-0" aria-hidden="true" />
      </div>
    )
  }

  return (
    <Link
      to={row.to}
      className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {body}
      {badge}
      <ChevronRight
        className="size-4 shrink-0 text-foreground-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  )
}
