import { AlertTriangle, Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { formLevelMessage } from '@/api/formErrors'
import { FormField, PasswordRules } from '@/components/form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PasswordInput } from '@/components/ui/password-input'
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard'
import { useReturnFocus } from '@/lib/hooks/useReturnFocus'
import { passwordSchema } from '@/lib/passwordPolicy'
import type { StaffMember } from '@/types/staff'

import { useResetStaffPasswordMutation } from '../useStaff'
import { generatePassword } from './generatePassword'

/**
 * The one bespoke dialog in this module (staff_management_plan.md §5.6).
 *
 * `ConfirmActionDialog` cannot do this, and not because of styling: this flow
 * has a **second act**. It has to show the operator a value that exists only
 * after the request succeeded, and hold it on screen until they say they have
 * it.
 *
 * Three rules, each one a way this could quietly go wrong:
 *
 * 1. **The password is revealed only after a `200`.** Showing it first would
 *    leave the operator holding a credential for a call that failed — and
 *    confidently giving somebody a password that was never set.
 * 2. **It is shown exactly once.** There is no endpoint that reads a password
 *    back, so closing really does destroy the only copy, and the dialog says
 *    so rather than letting the operator find out.
 * 3. **There is no email.** No invite, no reset link, no forced change on next
 *    login (§3.5). Whoever runs this is the delivery channel, and if they do
 *    not know that, the colleague is simply locked out.
 */
export function ResetPasswordDialog({
  member,
  open,
  onOpenChange,
}: {
  member: StaffMember
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const returnFocus = useReturnFocus(open)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      /*
       * A child component, so Radix unmounts it on close. That is what makes
       * "shown once" true by construction rather than by discipline: the
       * revealed password is component state, and there is no path that
       * reopens the dialog holding it.
       */
    >
      <DialogContent
        className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[560px]"
        /* State-driven, so Radix has no trigger to restore focus to. */
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus()
        }}
      >
        <ResetPasswordForm member={member} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordForm({
  member,
  onClose,
}: {
  member: StaffMember
  onClose: () => void
}) {
  const mutation = useResetStaffPasswordMutation(member.id)
  const { copied, copy } = useCopyToClipboard()

  const [manual, setManual] = useState(false)
  const [typed, setTyped] = useState('')
  const [generated] = useState(generatePassword)
  /** Set only after a 200 — this is the whole second act. */
  const [revealed, setRevealed] = useState<string | null>(null)

  const candidate = manual ? typed : generated
  const typedError = manual ? passwordSchema.safeParse(typed).error : undefined
  const error = formLevelMessage(
    mutation.error,
    'The password could not be reset. Their existing password still works.',
  )

  if (revealed) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="text-h3">
            {member.displayName}&rsquo;s new password
          </DialogTitle>
          <DialogDescription className="text-body">
            Every session they had has ended. They can sign in with this now.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-body break-all">
              {revealed}
            </code>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void copy(revealed)}
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <Alert>
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>
              This is the only time this password is shown. There is no reset email —
              you have to give it to {member.displayName} yourself. Closing this dialog
              destroys the only copy.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            I have saved it
          </Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-h3">
          Reset password for {member.displayName}
        </DialogTitle>
        <DialogDescription className="text-body">
          Sets a new password immediately and signs {member.displayName} out of every
          device. They are not notified — you will need to pass it on yourself.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 space-y-4 overflow-y-auto">
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {manual ? (
          <>
            <FormField
              id="new-password"
              label="New password"
              required
              error={typed === '' ? undefined : typedError?.issues[0]?.message}
            >
              <PasswordInput
                id="new-password"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="new-password"
              />
            </FormField>
            {/* The panel's rule; the server's is length ≥ 8 and nothing else. */}
            <PasswordRules value={typed} />
          </>
        ) : (
          <div className="space-y-2">
            <span className="block text-body-strong">Generated password</span>
            <code className="block rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-body break-all">
              {generated}
            </code>
            <p className="text-caption text-foreground-muted">
              Shown here so you can see it before committing. It is not set until you
              confirm.
            </p>
          </div>
        )}

        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={() => setManual((current) => !current)}
        >
          {manual ? 'Use a generated password instead' : 'Enter my own instead'}
        </Button>
      </div>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          loading={mutation.isPending}
          disabled={manual && typedError !== undefined}
          onClick={() => {
            mutation.mutate(candidate, {
              /* Revealed only now — never before the server agreed. */
              onSuccess: () => setRevealed(candidate),
            })
          }}
        >
          Reset password
        </Button>
      </DialogFooter>
    </>
  )
}
