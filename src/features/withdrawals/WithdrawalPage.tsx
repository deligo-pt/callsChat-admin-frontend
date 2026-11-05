import { AlertTriangle, ArrowLeft, Check, Circle, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import { isAppError, NotFoundError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import {
  CopyableId,
  DateTime,
  DiamondAmount,
  KeyValueGrid,
  PageHeader,
  StatusBadge,
} from '@/components/display'
import { ErrorState, LoadingState, NotFoundState } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { humaniseEnum } from '@/lib/status'
import {
  namesLookAlike,
  withdrawalHostName,
  type WithdrawalDetail,
} from '@/types/withdrawals'

import { MethodIcon } from './cells'
import { formatBdt, methodLabel, processedByName, WITHDRAWAL_TIME_ZONE } from './labels'
import { WithdrawalActions } from './WithdrawalActions'
import { useWithdrawal } from './useWithdrawals'

/**
 * One withdrawal — `/withdrawals/:id` (plan.md W2).
 *
 * Built around the one question finance has: *what do I send, and where?*
 * The amount to send and the frozen account (`paymentSnapshot`) come first,
 * each value copyable. The live saved account is shown only when it differs,
 * with a warning to pay the snapshot (decision 4).
 */

const LIST_QUERY = /^\?[A-Za-z0-9_.~%+=&-]{0,300}$/
const TZ = WITHDRAWAL_TIME_ZONE

function useBackHref(): string {
  const state: unknown = useLocation().state
  const from =
    state && typeof state === 'object'
      ? (state as Record<string, unknown>)['from']
      : null
  return typeof from === 'string' && LIST_QUERY.test(from)
    ? `${ROUTES.withdrawals}${from}`
    : ROUTES.withdrawals
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" className="-ml-2.5 self-start" asChild>
      <Link to={useBackHref()}>
        <ArrowLeft /> Withdrawals
      </Link>
    </Button>
  )
}

function Card({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'space-y-4 rounded-md border border-border bg-surface p-4 sm:p-6',
        className,
      )}
    >
      <h2 className="text-h4 font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Copyable({
  value,
  label,
}: {
  value: string | null | undefined
  label: string
}) {
  const text = value?.trim()
  if (!text) return <span className="text-foreground-subtle">—</span>
  return <CopyableId value={text} label={label} maxLength={64} size="md" />
}

/* ------------------------------------------------------------------ *
 * Summary — status, what to send, actions
 * ------------------------------------------------------------------ */

function Summary({ detail }: { detail: WithdrawalDetail }) {
  return (
    <section
      aria-label="Withdrawal"
      className="space-y-4 rounded-md border border-border bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge domain="withdrawal" value={detail.status} />
        <span className="text-caption text-foreground-muted">
          Requested <DateTime value={detail.requestedAt} timeZone={TZ} />
        </span>
      </div>

      <KeyValueGrid
        className="lg:grid-cols-4 xl:grid-cols-4"
        items={[
          {
            label: detail.status === 'PAID' ? 'Sent to the host' : 'To send',
            value: (
              <span className="tabular text-h3 font-semibold">
                {formatBdt(detail.netAmountBdt)}
              </span>
            ),
          },
          { label: 'Diamonds', value: <DiamondAmount amount={detail.amount} /> },
          {
            label: 'Gross',
            value: <span className="tabular">{formatBdt(detail.amountBdt)}</span>,
          },
          {
            label: 'Fee',
            value: <span className="tabular">{formatBdt(detail.feeBdt)}</span>,
          },
        ]}
      />

      <StatusNote detail={detail} />

      <div className="border-t border-border pt-4 empty:hidden">
        <WithdrawalActions row={detail} />
      </div>
    </section>
  )
}

function StatusNote({ detail }: { detail: WithdrawalDetail }) {
  const box = 'rounded-md px-3 py-2 text-body'
  switch (detail.status) {
    case 'PENDING':
      return (
        <p className={cn(box, 'bg-warning-soft text-warning-foreground')}>
          Waiting for review. Check the account below against the host, then approve or
          reject.
        </p>
      )
    case 'APPROVED':
      return (
        <p className={cn(box, 'bg-info-soft text-info-foreground')}>
          Approved. Send {formatBdt(detail.netAmountBdt)} to the account below, then
          mark it as paid with the TrxID.
        </p>
      )
    case 'REJECTED':
      return (
        <div role="note" className={cn(box, 'bg-danger-soft text-danger-foreground')}>
          <p className="font-medium">Rejected — the diamonds went back to the host.</p>
          {detail.rejectReason ? (
            <p>Reason given to the host: {detail.rejectReason}</p>
          ) : null}
        </div>
      )
    case 'CANCELLED':
      return (
        <p className={cn(box, 'bg-surface-muted text-foreground-muted')}>
          The host cancelled this request. The diamonds went back to their balance.
        </p>
      )
    case 'PAID':
      return (
        <p className={cn(box, 'bg-success-soft text-success-foreground')}>
          Paid. Nothing more to do.
        </p>
      )
  }
}

/* ------------------------------------------------------------------ *
 * Pay to — the frozen account
 * ------------------------------------------------------------------ */

function PayToCard({ detail }: { detail: WithdrawalDetail }) {
  const s = detail.paymentSnapshot
  const live = detail.paymentDetail
  const hostName = withdrawalHostName(detail)
  const mismatch = !namesLookAlike(s.accountName, detail.user?.profile?.displayName)
  const changed =
    live &&
    (live.accountName !== s.accountName ||
      live.accountNumber !== s.accountNumber ||
      live.bankName !== s.bankName ||
      live.branchName !== s.branchName ||
      live.routingNumber !== s.routingNumber)
  const removed = Boolean(live?.deletedAt)

  return (
    <Card title="Pay to">
      <p className="inline-flex items-center gap-2 text-body font-medium">
        <MethodIcon type={s.type} />
        {methodLabel(s.type)}
      </p>
      <KeyValueGrid
        columns={2}
        items={[
          {
            label: 'Account holder',
            value: <Copyable value={s.accountName} label="Account holder" />,
          },
          {
            label: s.type === 'BANK' ? 'Account number' : 'Wallet number',
            value: (
              <Copyable
                value={s.accountNumber ?? s.accountNumberMasked}
                label="Account number"
              />
            ),
          },
          ...(s.type === 'BANK'
            ? [
                { label: 'Bank', value: <Copyable value={s.bankName} label="Bank" /> },
                {
                  label: 'Branch',
                  value: <Copyable value={s.branchName} label="Branch" />,
                },
                {
                  label: 'Routing number',
                  value: <Copyable value={s.routingNumber} label="Routing number" />,
                },
              ]
            : []),
        ]}
      />

      {mismatch ? (
        <p className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-body text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            The account holder “{s.accountName}” does not look like the host’s name “
            {hostName}”. Make sure the account belongs to the host before paying.
          </span>
        </p>
      ) : null}

      {removed || changed ? (
        <p className="flex gap-2 rounded-md bg-info-soft px-3 py-2 text-body text-info-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {removed
              ? 'The host has since removed this saved account.'
              : `The host has since changed this saved account${
                  live?.accountName && live.accountName !== s.accountName
                    ? ` (holder now “${live.accountName}”)`
                    : ''
                }.`}{' '}
            Pay the account shown here — it is the one the host chose for this request.
          </span>
        </p>
      ) : null}
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * Host
 * ------------------------------------------------------------------ */

function HostCard({ detail }: { detail: WithdrawalDetail }) {
  const canOpenUser = useCan(PERMISSIONS.usersView)
  const canOpenHosts = useCan(PERMISSIONS.hostApplicationsView)
  const canLedger = useCan(PERMISSIONS.ledgerView)
  const user = detail.user
  const host = detail.host
  const name = withdrawalHostName(detail)
  const standing = host?.status && host.status !== 'ACTIVE' ? host.status : null

  return (
    <Card title="Host">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {canOpenUser ? (
          <Link
            to={ROUTES.user(detail.userId)}
            className="font-medium text-primary hover:underline"
          >
            {name}
          </Link>
        ) : (
          <span className="font-medium">{name}</span>
        )}
        {standing ? (
          <span className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-overline text-warning-foreground">
            Host · {humaniseEnum(standing)}
          </span>
        ) : null}
        {host?.level ? (
          <span className="text-caption text-foreground-muted">Level {host.level}</span>
        ) : null}
      </div>
      <KeyValueGrid
        columns={2}
        items={[
          {
            label: 'Email',
            value: <span className="wrap-anywhere">{user?.email ?? '—'}</span>,
          },
          {
            label: 'Phone',
            value: <span className="tabular">{user?.phone ?? '—'}</span>,
          },
          {
            label: 'Can withdraw now',
            value:
              typeof host?.withdrawableDiamonds === 'number' ? (
                <DiamondAmount amount={host.withdrawableDiamonds} variant="available" />
              ) : (
                '—'
              ),
          },
          {
            label: 'Held for withdrawals',
            value:
              typeof host?.pendingWithdrawal === 'number' ? (
                <DiamondAmount amount={host.pendingWithdrawal} variant="locked" />
              ) : (
                '—'
              ),
          },
          {
            label: 'Earned in total',
            value:
              typeof host?.totalDiamondsEarned === 'number' ? (
                <DiamondAmount amount={host.totalDiamondsEarned} />
              ) : (
                '—'
              ),
          },
          {
            label: 'Joined',
            value: user?.createdAt ? (
              <DateTime value={user.createdAt} timeZone={TZ} variant="date" />
            ) : (
              '—'
            ),
          },
        ]}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-body">
        <Link
          to={ROUTES.withdrawalsFor({ userId: detail.userId, status: 'ALL' })}
          className="text-primary hover:underline"
        >
          All withdrawals by this host
        </Link>
        {canOpenHosts && user?.email ? (
          <Link
            to={`${ROUTES.hosts}?search=${encodeURIComponent(user.email)}`}
            className="text-primary hover:underline"
          >
            Open in Live hosts
          </Link>
        ) : null}
        {canLedger ? (
          <Link
            to={ROUTES.walletLedger({ userId: detail.userId })}
            className="text-primary hover:underline"
          >
            Wallet transactions
          </Link>
        ) : null}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * Timeline and notes
 * ------------------------------------------------------------------ */

type Step = {
  label: string
  at: string | null | undefined
  state: 'done' | 'failed' | 'waiting'
  detail?: ReactNode
}

function steps(detail: WithdrawalDetail): Step[] {
  const by = processedByName(detail)
  const requested: Step = {
    label: 'Requested by the host',
    at: detail.requestedAt,
    state: 'done',
  }
  switch (detail.status) {
    case 'PENDING':
      return [
        requested,
        { label: 'Review', at: null, state: 'waiting' },
        { label: 'Paid', at: null, state: 'waiting' },
      ]
    case 'APPROVED':
      return [
        requested,
        {
          label: by ? `Approved by ${by}` : 'Approved',
          at: detail.processedAt,
          state: 'done',
        },
        { label: 'Paid', at: null, state: 'waiting' },
      ]
    case 'PAID':
      return [
        requested,
        {
          label: by ? `Approved by ${by}` : 'Approved',
          at: detail.processedAt,
          state: 'done',
        },
        {
          label: 'Paid',
          at: detail.paidAt,
          state: 'done',
          detail: detail.transactionRef ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              TrxID <Copyable value={detail.transactionRef} label="TrxID" />
            </span>
          ) : null,
        },
      ]
    case 'REJECTED':
      return [
        requested,
        {
          label: by ? `Rejected by ${by}` : 'Rejected',
          at: detail.processedAt,
          state: 'failed',
        },
      ]
    case 'CANCELLED':
      return [
        requested,
        { label: 'Cancelled by the host', at: detail.processedAt, state: 'failed' },
      ]
  }
}

function TimelineCard({ detail }: { detail: WithdrawalDetail }) {
  return (
    <Card title="Timeline">
      <ol className="space-y-3">
        {steps(detail).map((step) => {
          const Icon =
            step.state === 'done' ? Check : step.state === 'failed' ? X : Circle
          return (
            <li key={step.label} className="flex gap-3">
              <span
                className={cn(
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
                  step.state === 'done' && 'bg-success-soft text-success-foreground',
                  step.state === 'failed' && 'bg-danger-soft text-danger-foreground',
                  step.state === 'waiting' && 'bg-surface-muted text-foreground-subtle',
                )}
                aria-hidden="true"
              >
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 space-y-0.5">
                <p
                  className={cn(
                    'text-body',
                    step.state === 'waiting' ? 'text-foreground-muted' : 'font-medium',
                  )}
                >
                  {step.label}
                  {step.state === 'waiting' ? (
                    <span className="sr-only"> — not yet</span>
                  ) : null}
                </p>
                {step.at ? (
                  <p className="text-caption text-foreground-muted">
                    <DateTime value={step.at} timeZone={TZ} />
                  </p>
                ) : null}
                {step.detail ? <div className="text-caption">{step.detail}</div> : null}
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function NotesCard({ detail }: { detail: WithdrawalDetail }) {
  const items = [
    { label: 'Note from the host', value: detail.userNote },
    { label: 'Internal admin note', value: detail.adminNote },
    ...(detail.status === 'REJECTED'
      ? [{ label: 'Reason shown to the host', value: detail.rejectReason }]
      : []),
  ]
  return (
    <Card title="Notes">
      <KeyValueGrid
        columns={1}
        items={items.map((item) => ({
          label: item.label,
          full: true,
          value: item.value?.trim() ? (
            <span className="wrap-anywhere whitespace-pre-wrap">{item.value}</span>
          ) : (
            <span className="text-foreground-subtle">None</span>
          ),
        }))}
      />
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export function WithdrawalPage() {
  const { withdrawalId = '' } = useParams<{ withdrawalId: string }>()
  const query = useWithdrawal(withdrawalId)

  if (query.isPending || query.isError) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <BackLink />
          <PageHeader title="Withdrawal" />
        </div>
        {query.isPending ? (
          <LoadingState variant="detail" />
        ) : query.error instanceof NotFoundError ? (
          <NotFoundState
            title="Withdrawal not found"
            description="No withdrawal request has this id. Check the link, or find it in Withdrawals."
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

  const detail = query.data
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <BackLink />
        <PageHeader title={`Withdrawal by ${withdrawalHostName(detail)}`} />
      </div>

      <Summary detail={detail} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <PayToCard detail={detail} />
        <HostCard detail={detail} />
        <TimelineCard detail={detail} />
        <NotesCard detail={detail} />
      </div>

      <details className="rounded-md border border-border bg-surface p-4 text-caption sm:px-6">
        <summary className="cursor-pointer text-foreground-muted">
          Technical details
        </summary>
        <KeyValueGrid
          className="mt-4"
          items={[
            {
              label: 'Withdrawal ID',
              value: <CopyableId value={detail.id} label="Withdrawal ID" />,
            },
            {
              label: 'User ID',
              value: <CopyableId value={detail.userId} label="User ID" />,
            },
            ...(detail.hostProfileId
              ? [
                  {
                    label: 'Host profile ID',
                    value: (
                      <CopyableId
                        value={detail.hostProfileId}
                        label="Host profile ID"
                      />
                    ),
                  },
                ]
              : []),
            ...(detail.paymentDetailId
              ? [
                  {
                    label: 'Saved account ID',
                    value: (
                      <CopyableId
                        value={detail.paymentDetailId}
                        label="Saved account ID"
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </details>
    </div>
  )
}
