import { ArrowRight, Banknote } from 'lucide-react'
import { Link } from 'react-router'

import { ROUTES } from '@/app/routes'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'

import { formatBdt } from './labels'
import { useWithdrawalStats } from './useWithdrawals'

/**
 * The dashboard's withdrawal queue (plan.md W5): two live counts that open
 * their tab.
 *
 * ⚠️ **The only real figures on a page of sample ones.** The card says "Live"
 * in its title so the dashboard's "none of these numbers are real" notice is
 * not read as covering it — and it sits above that notice for the same reason.
 */
export function WithdrawalsDashboardCard() {
  const stats = useWithdrawalStats()
  const s = stats.data

  const rows = [
    {
      label: 'Waiting for review',
      to: ROUTES.withdrawals,
      count: s?.pending.count,
      detail: s ? `${formatBdt(s.pending.amountBdt)} requested` : null,
      urgent: Boolean(s && s.pending.count > 0),
    },
    {
      label: 'Approved, not paid yet',
      to: ROUTES.withdrawalsFor({ status: 'APPROVED' }),
      count: s?.approved.count,
      detail: s ? `${formatBdt(s.approved.amountBdt)} to send` : null,
      urgent: false,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="size-4 text-foreground-muted" aria-hidden="true" />
          Host withdrawals
          <span className="rounded-sm bg-success-soft px-1.5 py-0.5 text-overline text-success-foreground uppercase">
            Live
          </span>
        </CardTitle>
        <CardDescription>
          {stats.isError && !s
            ? 'The counts could not be loaded. They retry on their own.'
            : 'Real counts from the withdrawal queue, updated every 30 seconds.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.label} className="min-w-0">
              <Link
                to={row.to}
                className={cn(
                  'group flex items-center justify-between gap-3 rounded-md px-3 py-2 transition-colors',
                  row.urgent
                    ? 'bg-warning-soft hover:bg-warning-soft/80'
                    : 'bg-surface-muted hover:bg-surface-muted/70',
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      'text-caption',
                      row.urgent ? 'text-warning-foreground' : 'text-foreground-muted',
                    )}
                  >
                    {row.label}
                  </span>
                  <span className="tabular text-h3 font-semibold text-foreground">
                    {typeof row.count === 'number' ? (
                      formatCount(row.count)
                    ) : stats.isError ? (
                      <span className="text-foreground-subtle">—</span>
                    ) : (
                      <Skeleton className="mt-1 h-6 w-10" />
                    )}
                  </span>
                  {row.detail ? (
                    <span className="text-caption text-foreground-muted">
                      {row.detail}
                    </span>
                  ) : null}
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-foreground-subtle group-hover:text-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
