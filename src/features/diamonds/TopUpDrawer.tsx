import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { queryKeys } from '@/api/queryKeys'
import { fetchWalletTransactions } from '@/api/wallet'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import { DateTime } from '@/components/display'
import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  isManualMethod,
  MIN_PANEL_REJECTION_REASON,
  type TopUpRequest,
} from '@/types/wallet'

import { MethodCell, StatusCell } from './cells'
import { formatDiamondAmount, formatWholeCurrency } from './money'
import { ReceiptField } from './ReceiptField'
import { useApproveTopUpMutation, useRejectTopUpMutation } from './useWallet'

/**
 * One payment, and the two decisions on it (plan.md §5, phase W3).
 *
 * ⚠️ **Approve moves money and cannot be undone from this panel.** It credits
 * the payer's spending wallet, writes a `TOP_UP` ledger row and pushes a
 * socket event. There is no un-approve endpoint and no reversal flow — the
 * nearest remedy is a manual negative adjustment, which is a different record,
 * a Super-Admin-only permission, and a separate visible act. So it goes
 * through `ConfirmActionDialog`, not a bare button.
 *
 * ⚠️ **This drawer does not fetch.** `GET /admin/wallet/requests/:id` answers
 * `ROUTE_NOT_FOUND` (measured 2026-10-27), so the row comes from the list
 * cache. The host application drawer fetches precisely so it can notice a
 * record changing underneath an operator; this one cannot. The `409` on submit
 * is therefore the **only** thing standing between two admins and two reviews
 * of one payment, and it is surfaced verbatim rather than flattened into
 * "something went wrong".
 *
 * ⚠️ **A rejection reason is read by the payer**, not by an auditor. The
 * dialog's default hint promises the text is "recorded in the audit log with
 * your name" — true for the consumer-user actions it was built for and the
 * wrong promise here, where somebody is being told why their money did not
 * arrive.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h3 className="text-overline text-foreground-muted">{title}</h3>
      {children}
    </section>
  )
}

/** ⚠️ Two columns only from `sm` up — see `ApplicationDrawer` for why. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-caption text-foreground-muted">{label}</dt>
      <dd className="text-body wrap-anywhere">{children}</dd>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-overline text-foreground-muted">{label}</p>
      <div className="text-body wrap-anywhere">{children}</div>
    </div>
  )
}

function payerName(record: TopUpRequest): string {
  const profile = record.user?.profile
  return (
    profile?.displayName?.trim() ||
    profile?.username?.trim() ||
    record.user?.phone?.trim() ||
    record.userId ||
    record.id
  )
}

/**
 * plan.md T5 — from an approved payment to the wallet row it wrote.
 *
 * Approval writes one top-up row whose `refId` is this request's id, and the
 * ledger's `search` matches `refId` (measured), so one small read finds it
 * and the button opens that entry directly — no page of results with a raw
 * id in its search box. No `type` filter: the undocumented
 * `TOP_UP_PURCHASE` (B4) may carry it too.
 */
function SeeWalletEntry({ requestId }: { requestId: string }) {
  /* "Back" on the entry returns to this queue, filters and all. */
  const { pathname, search } = useLocation()
  const lookup = useQuery({
    queryKey: [...queryKeys.walletTransactions.all, 'for-request', requestId],
    queryFn: ({ signal }) =>
      fetchWalletTransactions({ search: requestId, limit: 5 }, signal),
    staleTime: 60_000,
  })
  const entry = lookup.data?.data.find((row) => row.refId === requestId)

  if (lookup.isPending) {
    return (
      <Button variant="outline" size="sm" disabled className="shrink-0">
        Finding the wallet entry…
      </Button>
    )
  }
  if (!entry) {
    return (
      <p className="text-caption text-foreground-muted">
        {lookup.isError
          ? 'The wallet entry could not be looked up.'
          : 'No wallet entry was found for this payment.'}
      </p>
    )
  }
  return (
    <Button variant="outline" size="sm" asChild className="shrink-0">
      <Link
        to={ROUTES.walletTransaction(entry.id)}
        state={{ backTo: `${pathname}${search}` }}
      >
        See wallet entry <ArrowRight />
      </Link>
    </Button>
  )
}

export interface TopUpDrawerProps {
  request: TopUpRequest | null
  onClose: () => void
}

export function TopUpDrawer({ request, onClose }: TopUpDrawerProps) {
  const approve = useApproveTopUpMutation()
  const reject = useRejectTopUpMutation()

  const [confirming, setConfirming] = useState<'APPROVE' | 'REJECT' | null>(null)

  const name = request ? payerName(request) : ''
  const pending = (request?.status ?? '').toUpperCase() === 'PENDING'
  const manual = isManualMethod(request?.method)
  /* plan.md T5 — only with `ledger.view`: the queue alone does not grant it. */
  const approved = (request?.status ?? '').toUpperCase() === 'APPROVED'
  const canOpenLedger = useCan(PERMISSIONS.ledgerView)

  function finish(message: string) {
    setConfirming(null)
    toast.success(message)
    onClose()
  }

  function fail(error: unknown, fallback: string) {
    /*
     * ⚠️ The dialog stays open on failure. Closing it would lose the reason
     * the operator typed — and on a rejection that text is the message the
     * payer receives, not something to make somebody write twice because the
     * first attempt 500'd.
     *
     * A concurrent review arrives here too, and its message is the service's
     * own: "Cannot approve request in 'APPROVED' status." — a `400`, not the
     * `409` the guide documents (measured 2026-10-27). That sentence tells an
     * operator exactly what happened; replacing it with a generic failure
     * would hide that a colleague got there first.
     */
    toast.error(isAppError(error) ? error.message : fallback)
  }

  function submitApprove() {
    if (!request) return
    approve.mutate(request.id, {
      onSuccess: () => finish(`${name}'s diamonds have been credited.`),
      onError: (error) => fail(error, 'The approval could not be submitted.'),
    })
  }

  function submitReject(reason: string) {
    if (!request) return
    reject.mutate(
      { id: request.id, reason },
      {
        onSuccess: () => finish(`${name}'s payment was rejected.`),
        onError: (error) => fail(error, 'The rejection could not be submitted.'),
      },
    )
  }

  return (
    <>
      <Sheet open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 sm:max-w-xl"
          aria-label="Top-up request"
        >
          <SheetHeader>
            <SheetTitle className="wrap-anywhere">
              {name || 'Top-up request'}
            </SheetTitle>
            <SheetDescription>
              {request?.user?.email ??
                request?.user?.phone ??
                'No contact on this account.'}
            </SheetDescription>
          </SheetHeader>

          {/*
           * ⚠️ `-my-1.5 px-4 py-1.5` — vertical ring clearance only.
           * `SheetContent` carries no padding of its own, so a negative
           * horizontal margin here cancels against nothing and the body ends
           * up flush against the window edge. See `ApplicationDrawer` for the
           * screenshot that found it.
           */}
          <div className="-my-1.5 min-h-0 flex-1 scroll-p-2 space-y-5 overflow-y-auto px-4 py-1.5">
            {request ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusCell record={request} />
                  {request.createdAt ? (
                    <span className="text-caption text-foreground-muted">
                      Submitted <DateTime value={request.createdAt} relative />
                    </span>
                  ) : null}
                </div>

                <Section title="Payment">
                  <dl className="space-y-3">
                    <Fact label="Amount">
                      {formatWholeCurrency(request.amountBdt, 'BDT')}
                    </Fact>
                    <Fact label="Diamonds">
                      {formatDiamondAmount(request.diamonds)}
                    </Fact>
                    <Fact label="Package">
                      {request.package?.title ?? 'None recorded'}
                    </Fact>
                  </dl>
                </Section>

                <Section title="How it was paid">
                  <Field label="Method">
                    <MethodCell record={request} />
                  </Field>

                  <dl className="space-y-3">
                    <Fact label="Transaction ID">
                      {request.transactionId ? (
                        <span className="font-mono">{request.transactionId}</span>
                      ) : (
                        'Not provided'
                      )}
                    </Fact>
                    <Fact label="Sender">{request.senderNumber || 'Not provided'}</Fact>
                  </dl>

                  {/*
                   * ⚠️ Said plainly, because the guide does not say it at all.
                   * A gateway row has already settled; an operator who treats
                   * it like mobile money goes looking for a bank statement
                   * entry that will never exist (plan.md O7).
                   */}
                  {!manual ? (
                    <p className="text-caption text-foreground-muted">
                      This payment settled through a payment gateway. There is nothing
                      to reconcile against a bank statement — approving it only releases
                      the diamonds.
                    </p>
                  ) : null}

                  <Field label="Receipt">
                    <ReceiptField url={request.receiptImageUrl} />
                  </Field>
                </Section>

                {request.rejectionReason ? (
                  <section className="space-y-1 rounded-lg border border-danger/30 bg-danger/5 p-4">
                    <h3 className="text-overline text-foreground-muted">
                      Rejection reason sent to the payer
                    </h3>
                    <p className="text-body wrap-anywhere">{request.rejectionReason}</p>
                  </section>
                ) : null}
              </>
            ) : null}
          </div>

          {request && pending ? (
            /*
             * ⚠️ `px-4 py-4` — the footer is a direct child of `SheetContent`,
             * which carries no padding, so without this the buttons sit 16px
             * left of every word above them.
             */
            <div className="flex flex-wrap gap-2 border-t border-border px-4 py-4">
              <Button onClick={() => setConfirming('APPROVE')}>Approve</Button>
              <Button variant="outline" onClick={() => setConfirming('REJECT')}>
                Reject
              </Button>
            </div>
          ) : request ? (
            /*
             * ⚠️ Stated rather than leaving the buttons off silently. An
             * operator who sees no controls cannot tell whether the decision
             * was already made or whether their role is too low.
             */
            <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-caption text-foreground-muted">
                This request has already been reviewed, so it cannot be approved or
                rejected again.
              </p>
              {approved && canOpenLedger ? (
                <SeeWalletEntry requestId={request.id} />
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmActionDialog
        open={confirming === 'APPROVE'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Approve this payment"
        target={name}
        effect={`This credits ${formatDiamondAmount(request?.diamonds)} diamonds to their spending wallet immediately and notifies them. There is no way to un-approve from this panel — the only remedy afterwards is a manual negative adjustment, which is a separate record and a Super Admin action.`}
        severity="critical"
        confirmLabel="Approve and credit"
        loading={approve.isPending}
        /*
         * ⚠️ `reason: 'none'` because the API has nowhere to put one. The
         * approve route takes no body at all — asking for ten characters the
         * client then discards would imply a record that is never sent.
         */
        reason="none"
        onConfirm={submitApprove}
      />

      <ConfirmActionDialog
        open={confirming === 'REJECT'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Reject this payment"
        target={name}
        effect="The payer is told their top-up was refused, is shown the reason you write below, and keeps their money — nothing is credited."
        severity="warning"
        confirmLabel="Reject and notify"
        loading={reject.isPending}
        /*
         * ⚠️ The dialog enforces ten characters; the service accepts one. The
         * panel is deliberately the stricter of the two: this text is not an
         * audit note, it is what somebody reads about their own money, and
         * they cannot ask a follow-up question.
         */
        reasonHint={`At least ${MIN_PANEL_REJECTION_REASON} characters. This is sent to the payer as the reason their payment was refused — write it for them, not for the log.`}
        onConfirm={submitReject}
      />
    </>
  )
}
