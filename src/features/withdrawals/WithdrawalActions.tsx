import { Ban, Check, Wallet } from 'lucide-react'
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'

import { isAppError, NotFoundError } from '@/api/errors'
import { PERMISSIONS } from '@/auth/permissions'
import { useAuth, useCan } from '@/auth/useAuth'
import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDiamonds } from '@/lib/format'
import {
  ADMIN_NOTE_MAX,
  allowedActions,
  REJECT_REASON_MAX,
  REJECT_REASON_MIN,
  TRANSACTION_REF_MAX,
  TRANSACTION_REF_MIN,
  withdrawalHostName,
  type Withdrawal,
} from '@/types/withdrawals'

import { formatBdt, methodLabel } from './labels'
import { useWithdrawalWrite, type WithdrawalWrite } from './useWithdrawals'

/**
 * Approve, reject and mark as paid (plan.md W3). Super Admin only by the
 * panel's permission split (decision 1): `withdrawals.approve`, `.reject` and
 * `.settle`. Each button shows only in a state the guide allows it in.
 */

type Open = 'approve' | 'reject' | 'markPaid' | null

function target(row: Withdrawal): string {
  return `${formatBdt(row.netAmountBdt)} (${formatDiamonds(row.amount)} diamonds) to ${withdrawalHostName(row)}`
}

function useWithdrawalPermissions(row: Withdrawal) {
  const mayApprove = useCan(PERMISSIONS.withdrawalsApprove)
  const mayReject = useCan(PERMISSIONS.withdrawalsReject)
  const maySettle = useCan(PERMISSIONS.withdrawalsSettle)
  const allowed = allowedActions(row.status)
  return {
    approve: mayApprove && allowed.approve,
    reject: mayReject && allowed.reject,
    markPaid: maySettle && allowed.markPaid,
  }
}

export function WithdrawalActions({ row }: { row: Withdrawal }) {
  const [open, setOpen] = useState<Open>(null)
  const can = useWithdrawalPermissions(row)
  const group = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const focusOwed = useRef(false)

  const show = (kind: Exclude<Open, null>, event: MouseEvent<HTMLButtonElement>) => {
    opener.current = event.currentTarget
    setOpen(kind)
  }
  const close = () => {
    focusOwed.current = true
    setOpen(null)
  }

  /*
   * Focus after a dialog (plan.md W5). The dialogs mount already open, so the
   * dialog's own return-focus never saw the button that opened it — and after
   * Approve that button is gone anyway, replaced by Mark as paid once the
   * request refetches. So: back to the opener while it exists, else to the
   * first action left, else to the page heading. Only when focus has fallen to
   * <body>; anything the user focused themselves is left alone.
   */
  useEffect(() => {
    if (open !== null || !focusOwed.current) return
    const active = document.activeElement
    if (active && active !== document.body && active.isConnected) return
    const heading = document.querySelector<HTMLElement>('main h1')
    const next =
      (opener.current?.isConnected ? opener.current : null) ??
      group.current?.querySelector<HTMLButtonElement>('button') ??
      heading
    if (next === heading && heading && !heading.hasAttribute('tabindex')) {
      heading.tabIndex = -1
    }
    next?.focus()
    const timer = window.setTimeout(() => {
      focusOwed.current = false
    }, 15_000)
    return () => window.clearTimeout(timer)
  }, [open, row.status])

  if (!can.approve && !can.reject && !can.markPaid) return null

  return (
    <>
      <div
        ref={group}
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Withdrawal actions"
      >
        {can.approve ? (
          <Button onClick={(event) => show('approve', event)}>
            <Check /> Approve
          </Button>
        ) : null}
        {can.markPaid ? (
          <Button onClick={(event) => show('markPaid', event)}>
            <Wallet /> Mark as paid
          </Button>
        ) : null}
        {can.reject ? (
          <Button variant="outline" onClick={(event) => show('reject', event)}>
            <Ban /> Reject
          </Button>
        ) : null}
      </div>

      {open === 'approve' ? <ApproveDialog row={row} onClose={close} /> : null}
      {open === 'reject' ? <RejectDialog row={row} onClose={close} /> : null}
      {open === 'markPaid' ? <MarkPaidDialog row={row} onClose={close} /> : null}
    </>
  )
}

/**
 * Run a write. The dialog closes on success, and also when the request has
 * moved on (409 / 404) — the refreshed page then shows its real state. Any
 * other failure keeps the dialog open with what was typed.
 */
function submit(
  write: ReturnType<typeof useWithdrawalWrite>,
  input: WithdrawalWrite,
  onClose: () => void,
) {
  write.mutate(input, {
    onSuccess: onClose,
    onError: (error) => {
      if (error instanceof NotFoundError || (isAppError(error) && error.status === 409))
        onClose()
    },
  })
}

/** The account to pay — repeated in the dialogs so it is checked once more. */
function PayTo({ row }: { row: Withdrawal }) {
  const s = row.paymentSnapshot
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-md border border-border px-3 py-2.5 text-body">
      <dt className="text-foreground-muted">Method</dt>
      <dd>{methodLabel(s.type)}</dd>
      <dt className="text-foreground-muted">Account holder</dt>
      <dd className="wrap-anywhere">{s.accountName ?? '—'}</dd>
      <dt className="text-foreground-muted">Account number</dt>
      <dd className="tabular wrap-anywhere">
        {s.accountNumber ?? s.accountNumberMasked ?? '—'}
      </dd>
      {s.type === 'BANK' ? (
        <>
          <dt className="text-foreground-muted">Bank</dt>
          <dd className="wrap-anywhere">
            {[s.bankName, s.branchName].filter(Boolean).join(', ') || '—'}
          </dd>
          {s.routingNumber ? (
            <>
              <dt className="text-foreground-muted">Routing</dt>
              <dd className="tabular">{s.routingNumber}</dd>
            </>
          ) : null}
        </>
      ) : null}
      <dt className="text-foreground-muted">Send</dt>
      <dd className="font-semibold">{formatBdt(row.netAmountBdt)}</dd>
    </dl>
  )
}

function SelfWarning({ row }: { row: Withdrawal }) {
  const { admin } = useAuth()
  if (!admin || admin.id !== row.userId) return null
  return (
    <p className="rounded-md bg-warning-soft px-3 py-2 text-body text-warning-foreground">
      This is your own withdrawal. Ask another admin to review it if your team requires
      two people.
    </p>
  )
}

function NoteField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const tooLong = value.length > ADMIN_NOTE_MAX
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Internal note (optional)</Label>
      <Textarea
        id={id}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={tooLong || undefined}
        aria-describedby={`${id}-hint`}
      />
      <p
        id={`${id}-hint`}
        className={
          tooLong
            ? 'text-caption text-danger-foreground'
            : 'text-caption text-foreground-muted'
        }
        role={tooLong ? 'alert' : undefined}
      >
        Only admins see this. Up to {ADMIN_NOTE_MAX} characters ({value.length} now).
      </p>
    </div>
  )
}

function ApproveDialog({ row, onClose }: { row: Withdrawal; onClose: () => void }) {
  const write = useWithdrawalWrite()
  return (
    <ConfirmActionDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Approve withdrawal"
      target={target(row)}
      effect="The request moves to Approved and the host is told. No money moves yet: send it to the account below, then come back and mark it as paid."
      severity="info"
      reason="none"
      confirmLabel="Approve"
      loading={write.isPending}
      details={
        <div className="space-y-3">
          <SelfWarning row={row} />
          <PayTo row={row} />
        </div>
      }
      onConfirm={() => submit(write, { kind: 'approve', id: row.id }, onClose)}
    />
  )
}

function RejectDialog({ row, onClose }: { row: Withdrawal; onClose: () => void }) {
  const write = useWithdrawalWrite()
  const reasonId = useId()
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)

  const text = reason.trim()
  const reasonBad = text.length < REJECT_REASON_MIN || reason.length > REJECT_REASON_MAX
  const invalid = reasonBad || note.length > ADMIN_NOTE_MAX
  const showError = touched && reasonBad

  return (
    <ConfirmActionDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Reject withdrawal"
      target={target(row)}
      effect={`The request is rejected and ${formatDiamonds(row.amount)} diamonds go back to the host's balance straight away. The host sees your reason.`}
      severity="critical"
      reason="none"
      confirmLabel="Reject and refund"
      confirmDisabled={invalid}
      loading={write.isPending}
      details={<SelfWarning row={row} />}
      fields={
        <>
          <div className="space-y-2">
            <Label htmlFor={reasonId}>
              Reason the host sees <span className="text-danger">*</span>
            </Label>
            <Textarea
              id={reasonId}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => reason.length > 0 && setTouched(true)}
              placeholder="The account holder name does not match your verified identity."
              aria-required="true"
              aria-invalid={showError || undefined}
              aria-describedby={`${reasonId}-hint`}
            />
            <p
              id={`${reasonId}-hint`}
              className={
                showError
                  ? 'text-caption text-danger-foreground'
                  : 'text-caption text-foreground-muted'
              }
              role={showError ? 'alert' : undefined}
            >
              {REJECT_REASON_MIN} to {REJECT_REASON_MAX} characters. Shown to the host
              in the app — write it for them.
            </p>
          </div>
          <NoteField value={note} onChange={setNote} />
        </>
      }
      onConfirm={() => {
        setTouched(true)
        if (invalid) return
        submit(
          write,
          { kind: 'reject', id: row.id, rejectReason: text, adminNote: note },
          onClose,
        )
      }}
    />
  )
}

function MarkPaidDialog({ row, onClose }: { row: Withdrawal; onClose: () => void }) {
  const write = useWithdrawalWrite()
  const refId = useId()
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)

  const text = ref.trim()
  const refBad = text.length < TRANSACTION_REF_MIN || text.length > TRANSACTION_REF_MAX
  const invalid = refBad || note.length > ADMIN_NOTE_MAX
  const showError = touched && refBad

  return (
    <ConfirmActionDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Mark as paid"
      target={target(row)}
      effect="Only do this after the money has left your bKash, Nagad, Rocket or bank account. The request is closed as Paid, the held diamonds are released, and the host gets a notification with the TrxID. This cannot be undone."
      severity="warning"
      reason="none"
      confirmLabel="Mark as paid"
      confirmDisabled={invalid}
      loading={write.isPending}
      details={
        <div className="space-y-3">
          <SelfWarning row={row} />
          <PayTo row={row} />
        </div>
      }
      fields={
        <>
          <div className="space-y-2">
            <Label htmlFor={refId}>
              Transaction ID (TrxID) <span className="text-danger">*</span>
            </Label>
            <Input
              id={refId}
              value={ref}
              onChange={(event) => setRef(event.target.value)}
              onBlur={() => ref.length > 0 && setTouched(true)}
              placeholder="e.g. 9K2L7P1QXZ"
              autoComplete="off"
              spellCheck={false}
              aria-required="true"
              aria-invalid={showError || undefined}
              aria-describedby={`${refId}-hint`}
            />
            <p
              id={`${refId}-hint`}
              className={
                showError
                  ? 'text-caption text-danger-foreground'
                  : 'text-caption text-foreground-muted'
              }
              role={showError ? 'alert' : undefined}
            >
              The reference from the payment you sent, {TRANSACTION_REF_MIN} to{' '}
              {TRANSACTION_REF_MAX} characters. The host sees it.
            </p>
          </div>
          <NoteField value={note} onChange={setNote} />
        </>
      }
      onConfirm={() => {
        setTouched(true)
        if (invalid) return
        submit(
          write,
          { kind: 'markPaid', id: row.id, transactionRef: text, adminNote: note },
          onClose,
        )
      }}
    />
  )
}
