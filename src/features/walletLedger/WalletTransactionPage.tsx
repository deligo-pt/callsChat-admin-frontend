import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import { isAppError, NotFoundError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import {
  CopyableId,
  DateTime,
  KeyValueGrid,
  PageHeader,
  type KeyValueItem,
} from '@/components/display'
import { ErrorState, LoadingState, NotFoundState } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/cn'
import { formatDiamonds, formatWholeCurrency } from '@/lib/format'
import {
  directionOf,
  sourceOf,
  type WalletTransactionDetail,
} from '@/types/walletTransactions'
import { useUserName } from '@/components/wallet'
import {
  giftName,
  LEDGER_TIME_ZONE,
  methodName,
  methodOf,
  referenceSource,
  trxIdOf,
  typeLabel,
} from '@/lib/walletLabels'

import { useTopUpRequestFor, useWalletTransaction } from './useWalletLedger'

/**
 * One wallet entry — `GET /admin/wallet/transactions/:id` (plan.md T3).
 *
 * Deep-linkable, opened from a ledger row. Everything an operator needs to
 * answer "where did these diamonds come from?" is in words: the account, the
 * balance then and now, and the source — the approved top-up request, the
 * admin who adjusted, the gift. Ids are kept for a backend ticket, out of the
 * way under "Technical details".
 */

interface Back {
  readonly href: string
  readonly label: string
}

/**
 * A user record, optionally on one of its tabs and the wallet history's page
 * and size — and nothing else.
 */
const USER_RECORD =
  /^\/users\/[A-Za-z0-9_-]{1,64}(\?tab=[a-z-]{1,32}(&walletPage=[1-9]\d{0,4})?(&walletSize=\d{1,3})?)?$/

/**
 * The top-up queue with its filters (plan.md T5, "See wallet entry"). A
 * query string of URL-safe characters only, so it stays a filtered queue.
 */
const TOP_UP_QUEUE = /^\/diamonds\/top-ups(\?[A-Za-z0-9_.~%+=&-]{0,300})?$/

/**
 * Where "back" goes: where the operator came from (plan.md T3–T5).
 *
 * - From the ledger: `{ from: '?type=…' }`, its filters restored.
 * - From a user's Finance tab: `{ backTo: '/users/<id>?tab=finance',
 *   backLabel: '<name>' }`.
 * - From a top-up request's drawer: `{ backTo: '/diamonds/top-ups?…' }`.
 * - Otherwise (a pasted link): the ledger.
 *
 * ⚠️ Router state can be written by any page, so only a ledger query string
 * or a user-record / top-up-queue path is accepted — never an arbitrary destination.
 */
function useBack(): Back {
  const state: unknown = useLocation().state
  const record =
    state && typeof state === 'object' ? (state as Record<string, unknown>) : {}

  const { backTo, backLabel, from } = record
  if (typeof backTo === 'string' && TOP_UP_QUEUE.test(backTo)) {
    /* A fixed label: the queue's name is not the caller's to choose. */
    return { href: backTo, label: 'Top-up requests' }
  }
  if (typeof backTo === 'string' && USER_RECORD.test(backTo)) {
    const label =
      typeof backLabel === 'string' && backLabel.trim()
        ? backLabel.trim().slice(0, 60)
        : 'Back to the account'
    return { href: backTo, label }
  }
  return {
    href:
      typeof from === 'string' && from.startsWith('?')
        ? `${ROUTES.walletTransactions}${from}`
        : ROUTES.walletTransactions,
    label: 'Wallet transactions',
  }
}

/**
 * Back to where the operator came from: top-left, above the title, at every width. Not a page
 * action — passed as one, `PageHeader` stretched it full-width and centred it
 * on a phone. It replaces the breadcrumb, which only repeated it.
 */
function BackLink({ back }: { back: Back }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-2.5 max-w-full self-start" asChild>
      <Link to={back.href}>
        <ArrowLeft /> <span className="truncate">{back.label}</span>
      </Link>
    </Button>
  )
}

function Card({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const id = `wallet-entry-${title.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <section
      aria-labelledby={id}
      className={cn(
        /*
         * Phone: heading, content, then the link full-width at the bottom.
         * From `sm`: the link beside the heading. One element either way —
         * `order` moves it, so nothing is rendered twice.
         */
        'grid grid-cols-1 content-start gap-4 rounded-md border border-border bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6',
        className,
      )}
    >
      {/* min-h-8: a heading with a button and one without line up side by side. */}
      <h2 id={id} className="flex items-center text-h4 font-semibold sm:min-h-8">
        {title}
      </h2>
      {action ? (
        <div className="order-last sm:order-none [&>*]:w-full sm:[&>*]:w-auto">
          {action}
        </div>
      ) : null}
      <div className="min-w-0 space-y-4 sm:col-span-2">{children}</div>
    </section>
  )
}

function OutLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link to={to}>
        {children} <ArrowUpRight />
      </Link>
    </Button>
  )
}

/** The signed amount, large. Free / credit / debit by the sign (plan.md B2). */
function Amount({ amount }: { amount: number }) {
  const direction = directionOf({ amount })
  if (direction === 'FREE') {
    return (
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="tabular text-h1 font-semibold">{formatDiamonds(0)}</span>
        <span className="text-body text-foreground-muted">Diamonds · Free</span>
      </p>
    )
  }
  const credit = direction === 'CREDIT'
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span
        className={cn(
          'tabular text-h1 font-semibold',
          credit ? 'text-success-foreground' : 'text-danger-foreground',
        )}
      >
        {credit ? '+' : '−'}
        {formatDiamonds(Math.abs(amount))}
      </span>
      <span className="text-body text-foreground-muted">
        Diamonds {credit ? 'credited' : 'debited'}
      </span>
    </p>
  )
}

/** A person by name, linked when the operator may open them. */
function Person({ userId }: { userId: string }) {
  const canOpen = useCan(PERMISSIONS.usersView)
  const name = useUserName(userId, canOpen)
  if (!canOpen) return <span>An admin</span>
  if (name.isPending) return <Skeleton className="h-5 w-32" />
  const label =
    name.data?.displayName ?? (name.data?.username ? `@${name.data.username}` : null)
  return (
    <Link to={ROUTES.user(userId)} className="font-medium text-primary hover:underline">
      {label ?? 'View admin'}
    </Link>
  )
}

function AccountCard({ entry }: { entry: WalletTransactionDetail }) {
  const canOpen = useCan(PERMISSIONS.usersView)
  const name = entry.user?.displayName?.trim()
  const username = entry.user?.username?.trim()
  const now = entry.user?.currentDiamondBalance

  const items: KeyValueItem[] = [
    {
      label: 'Account',
      value: (
        <span className="flex flex-col gap-0.5">
          {canOpen ? (
            <Link
              to={ROUTES.user(entry.userId)}
              className="font-medium text-primary hover:underline"
            >
              {name || 'Open account'}
            </Link>
          ) : (
            <span className="font-medium">{name || 'Unnamed account'}</span>
          )}
          {username ? (
            <span className="text-caption text-foreground-muted">@{username}</span>
          ) : null}
        </span>
      ),
    },
    {
      label: 'Balance after this',
      value:
        typeof entry.balanceAfter === 'number' ? (
          <span className="tabular">{formatDiamonds(entry.balanceAfter)} Diamonds</span>
        ) : (
          '—'
        ),
    },
    {
      label: 'Balance now',
      value:
        typeof now === 'number' ? (
          <span className="tabular">{formatDiamonds(now)} Diamonds</span>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <Card
      title="Account"
      action={
        <OutLink to={ROUTES.walletLedger({ userId: entry.userId })}>
          All their wallet transactions
        </OutLink>
      }
    >
      {/* Three short facts: one row from `sm`, so then and now sit side by side. */}
      <KeyValueGrid items={items} className="sm:grid-cols-3" />
    </Card>
  )
}

function TopUpSource({
  entry,
  requestId,
}: {
  entry: WalletTransactionDetail
  requestId: string
}) {
  const canReadQueue = useCan(PERMISSIONS.walletsView)
  const trxId = trxIdOf(entry.note)
  const lookup = useTopUpRequestFor(requestId, trxId, canReadQueue)
  const request = lookup.data

  const method = methodName(request?.method) ?? methodOf(entry.note)
  const items: KeyValueItem[] = [
    { label: 'Source', value: 'Top-up request' },
    { label: 'Paid with', value: method ?? '—' },
    { label: 'Payment TrxID', value: trxId ?? '—' },
  ]
  if (request) {
    items.push(
      { label: 'Package', value: request.package?.title?.trim() || 'None recorded' },
      { label: 'Amount paid', value: formatWholeCurrency(request.amountBdt, 'BDT') },
      {
        label: 'Approved by',
        value: request.reviewedById ? <Person userId={request.reviewedById} /> : '—',
      },
      {
        label: 'Approved',
        value: <DateTime value={request.reviewedAt} timeZone={LEDGER_TIME_ZONE} />,
      },
    )
  }

  return (
    <Card
      title="Source"
      action={
        canReadQueue && trxId ? (
          <OutLink to={ROUTES.topUpsFor(trxId)}>Open in Top-up requests</OutLink>
        ) : undefined
      }
    >
      {lookup.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <KeyValueGrid items={items} />
      )}
      {canReadQueue && trxId && lookup.isSuccess && !request ? (
        <p className="text-caption text-foreground-muted">
          The request itself could not be found in the top-up queue, so only what this
          entry records is shown.
        </p>
      ) : null}
    </Card>
  )
}

function SourceCard({ entry }: { entry: WalletTransactionDetail }) {
  const source = sourceOf(entry)

  switch (source.kind) {
    case 'topUpRequest':
      return <TopUpSource entry={entry} requestId={source.requestId} />
    case 'adjustedBy':
      return (
        <Card title="Source">
          <KeyValueGrid
            items={[
              { label: 'Source', value: 'Balance adjustment' },
              { label: 'Adjusted by', value: <Person userId={source.adminId} /> },
            ]}
          />
        </Card>
      )
    case 'gift':
      return (
        <Card
          title="Source"
          action={
            <OutLink to={ROUTES.giftLedger({ senderId: entry.userId })}>
              Their gift transactions
            </OutLink>
          }
        >
          <KeyValueGrid
            items={[
              { label: 'Source', value: 'Gift sent' },
              { label: 'Gift', value: giftName(source.slug) },
            ]}
          />
          {/* ⚠️ plan.md R2: the entry holds the gift's slug, not the send's id. */}
          <p className="text-caption text-foreground-muted">
            The wallet entry does not record which send it was, so the gift ledger opens
            on all of this account's gifts.
          </p>
        </Card>
      )
    case 'reference':
    case 'none':
      return (
        <Card title="Source">
          <KeyValueGrid
            items={[
              { label: 'Source', value: referenceSource(entry.type) },
              ...(entry.type === 'CREATOR_EARNINGS_CONVERT'
                ? [
                    {
                      label: 'What this is',
                      value:
                        'Earnings from gifts received, converted into spendable Diamonds.',
                    },
                  ]
                : []),
            ]}
          />
        </Card>
      )
  }
}

export function WalletTransactionPage() {
  const { transactionId = '' } = useParams<{ transactionId: string }>()
  const back = useBack()
  const query = useWalletTransaction(transactionId)

  if (query.isPending) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <BackLink back={back} />
          <PageHeader title="Wallet transaction" />
        </div>
        <LoadingState variant="detail" />
      </div>
    )
  }

  if (query.isError) {
    const notFound = query.error instanceof NotFoundError
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <BackLink back={back} />
          <PageHeader title="Wallet transaction" />
        </div>
        {notFound ? (
          <NotFoundState
            title="Transaction not found"
            description="No wallet entry has this id. Check the link, or find the entry in the ledger."
          />
        ) : (
          <ErrorState
            {...(isAppError(query.error) ? { description: query.error.message } : {})}
            {...(isAppError(query.error) && query.error.correlationId
              ? { correlationId: query.error.correlationId }
              : {})}
            onRetry={() => void query.refetch()}
          />
        )}
      </div>
    )
  }

  const entry = query.data
  const note = entry.note?.trim()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <BackLink back={back} />
        <PageHeader title={typeLabel(entry.type)} />
      </div>

      <section
        aria-label="Amount"
        className="space-y-1 rounded-md border border-border bg-surface p-4 sm:p-6"
      >
        <Amount amount={entry.amount} />
        <p className="text-body text-foreground-muted">
          <DateTime
            value={entry.createdAt}
            timeZone={LEDGER_TIME_ZONE}
            variant="precise"
          />
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <AccountCard entry={entry} />
        <SourceCard entry={entry} />
      </div>

      <Card title="Note">
        {/* Plain text: written by an admin or the system, never markup. */}
        <p className="text-body wrap-anywhere whitespace-pre-wrap">
          {note || <span className="text-foreground-muted">No note.</span>}
        </p>
      </Card>

      <details className="rounded-md border border-border bg-surface p-4 text-caption sm:px-6">
        <summary className="cursor-pointer text-foreground-muted">
          Technical details
        </summary>
        <KeyValueGrid
          className="mt-4"
          items={[
            {
              label: 'Transaction ID',
              value: <CopyableId value={entry.id} label="Transaction ID" />,
            },
            {
              label: 'Reference ID',
              value: entry.refId ? (
                <CopyableId value={entry.refId} label="Reference ID" />
              ) : (
                '—'
              ),
            },
            {
              label: 'Account ID',
              value: <CopyableId value={entry.userId} label="Account ID" />,
            },
          ]}
        />
      </details>
    </div>
  )
}
