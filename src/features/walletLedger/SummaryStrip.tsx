import { Skeleton } from '@/components/ui/skeleton'
import { formatCount, formatDiamonds } from '@/lib/format'
import {
  summaryFor,
  type WalletDirection,
  type WalletSummary,
} from '@/types/walletTransactions'

/**
 * Three figures for the current view — `summary` on the list response
 * (plan.md T2).
 *
 * Unlike the feedback and host strips, these **do** follow the filters: the
 * server scopes `summary` to the query, so the heading says "This view".
 *
 * ⚠️ **Except `direction`** (plan.md B3): the server's Diamond totals ignore
 * it. `summaryFor` corrects that — filtering to debits shows the debit total
 * and zero credits, which is what the rows below contain.
 */
export function SummaryStrip({
  summary,
  direction,
  filtered,
  loading,
}: {
  summary: WalletSummary | undefined
  direction: WalletDirection | undefined
  filtered: boolean
  loading: boolean
}) {
  const shown = summary ? summaryFor(summary, direction) : undefined
  const tiles = [
    {
      label: 'Transactions',
      value: shown ? formatCount(shown.totalTransactions) : null,
      tone: 'text-foreground',
    },
    {
      label: 'Credited',
      value: shown ? `+${formatDiamonds(shown.totalCreditDiamonds)}` : null,
      tone: 'text-success-foreground',
    },
    {
      label: 'Debited',
      value: shown ? `−${formatDiamonds(shown.totalDebitDiamonds)}` : null,
      tone: 'text-danger-foreground',
    },
  ]

  return (
    <section
      className="rounded-md border border-border bg-surface p-3"
      aria-labelledby="wallet-summary-heading"
    >
      <h2
        id="wallet-summary-heading"
        className="mb-2 text-overline text-foreground-subtle uppercase"
      >
        {filtered ? 'This view' : 'All wallets, all time'}
      </h2>
      {/* Three across at every width: stacked, they push the rows off a phone screen. */}
      <dl className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="min-w-0 rounded-md bg-surface-muted px-2 py-2 sm:px-3"
          >
            <dt className="text-caption text-foreground-muted">{tile.label}</dt>
            <dd
              className={`tabular text-h4 font-semibold break-words sm:text-h3 ${tile.tone}`}
            >
              {loading || tile.value === null ? (
                <Skeleton className="mt-1 h-6 w-20" />
              ) : (
                <>
                  {tile.value}
                  {tile.label === 'Transactions' ? null : (
                    <span className="block text-caption font-normal text-foreground-muted">
                      diamonds
                    </span>
                  )}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
