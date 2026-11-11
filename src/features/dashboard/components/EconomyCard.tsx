import { ArrowRight } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'

import { ROUTES } from '@/app/routes'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBdt } from '@/features/withdrawals/labels'
import { formatCount } from '@/lib/format'

import { useEconomyRates } from '../useDashboard'
import { DashboardSection } from './DashboardSection'
import { describeProblem } from './errorText'
import { bpsLabel } from './helpers'

/**
 * The economy at a glance (plan.md DB4), from `GET /admin/economy/rates`:
 * how a gift is split between host and platform, what a host is paid per 100
 * diamonds, and the withdrawal rules. Read-only; the link opens the settings
 * tab where they are changed.
 *
 * Total circulating diamonds is not shown: no endpoint returns it (O2).
 */
export function EconomyCard({
  className,
  style,
}: {
  className?: string | undefined
  style?: CSSProperties | undefined
}) {
  const rates = useEconomyRates()
  const r = rates.data
  const problem =
    rates.isError && !r ? describeProblem(rates.error, 'the economy rates') : null

  return (
    <DashboardSection
      title="Economy"
      description={
        r
          ? `Rates v${r.version}, in force since ${new Date(
              r.effectiveFrom,
            ).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}`
          : undefined
      }
      loading={rates.isPending}
      error={problem?.message}
      errorTone={problem?.tone}
      onRetry={problem?.retry ? () => void rates.refetch() : undefined}
      skeleton={
        <div className="space-y-3" aria-hidden="true">
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      }
      className={className}
      style={style}
    >
      {r ? (
        <div className="flex h-full flex-col gap-4">
          <div className="space-y-2">
            <p className="text-caption text-foreground-muted">Each gift is split</p>
            <div
              role="img"
              aria-label={`Gift split: host ${bpsLabel(r.giftHostBps)}, platform ${bpsLabel(
                r.giftPlatformBps,
              )}`}
              className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-sunken"
            >
              <span
                className="h-full bg-primary"
                style={{ width: `${r.giftHostBps / 100}%` }}
              />
              <span
                className="h-full bg-accent"
                style={{ width: `${r.giftPlatformBps / 100}%` }}
              />
            </div>
            <div className="flex justify-between text-caption" aria-hidden="true">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" />
                Host{' '}
                <strong className="text-foreground">{bpsLabel(r.giftHostBps)}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-accent" />
                Platform{' '}
                <strong className="text-foreground">
                  {bpsLabel(r.giftPlatformBps)}
                </strong>
              </span>
            </div>
          </div>

          <dl className="divide-y divide-border text-body">
            <Fact
              label="Host payout"
              value={`${formatBdt(r.payoutRateMinorPer100 / 100)} per 100 diamonds`}
            />
            <Fact
              label="Withdrawal fee"
              value={
                r.withdrawFeeFlatMinor > 0
                  ? `${bpsLabel(r.withdrawFeeBps)} + ${formatBdt(r.withdrawFeeFlatMinor / 100)}`
                  : bpsLabel(r.withdrawFeeBps)
              }
            />
            <Fact
              label="Withdrawal limits"
              value={`${formatCount(r.minWithdrawDiamond)}–${formatCount(
                r.maxWithdrawDiamond,
              )} diamonds`}
            />
          </dl>

          <Link
            to={ROUTES.settingsEconomy}
            className="mt-auto inline-flex items-center gap-1 self-start rounded-sm text-caption font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Economy settings <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </DashboardSection>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="text-right font-medium text-foreground tabular-nums">{value}</dd>
    </div>
  )
}
