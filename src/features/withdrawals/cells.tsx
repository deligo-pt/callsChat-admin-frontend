import { Landmark, Smartphone } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { ROUTES } from '@/app/routes'
import { DateTime, DiamondAmount, StatusBadge } from '@/components/display'
import { STOP_ROW_CLICK } from '@/components/wallet'
import {
  withdrawalHostName,
  type PaymentSnapshot,
  type Withdrawal,
  type WithdrawalStatus,
} from '@/types/withdrawals'

import {
  formatBdt,
  lastFour,
  methodLabel,
  processedByName,
  WITHDRAWAL_TIME_ZONE,
} from './labels'

/**
 * How a withdrawal is drawn (plan.md W1–W2). Times are Bangladesh time, as on
 * every other finance page.
 */

export function MethodIcon({ type }: { type: string | null | undefined }) {
  const Icon = type === 'BANK' ? Landmark : Smartphone
  return <Icon className="size-3.5 shrink-0" aria-hidden="true" />
}

export function HostCell({ row }: { row: Withdrawal }) {
  const { search } = useLocation()
  return (
    <span className="flex min-w-0 flex-col gap-0.5 lg:min-w-[11rem]">
      <Link
        to={ROUTES.withdrawal(row.id)}
        state={{ from: search }}
        className="font-medium wrap-anywhere text-primary hover:underline"
        {...STOP_ROW_CLICK}
      >
        {withdrawalHostName(row)}
      </Link>
      {row.user?.email ? (
        <span className="text-caption wrap-anywhere text-foreground-muted">
          {row.user.email}
        </span>
      ) : null}
    </span>
  )
}

export function AmountCell({ row }: { row: Withdrawal }) {
  return (
    <span className="flex flex-col items-start gap-0.5 tabular whitespace-nowrap lg:items-end">
      <span className="font-medium">{formatBdt(row.netAmountBdt)}</span>
      <DiamondAmount amount={row.amount} size="sm" className="text-foreground-muted" />
    </span>
  )
}

export function MethodCell({ snapshot }: { snapshot: PaymentSnapshot }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5">
        <MethodIcon type={snapshot.type} />
        {methodLabel(snapshot.type)}
      </span>
      <span className="tabular text-caption text-foreground-muted">
        {lastFour(snapshot.accountNumber ?? snapshot.accountNumberMasked)}
      </span>
    </span>
  )
}

export function StatusCell({ status }: { status: WithdrawalStatus }) {
  return <StatusBadge domain="withdrawal" value={status} />
}

export function RequestedCell({ row }: { row: Withdrawal }) {
  return <DateTime value={row.requestedAt} timeZone={WITHDRAWAL_TIME_ZONE} relative />
}

export function ProcessedByCell({ row }: { row: Withdrawal }) {
  const name = processedByName(row)
  return name ? (
    <span className="wrap-anywhere">{name}</span>
  ) : (
    <span className="text-foreground-subtle">—</span>
  )
}
