import { DateTime } from '@/components/display'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import { isManualMethod, type TopUpRequest } from '@/types/wallet'

import { formatDiamondAmount, formatWholeCurrency } from './money'

/**
 * How one top-up row is drawn (plan.md §4, phase W2).
 */

/**
 * Who paid.
 *
 * ⚠️ **Four fallbacks deep, and every one is reachable.** The guide shows
 * `user.profile.displayName` populated on every row; nothing has ever been
 * seen on the wire (plan.md O11), and a store purchase carries no phone at
 * all. Order: display name, username, phone, then the payer's own id — the
 * last thing still traceable to a human.
 */
export function PayerCell({ record }: { record: TopUpRequest }) {
  const profile = record.user?.profile
  const name = profile?.displayName?.trim()
  const username = profile?.username?.trim()
  const phone = record.user?.phone?.trim()

  const primary = name || username || phone || null

  return (
    <span className="flex min-w-[11rem] flex-col gap-0.5">
      {primary ? (
        <span
          className="line-clamp-2 min-w-0 font-medium wrap-anywhere"
          title={primary}
        >
          {primary}
        </span>
      ) : (
        /*
         * ⚠️ Not an em-dash. "No account details" is a fact about the payment
         * an operator is about to approve, and a blank cell reads as a
         * rendering bug rather than as information.
         */
        <span className="font-medium text-foreground-muted italic">
          No account details
        </span>
      )}

      {username && name ? (
        <span className="truncate text-caption text-foreground-muted">@{username}</span>
      ) : null}

      {!primary ? (
        <span className="truncate font-mono text-caption text-foreground-muted">
          {record.userId ?? record.id}
        </span>
      ) : null}
    </span>
  )
}

/**
 * How the money arrived, and whether a human has anything to verify.
 *
 * ⚠️ **The two kinds are visually distinct, and that is the point of this
 * cell.** The guide frames the whole queue as manual mobile-money review, but
 * the server's enum carries `STRIPE`, `GOOGLE_PLAY` and `APPLE_IAP` (plan.md
 * O7). Nobody reconciles an App Store receipt against a bank statement — those
 * rows settled through a gateway before they got here. An operator who cannot
 * tell the two apart at a glance will go looking for a sender number that was
 * never going to exist.
 */
export function MethodCell({ record }: { record: TopUpRequest }) {
  const method = record.method?.trim()
  if (!method) return <span className="text-foreground-muted">—</span>

  const manual = isManualMethod(method)

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <Badge
        className={cn(
          'w-fit',
          manual
            ? 'bg-warning-soft text-warning-foreground'
            : 'bg-neutral-soft text-neutral-foreground',
        )}
      >
        {method.replace(/_/g, ' ')}
      </Badge>
      <span className="truncate text-caption text-foreground-muted">
        {manual ? 'Verify by hand' : 'Settled by gateway'}
      </span>
    </span>
  )
}

/**
 * What was paid and what it buys.
 *
 * ⚠️ `amountBdt` is **whole taka**, not paisa — see `money.ts` for why
 * `formatMoney` cannot be used here.
 */
export function AmountCell({ record }: { record: TopUpRequest }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="tabular font-medium">
        {formatWholeCurrency(record.amountBdt, 'BDT')}
      </span>
      <span className="truncate tabular text-caption text-foreground-muted">
        {formatDiamondAmount(record.diamonds)} diamonds
      </span>
    </span>
  )
}

/**
 * The payer's own reference, and the thing an operator matches against a bank
 * statement.
 *
 * ⚠️ `wrap-anywhere` and a line clamp: the hostile fixture carries a
 * 420-character unbroken id, and one row must not be able to widen the table.
 */
export function ReferenceCell({ record }: { record: TopUpRequest }) {
  const trx = record.transactionId?.trim()
  const sender = record.senderNumber?.trim()

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      {trx ? (
        <span className="line-clamp-2 font-mono text-caption wrap-anywhere" title={trx}>
          {trx}
        </span>
      ) : (
        <span className="text-foreground-muted">—</span>
      )}
      {sender ? (
        <span className="truncate text-caption text-foreground-muted">{sender}</span>
      ) : null}
    </span>
  )
}

const STATUS_TONE: Readonly<Record<string, string>> = {
  PENDING: 'bg-warning-soft text-warning-foreground',
  APPROVED: 'bg-success-soft text-success-foreground',
  REJECTED: 'bg-danger-soft text-danger-foreground',
  CANCELLED: 'bg-neutral-soft text-neutral-foreground',
}

/**
 * ⚠️ An unknown status renders as itself, in the neutral tone, rather than
 * being hidden or mapped to a guess. `CANCELLED` exists here and nowhere in
 * the host enum; the next one will arrive the same way.
 */
export function StatusCell({ record }: { record: TopUpRequest }) {
  const status = record.status?.trim()
  if (!status) return <span className="text-foreground-muted">—</span>

  return (
    <Badge
      className={cn(
        'w-fit',
        STATUS_TONE[status] ?? 'bg-neutral-soft text-neutral-foreground',
      )}
    >
      {status}
    </Badge>
  )
}

/** When it was submitted, and when it was decided. */
export function SubmittedCell({ record }: { record: TopUpRequest }) {
  return (
    <span className="flex flex-col gap-0.5">
      {record.createdAt ? (
        <DateTime value={record.createdAt} relative />
      ) : (
        <span className="text-foreground-muted">—</span>
      )}
      {record.reviewedAt ? (
        <span className="truncate text-caption text-foreground-muted">
          Reviewed <DateTime value={record.reviewedAt} relative />
        </span>
      ) : null}
    </span>
  )
}
