import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { StaffMember } from '@/types/staff'

import { DeleteAction } from './DeleteAction'
import { ResetPasswordDialog } from './ResetPasswordDialog'
import { RoleAction } from './RoleAction'
import { StatusAction } from './StatusAction'

/**
 * The four mutating actions, gathered where they can be read together.
 *
 * Grouped rather than scattered across the page, and grouped in **ascending
 * consequence** — access, then credentials, then the one-way door. An operator
 * scanning for "suspend" should not have to pass "delete" on the way, and the
 * separated danger row means the destructive control is never adjacent to the
 * one somebody actually came for.
 *
 * What every action here has in common is that it ends sessions. Three of the
 * four sign the person out of every device immediately, and the fourth —
 * demotion — is the only one that does not. The card says so once at the top
 * instead of four times over.
 */
export function LifecycleCard({ member }: { member: StaffMember }) {
  const [resetOpen, setResetOpen] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account actions</CardTitle>
        <CardDescription>
          Suspending, banning and resetting a password each end every session this
          account holds, on every device, immediately. Changing a role does not.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <StatusAction member={member} />
          <RoleAction member={member} />
          <Button type="button" variant="secondary" onClick={() => setResetOpen(true)}>
            Reset password
          </Button>
        </div>

        {/* Separated, so the one-way door is never next to a routine action. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
          <DeleteAction member={member} />
          <p className="text-caption text-foreground-muted">
            Permanent. The record stays in the directory, marked Deleted.
          </p>
        </div>
      </CardContent>

      {/*
       * Mounted only while open, so the revealed password cannot survive a
       * close — "shown once" holds by construction (§3.5).
       */}
      {resetOpen ? (
        <ResetPasswordDialog member={member} open onOpenChange={setResetOpen} />
      ) : null}
    </Card>
  )
}
