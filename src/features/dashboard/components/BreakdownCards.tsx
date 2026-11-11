import type { CSSProperties } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { formatCount } from '@/lib/format'
import type { DashboardSnapshot } from '@/types/dashboard'

import { DashboardSection } from './DashboardSection'
import { ProgressRow, type BarTone } from './ProgressRow'

/**
 * Who the users are (plan.md DB4): status, roles and account types from the
 * snapshot's `breakdowns`, as labelled bars.
 *
 * ⚠️ **The groups do not always add up to the user total.** On staging
 * (2026-11-11) status sums to 32 and roles to 32 against 33 users — one
 * account sits in a state the breakdown does not list. Bars are therefore
 * sized against the real total, and the gap is shown as its own row rather than
 * hidden by stretching the listed groups to 100%.
 */

type Breakdowns = DashboardSnapshot['breakdowns']

interface Row {
  readonly label: string
  readonly count: number
  readonly tone: BarTone
}

function withGap(rows: Row[], total: number, gapLabel: string): Row[] {
  const listed = rows.reduce((sum, r) => sum + r.count, 0)
  const gap = total - listed
  return gap > 0 ? [...rows, { label: gapLabel, count: gap, tone: 'neutral' }] : rows
}

/**
 * `gapLabel` names the accounts the breakdown leaves out. For status it is
 * "Banned or not listed": the breakdown has no banned bucket, so every banned
 * account must be in the gap (staging 2026-11-11: exactly one, BANNED), though
 * the gap may hold others too (plan.md O7).
 */
function Rows({
  rows,
  total,
  gapLabel = 'Not listed',
}: {
  rows: Row[]
  total: number
  gapLabel?: string
}) {
  return (
    <div className="space-y-3.5">
      {withGap(rows, total, gapLabel).map((r) => (
        <ProgressRow
          key={r.label}
          label={r.label}
          count={r.count}
          total={total}
          tone={r.tone}
        />
      ))}
    </div>
  )
}

function RowsSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  )
}

interface CardProps {
  breakdowns: Breakdowns | undefined
  totalUsers: number | undefined
  loading: boolean
  /** The snapshot failed with nothing to show (DB5); the page banner has Retry. */
  unavailable?: boolean | undefined
  className?: string | undefined
  style?: CSSProperties | undefined
}

export function StatusBreakdownCard({
  breakdowns,
  totalUsers,
  loading,
  unavailable = false,
  className,
  style,
}: CardProps) {
  const ready = breakdowns && totalUsers !== undefined
  return (
    <DashboardSection
      title="Users by status"
      error={unavailable ? 'Not available right now.' : null}
      errorTone="muted"
      description={ready ? `${formatCount(totalUsers)} accounts in all` : undefined}
      loading={loading || !ready}
      skeleton={<RowsSkeleton count={4} />}
      className={className}
      style={style}
    >
      {ready ? (
        <Rows
          gapLabel="Banned or not listed"
          total={totalUsers}
          rows={[
            { label: 'Active', count: breakdowns.status.active, tone: 'success' },
            {
              label: 'Waiting for verification',
              count: breakdowns.status.pendingVerification,
              tone: 'warning',
            },
            { label: 'Suspended', count: breakdowns.status.suspended, tone: 'danger' },
            { label: 'Inactive', count: breakdowns.status.inactive, tone: 'neutral' },
          ]}
        />
      ) : null}
    </DashboardSection>
  )
}

export function RolesBreakdownCard({
  breakdowns,
  totalUsers,
  loading,
  unavailable = false,
  className,
  style,
}: CardProps) {
  const ready = breakdowns && totalUsers !== undefined
  return (
    <DashboardSection
      title="Roles and account types"
      error={unavailable ? 'Not available right now.' : null}
      errorTone="muted"
      loading={loading || !ready}
      skeleton={<RowsSkeleton count={5} />}
      className={className}
      style={style}
    >
      {ready ? (
        <div className="space-y-5">
          <div className="space-y-3">
            <h3 className="text-overline text-foreground-muted uppercase">Roles</h3>
            <Rows
              total={totalUsers}
              rows={[
                { label: 'Users', count: breakdowns.roles.user, tone: 'primary' },
                {
                  label: 'Moderators',
                  count: breakdowns.roles.moderator,
                  tone: 'accent',
                },
                { label: 'Admins', count: breakdowns.roles.admin, tone: 'locked' },
              ]}
            />
          </div>
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-overline text-foreground-muted uppercase">
              Account types
            </h3>
            <Rows
              total={totalUsers}
              rows={[
                {
                  label: 'Personal',
                  count: breakdowns.accountTypes.personal,
                  tone: 'primary',
                },
                {
                  label: 'Business',
                  count: breakdowns.accountTypes.business,
                  tone: 'accent',
                },
              ]}
            />
          </div>
        </div>
      ) : null}
    </DashboardSection>
  )
}
