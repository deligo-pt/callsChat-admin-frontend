import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'

import { isAppError } from '@/api/errors'
import { queryKeys } from '@/api/queryKeys'
import { fetchWalletTransactions, walletTransactionParams } from '@/api/wallet'
import { ROUTES } from '@/app/routes'
import { Pagination } from '@/components/data'
import { DateTime } from '@/components/display'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EntryAmount, EntrySource } from '@/components/wallet'
import { formatCount, formatDiamonds } from '@/lib/format'
import { LEDGER_TIME_ZONE, typeLabel } from '@/lib/walletLabels'
import type { WalletTransaction } from '@/types/walletTransactions'

/**
 * The account's wallet entries on its Finance tab — plan.md T4.
 *
 * Paged 5 (or 10) at a time, newest first, from the same `GET /admin/wallet/transactions?userId=` the
 * ledger uses, with "See all" into the ledger filtered to them. Keyed under
 * `walletTransactions.lists()`, so an adjustment (which invalidates that) puts
 * its new row here at once.
 *
 * Rendered only with `ledger.view`: the caller gates it, so a Moderator never
 * sends the request.
 *
 * ⚠️ A stacked list, not a table — the Finance tab is narrow on a phone, and
 * each entry already says where it came from in words.
 */

/** 5 by default, 10 on request (plan.md T4, revised). */
const HISTORY_SIZES = [5, 10] as const
const DEFAULT_HISTORY_SIZE = 5

/**
 * The history's page and size live in the URL (`walletPage`, `walletSize`)
 * beside `tab`, so a refresh — or "back" from an entry — lands on the same
 * page. Read strictly: anything else is the default.
 */
function readHistoryParams(params: URLSearchParams) {
  const size = Number(params.get('walletSize'))
  const page = Number(params.get('walletPage'))
  return {
    size: (HISTORY_SIZES as readonly number[]).includes(size)
      ? size
      : DEFAULT_HISTORY_SIZE,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/**
 * One entry. The type is a stretched link (its `::after` covers the row), so
 * the whole row opens the entry with no click handler; the source sits above
 * it so an admin's name stays its own link.
 */
function HistoryRow({
  row,
  back,
}: {
  row: WalletTransaction
  back: { backTo: string; backLabel: string }
}) {
  return (
    <li
      /*
       * Phone: type + time | amount, then the source underneath. From `sm`:
       * one line — type + time | source | amount, placed by column so the
       * DOM order (and so reading order) stays the same.
       */
      className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-3 py-3 hover:bg-surface-muted sm:grid-cols-[12rem_minmax(0,1fr)_9rem] sm:items-center sm:px-4"
    >
      <div className="min-w-0 space-y-0.5">
        <Link
          to={ROUTES.walletTransaction(row.id)}
          state={back}
          className="font-medium after:absolute after:inset-0 after:rounded-md hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {typeLabel(row.type)}
        </Link>
        <p className="text-caption text-foreground-muted">
          <DateTime value={row.createdAt} timeZone={LEDGER_TIME_ZONE} />
        </p>
      </div>

      <div className="text-right sm:col-start-3 sm:row-start-1">
        <EntryAmount amount={row.amount} />
        {typeof row.balanceAfter === 'number' ? (
          <p className="text-caption whitespace-nowrap text-foreground-muted">
            Balance {formatDiamonds(row.balanceAfter)}
          </p>
        ) : null}
      </div>

      <div className="relative z-10 col-span-2 w-fit max-w-full text-body sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <EntrySource row={row} />
      </div>
    </li>
  )
}

export function WalletHistory({
  userId,
  displayName,
}: {
  userId: string
  displayName: string
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { page, size } = readHistoryParams(searchParams)
  const query = { userId, page, limit: size }

  /* `replace`: paging the history is not a step for the Back button. */
  function setHistory(next: { page: number; size: number }) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        if (next.page > 1) params.set('walletPage', String(next.page))
        else params.delete('walletPage')
        if (next.size !== DEFAULT_HISTORY_SIZE)
          params.set('walletSize', String(next.size))
        else params.delete('walletSize')
        return params
      },
      { replace: true },
    )
  }
  const history = useQuery({
    queryKey: [...queryKeys.walletTransactions.lists(), walletTransactionParams(query)],
    queryFn: ({ signal }) => fetchWalletTransactions(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  const total = history.data?.pagination.total ?? 0
  const summary = history.data?.summary
  const back = {
    /* In this order — the entry page accepts exactly this shape. */
    backTo: `${ROUTES.user(userId)}?tab=finance${page > 1 ? `&walletPage=${page}` : ''}${
      size !== DEFAULT_HISTORY_SIZE ? `&walletSize=${size}` : ''
    }`,
    backLabel: displayName.trim() || 'Back to the account',
  }

  return (
    <section
      aria-labelledby="wallet-history-heading"
      className="min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-6"
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 id="wallet-history-heading" className="text-h4">
            Wallet history
          </h3>
          <p className="text-caption text-foreground-muted">
            Every diamond movement on this account — top-ups, adjustments, gifts and
            conversions. Newest first, Bangladesh time.
          </p>
        </div>
        {total > 0 ? (
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <Link to={ROUTES.walletLedger({ userId })}>
              See all {formatCount(total)} <ArrowRight />
            </Link>
          </Button>
        ) : null}
      </div>

      {/* Totals for this account: no direction filter, so the server's are exact (B3). */}
      {summary && total > 0 ? (
        <dl className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-caption text-foreground-muted">
          <div className="flex gap-1">
            <dt>Transactions</dt>
            <dd className="tabular font-medium text-foreground">
              {formatCount(summary.totalTransactions)}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>Credited</dt>
            <dd className="tabular font-medium text-success-foreground">
              +{formatDiamonds(summary.totalCreditDiamonds)}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>Debited</dt>
            <dd className="tabular font-medium text-danger-foreground">
              −{formatDiamonds(summary.totalDebitDiamonds)}
            </dd>
          </div>
        </dl>
      ) : null}

      {history.isPending ? (
        <ul aria-label="Loading wallet history" className="space-y-2">
          {[0, 1, 2].map((key) => (
            <li key={key}>
              <Skeleton className="h-14 w-full" />
            </li>
          ))}
        </ul>
      ) : history.isError ? (
        /* Contained: a ledger outage must not take the rest of Finance down. */
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-body">
            The wallet history could not be loaded.
            {isAppError(history.error) ? ` ${history.error.message}` : ''}
          </p>
          <Button variant="outline" size="sm" onClick={() => void history.refetch()}>
            Try again
          </Button>
        </div>
      ) : history.data.data.length === 0 && total > 0 ? (
        /* A stale `walletPage` after entries changed: past the end, not empty. */
        <div className="flex flex-col gap-2 rounded-md bg-surface-muted px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-foreground-muted">
            This page is past the end of the history.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistory({ page: 1, size })}
          >
            Go to the first page
          </Button>
        </div>
      ) : history.data.data.length === 0 ? (
        <p className="rounded-md bg-surface-muted px-3 py-3 text-body text-foreground-muted">
          No wallet activity yet. Top-ups, adjustments and gifts will appear here.
        </p>
      ) : (
        <div className="space-y-4">
          <ul
            aria-label="Newest wallet entries"
            className="divide-y divide-border rounded-md border border-border"
          >
            {history.data.data.map((row) => (
              <HistoryRow key={row.id} row={row} back={back} />
            ))}
          </ul>
          <Pagination
            state={{
              page,
              pageSize: size,
              total,
              totalPages: history.data.pagination.totalPages,
            }}
            pageSizeOptions={HISTORY_SIZES}
            onPageChange={(next) => setHistory({ page: next, size })}
            /* A new size starts again at the newest entries. */
            onPageSizeChange={(next) => setHistory({ page: 1, size: next })}
          />
        </div>
      )}
    </section>
  )
}
