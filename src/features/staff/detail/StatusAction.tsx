import { useState } from 'react'

import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import type { SettableStaffStatus, StaffMember } from '@/types/staff'

import { useStaffStatusMutation } from '../useStaff'

/**
 * Suspend · ban · reactivate — `PATCH /:id/status`.
 *
 * Copy leads with the **consequence**, not the label, because the consequence
 * is immediate and an operator may not expect it: a suspension does not merely
 * flag the account, it destroys every session it holds on every device before
 * the dialog closes.
 *
 * `reason` is mandatory here and optional to the server (§3.6) — but the hint
 * does not claim it lands in an audit log, because for staff there is no audit
 * endpoint and the record carries no `statusReason`. Promising a history the
 * operator cannot consult would be the easiest lie in this module to tell.
 */

interface Transition {
  readonly status: SettableStaffStatus
  readonly label: string
  readonly title: string
  readonly effect: (name: string) => string
  readonly severity: 'warning' | 'critical'
}

const SUSPEND: Transition = {
  status: 'SUSPENDED',
  label: 'Suspend',
  title: 'Suspend staff member',
  effect: (name) =>
    `${name} will be signed out on every device immediately and will not be able to sign back in. Suspension is reversible.`,
  severity: 'warning',
}

const BAN: Transition = {
  status: 'BANNED',
  label: 'Ban',
  title: 'Ban staff member',
  effect: (name) =>
    `${name} will be signed out on every device immediately and will not be able to sign back in. Treat this as permanent, even though the API can reverse it.`,
  severity: 'critical',
}

const REACTIVATE: Transition = {
  status: 'ACTIVE',
  label: 'Reactivate',
  title: 'Reactivate staff member',
  /* Says what it does NOT do — the sessions are gone for good. */
  effect: (name) =>
    `${name} will be able to sign in again with their existing password. Their previous sessions are not restored.`,
  severity: 'warning',
}

/** What can be done from where. `INACTIVE` is absent: deleted is a dead end. */
function transitionsFor(status: StaffMember['status']): readonly Transition[] {
  if (status === 'ACTIVE') return [SUSPEND, BAN]
  if (status === 'SUSPENDED') return [REACTIVATE, BAN]
  if (status === 'BANNED') return [REACTIVATE]
  return []
}

export function StatusAction({ member }: { member: StaffMember }) {
  const [pending, setPending] = useState<Transition | null>(null)
  const mutation = useStaffStatusMutation(member.id)

  return (
    <>
      {transitionsFor(member.status).map((transition) => (
        <Button
          key={transition.status}
          type="button"
          variant={transition.severity === 'critical' ? 'danger' : 'secondary'}
          onClick={() => setPending(transition)}
        >
          {transition.label}
        </Button>
      ))}

      <ConfirmActionDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={pending?.title ?? ''}
        target={`${member.displayName} (${member.username})`}
        effect={pending?.effect(member.displayName) ?? ''}
        severity={pending?.severity ?? 'warning'}
        confirmLabel={pending?.label ?? 'Confirm'}
        loading={mutation.isPending}
        /*
         * Deliberately not the default hint. There is no staff audit trail and
         * no field on the record that reads this back (§3.6, backend ask #3).
         */
        reasonHint="A reason of at least 10 characters is required. It is sent with the change, but this panel cannot show it again afterwards."
        onConfirm={(reason) => {
          if (!pending) return
          mutation.mutate(
            { status: pending.status, reason },
            { onSuccess: () => setPending(null) },
          )
        }}
      />
    </>
  )
}
