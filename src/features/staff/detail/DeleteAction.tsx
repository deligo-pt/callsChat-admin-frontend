import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { ROUTES } from '@/app/routes'
import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import type { StaffMember } from '@/types/staff'

import { useDeleteStaffMutation } from '../useStaff'

/**
 * Close an account permanently — `DELETE /:id`.
 *
 * A one-way door: there is no un-delete route, and `PATCH /:id/status` on a
 * deleted id answers `404`, so it cannot be reactivated back into existence
 * either. Hence the typed name — the pattern this panel reserves for actions
 * with no way back.
 *
 * The copy is exact about the part that surprises people: **the row does not
 * disappear.** The backend does not filter `deletedAt` from its reads (§3.4),
 * so the person stays in the directory marked *Deleted*. Said beforehand it
 * reads as an audit-trail feature, which is what it is; discovered afterwards
 * it reads as a delete that failed.
 *
 * `reason="none"`: `DELETE` takes no body at all.
 */
export function DeleteAction({ member }: { member: StaffMember }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const mutation = useDeleteStaffMutation(member.id)

  return (
    <>
      <Button type="button" variant="danger" onClick={() => setOpen(true)}>
        Delete account
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete staff member"
        target={`${member.displayName} (${member.username})`}
        effect={`${member.displayName}'s account is closed permanently and cannot be restored. Their record stays in this list, marked Deleted, so past actions remain attributable.`}
        severity="critical"
        reason="none"
        typedConfirmation={member.displayName}
        confirmLabel="Delete account"
        loading={mutation.isPending}
        onConfirm={() => {
          mutation.mutate(undefined, {
            onSuccess: () => {
              setOpen(false)
              toast.success(`${member.displayName}'s account is closed.`)
              /*
               * Back to the directory: this page would now offer nothing but
               * disabled controls, and the row the operator should see — still
               * present, marked Deleted — is on the list.
               */
              void navigate(ROUTES.staff)
            },
          })
        }}
      />
    </>
  )
}
