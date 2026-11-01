import { cn } from '@/lib/cn'
import { formatDiamonds } from '@/lib/format'
import { directionOf } from '@/types/walletTransactions'

/**
 * The signed amount.
 *
 * ⚠️ Credit / Debit / **Free** from the sign, never from `direction` — the
 * 23 free gifts arrive labelled `CREDIT` (plan.md B2). A free row says so in
 * words, since "0" beside a gift reads as a fault.
 */
export function EntryAmount({ amount }: { amount: number }) {
  const direction = directionOf({ amount })
  if (direction === 'FREE') {
    return (
      <span className="flex flex-col gap-0.5 whitespace-nowrap">
        <span className="tabular font-medium">{formatDiamonds(0)}</span>
        <span className="text-caption text-foreground-muted">Free</span>
      </span>
    )
  }
  const credit = direction === 'CREDIT'
  return (
    <span
      className={cn(
        'tabular font-medium whitespace-nowrap',
        credit ? 'text-success-foreground' : 'text-danger-foreground',
      )}
    >
      {credit ? '+' : '−'}
      {formatDiamonds(Math.abs(amount))}
      <span className="sr-only">
        {credit ? ' Diamonds credited' : ' Diamonds debited'}
      </span>
    </span>
  )
}
