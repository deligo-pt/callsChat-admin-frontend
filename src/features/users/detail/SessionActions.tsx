import { useState } from 'react'

import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import type { UserIdentity } from '@/types/identity'

import { revokeAllSessions, revokeSession } from './actions'
import { useUserMutation } from './useUserMutation'

export function RevokeSessionAction({
  user,
  sessionId,
  sessionLabel,
}: {
  user: UserIdentity
  sessionId: string
  sessionLabel: string
}) {
  const [open, setOpen] = useState(false)

  const mutation = useUserMutation({
    userId: user.id,
    mutationFn: (reason: string) => revokeSession(user.id, sessionId, reason),
    successMessage: 'Session revoked.',
    onSuccess: () => setOpen(false),
  })

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Revoke
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Revoke session"
        target={`${sessionLabel} — ${user.displayName}`}
        effect="This device is signed out immediately. Other devices are unaffected."
        severity="warning"
        confirmLabel="Revoke session"
        loading={mutation.isPending}
        onConfirm={(reason) => mutation.mutate(reason)}
      />
    </>
  )
}

export function RevokeAllSessionsAction({
  user,
  activeCount,
}: {
  user: UserIdentity
  activeCount: number
}) {
  const [open, setOpen] = useState(false)

  const mutation = useUserMutation({
    userId: user.id,
    mutationFn: (reason: string) => revokeAllSessions(user.id, reason),
    successMessage: 'All sessions revoked.',
    onSuccess: () => setOpen(false),
  })

  // Nothing to revoke is not an error — just don't offer the action.
  if (activeCount === 0) return null

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Revoke all sessions
      </Button>

      {/*
        ⚠️ The API accepts an empty body here and executes — no reason required,
        unlike every sibling action. The dialog demands one anyway: an
        unattributable mass sign-out is exactly the event an audit trail exists
        for. See the backend asks in plan.md.
      */}
      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Revoke all sessions"
        target={`${user.displayName} (${user.id})`}
        effect={`The user is signed out of all ${activeCount} active session${
          activeCount === 1 ? '' : 's'
        } immediately and must sign in again.`}
        severity="critical"
        confirmLabel="Revoke all"
        loading={mutation.isPending}
        onConfirm={(reason) => mutation.mutate(reason)}
      />
    </>
  )
}
