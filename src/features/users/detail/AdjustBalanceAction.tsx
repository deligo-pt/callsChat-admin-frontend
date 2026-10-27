import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { adjustWallet } from '@/api/wallet'
import { isAppError } from '@/api/errors'
import { ConfirmActionDialog } from '@/components/feedback'
import { FormField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import {
  adjustmentFormSchema,
  buildAdjustPayload,
  signedAmount,
  type AdjustmentDirection,
} from '@/types/wallet'
import type { UserIdentity } from '@/types/identity'

/**
 * Credit or debit this user's diamond balance.
 *
 * ⚠️ **The only control in the panel that creates diamonds from nothing**, and
 * there is no reversal endpoint: undoing an adjustment means making another in
 * the opposite direction, which is a second permanent ledger row rather than a
 * correction. `diamonds.adjust` is Super-Admin-only for exactly that reason —
 * the same shape as `RoleAction`, which also lives on this page and also
 * nobody below Super Admin can see.
 *
 * ⚠️ **It belongs here, not on a page of its own** (plan.md §4.2, revised
 * 2026-10-27). `POST /admin/wallet/adjust` takes an opaque `userId`, and a
 * standalone form had no way to show whose account that was — it had to warn
 * the operator that it could not verify the ID. On this screen the name, the
 * two balances and the restriction history are already in front of them, so
 * the risk that warning covered simply does not arise.
 *
 * ⚠️ **Direction and magnitude are separate fields.** The API takes one signed
 * `amount`, so a single input would have been a thinner form and a worse one:
 * a minus sign is one keystroke, invisible at a glance in a numeric field, and
 * losing it turns a 500-diamond clawback into a 500-diamond gift. The
 * dangerous choice is made with a control that names it.
 */
export function AdjustBalanceAction({ user }: { user: UserIdentity }) {
  const baseId = useId()
  const field = (name: string) => `${baseId}-${name}`

  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const [direction, setDirection] = useState<AdjustmentDirection>('CREDIT')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({ mutationFn: adjustWallet })

  const values = { userId: user.id, direction, amount, note }

  /** The exact string the operator must retype to confirm. */
  const preview =
    amount && Number.isFinite(Number(amount)) ? String(signedAmount(values)) : ''

  function reset() {
    setDirection('CREDIT')
    setAmount('')
    setNote('')
    setErrors({})
  }

  function review() {
    const parsed = adjustmentFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '')
        if (key && !next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    setConfirming(true)
  }

  function submit() {
    const parsed = adjustmentFormSchema.safeParse(values)
    if (!parsed.success) return

    mutation.mutate(buildAdjustPayload(parsed.data), {
      onSuccess: () => {
        toast.success(
          `${signedAmount(values) < 0 ? 'Debited' : 'Credited'} ${Math.abs(
            Number(amount),
          )} diamonds.`,
        )
        setConfirming(false)
        setOpen(false)
        reset()
      },
      onError: (error) => {
        /*
         * ⚠️ The confirmation closes but the form keeps everything, so a
         * refused adjustment does not cost the operator the note they wrote —
         * the one field nobody can retype from memory.
         */
        setConfirming(false)
        toast.error(
          isAppError(error) ? error.message : 'The adjustment could not be applied.',
        )
      },
    })
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Adjust the diamond balance for ${user.displayName}`}
      >
        Adjust balance
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
        title="Adjust diamond balance"
        target={`${user.displayName} (${user.id})`}
        effect="This changes their spendable diamond balance immediately and writes a permanent row to the ledger under your name. The panel has no endpoint for reading balances back, so nothing on this page will update afterwards."
        severity="critical"
        confirmLabel="Review adjustment"
        /*
         * ⚠️ `reason: 'none'` — the note below is the audit record and is
         * already required. Asking twice would imply two different fields.
         */
        reason="none"
        confirmDisabled={mutation.isPending}
        fields={
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Direction</Label>
              <RadioGroup
                value={direction}
                onValueChange={(next) => setDirection(next as AdjustmentDirection)}
                className="grid gap-3 sm:grid-cols-2"
              >
                <label
                  htmlFor={field('credit')}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
                >
                  <RadioGroupItem
                    id={field('credit')}
                    value="CREDIT"
                    className="mt-0.5"
                  />
                  <span className="space-y-0.5">
                    <span className="block font-medium">Credit</span>
                    <span className="block text-caption text-foreground-muted">
                      Add diamonds.
                    </span>
                  </span>
                </label>

                <label
                  htmlFor={field('debit')}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
                >
                  <RadioGroupItem
                    id={field('debit')}
                    value="DEBIT"
                    className="mt-0.5"
                  />
                  <span className="space-y-0.5">
                    <span className="block font-medium">Debit</span>
                    <span className="block text-caption text-foreground-muted">
                      Take diamonds away. Refused below zero.
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            <FormField
              id={field('amount')}
              label="Amount"
              required
              hint="Whole diamonds. Enter a positive number — the direction decides the sign."
              error={errors['amount']}
            >
              <Input
                id={field('amount')}
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </FormField>

            <FormField
              id={field('note')}
              label="Note"
              required
              /*
               * ⚠️ The server accepts one character. This is the only
               * explanation anyone auditing the ledger will ever see, and
               * nobody can ask a follow-up question later.
               */
              hint="Why this is being made. Written to the ledger permanently — write it for whoever reads the audit."
              error={errors['note']}
            >
              <Textarea
                id={field('note')}
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </FormField>
          </div>
        }
        onConfirm={review}
      />

      <ConfirmActionDialog
        open={confirming}
        onOpenChange={(next) => !next && setConfirming(false)}
        title={direction === 'DEBIT' ? 'Debit this wallet' : 'Credit this wallet'}
        target={`${user.displayName} (${user.id})`}
        effect={`This writes ${preview} diamonds to their balance immediately and records it in the ledger under your name. There is no reversal — undoing it means a second adjustment in the opposite direction.`}
        severity="critical"
        confirmLabel={direction === 'DEBIT' ? 'Debit the wallet' : 'Credit the wallet'}
        loading={mutation.isPending}
        reason="none"
        /*
         * ⚠️ The typed confirmation is the **signed** amount, so the operator
         * retypes the minus sign the form never asked them for. It is the last
         * point at which a debit can be caught being a credit.
         */
        typedConfirmation={preview}
        onConfirm={submit}
      />
    </>
  )
}
