import { useState } from 'react'

import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { resolveStatus } from '@/lib/status'
import type { StaffMember, StaffRole } from '@/types/staff'

import { useStaffRoleMutation } from '../useStaff'

/**
 * Promote or demote — `PATCH /:id/role`.
 *
 * Two roles means one control, not a picker: whichever they are not is the
 * only place to go.
 *
 * The copy states the two things the API does not. **Permissions do not
 * change** — verified, the probe account kept both of its module keys across a
 * promotion, so role and access are independent axes here and an operator
 * expecting a promotion to widen access would be wrong. And it **takes effect
 * on their next request**, not instantly for a session already in flight.
 *
 * `reason="none"`: this endpoint has no reason field. Collecting ten characters
 * the client would then discard implies a record that is never sent.
 */
export function RoleAction({ member }: { member: StaffMember }) {
  const [open, setOpen] = useState(false)
  const mutation = useStaffRoleMutation(member.id)

  const next: StaffRole = member.role === 'ADMIN' ? 'MODERATOR' : 'ADMIN'
  const nextLabel = resolveStatus('staffRole', next).label
  const verb = next === 'ADMIN' ? 'Promote' : 'Demote'

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {verb} to {nextLabel}
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title={`${verb} to ${nextLabel}`}
        target={`${member.displayName} (${member.username})`}
        effect={`${member.displayName} becomes ${nextLabel}. Their module access is unchanged — role and permissions are separate here, so this neither grants nor removes anything. It takes effect on their next request.`}
        severity="warning"
        reason="none"
        confirmLabel={verb}
        loading={mutation.isPending}
        onConfirm={() => {
          mutation.mutate(next, { onSuccess: () => setOpen(false) })
        }}
      />
    </>
  )
}
