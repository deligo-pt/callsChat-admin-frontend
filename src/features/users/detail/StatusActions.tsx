import { useState } from 'react'

import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { humaniseEnum } from '@/lib/status'
import {
  suspensionReasonSchema,
  type SuspensionReason,
  type UserIdentity,
} from '@/types/identity'

import {
  availableStatusActions,
  banUser,
  restoreUser,
  suspendUser,
  unsuspendUser,
  type UserAction,
} from './actions'
import { useUserMutation } from './useUserMutation'

const SUSPENSION_REASONS = suspensionReasonSchema.options

/** Named rather than `options[0]` so the default is a deliberate choice. */
const DEFAULT_SUSPENSION_REASON: SuspensionReason = 'POLICY_VIOLATION'

/** `datetime-local` gives back a local string; the API wants ISO-8601 UTC. */
function toIso(localValue: string): string | undefined {
  if (!localValue) return undefined
  const parsed = new Date(localValue)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

/** Now, formatted for a `datetime-local` min attribute. */
function nowLocal(): string {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

interface Props {
  user: UserIdentity
  can: {
    suspend: boolean
    ban: boolean
  }
}

/**
 * Account-status actions: suspend, unsuspend, ban, restore.
 *
 * Only the transitions legal from the current status are offered — see
 * `availableStatusActions` for why that map lives client-side.
 */
export function StatusActions({ user, can }: Props) {
  const [openAction, setOpenAction] = useState<UserAction | null>(null)

  // Suspend-only parameters.
  const [category, setCategory] = useState<string>(DEFAULT_SUSPENSION_REASON)
  const [expiresAt, setExpiresAt] = useState('')
  const [revokeSessions, setRevokeSessions] = useState(true)

  const close = () => setOpenAction(null)
  const target = `${user.displayName} (${user.id})`

  const suspend = useUserMutation({
    userId: user.id,
    mutationFn: (reason: string) =>
      suspendUser(user.id, {
        reason: category as SuspensionReason,
        description: reason,
        ...(toIso(expiresAt) ? { expiresAt: toIso(expiresAt)! } : {}),
        revokeSessions,
      }),
    successMessage: 'User suspended.',
    onSuccess: close,
  })

  const unsuspend = useUserMutation({
    userId: user.id,
    mutationFn: (reason: string) => unsuspendUser(user.id, reason),
    successMessage: 'Suspension lifted.',
    onSuccess: close,
  })

  const ban = useUserMutation({
    userId: user.id,
    mutationFn: (reason: string) => banUser(user.id, reason),
    successMessage: 'User banned.',
    onSuccess: close,
  })

  const restore = useUserMutation({
    userId: user.id,
    mutationFn: (reason: string) => restoreUser(user.id, reason),
    successMessage: 'User restored.',
    onSuccess: close,
  })

  const allowed = availableStatusActions(user.status)
  const show = (action: UserAction) => allowed.includes(action)

  return (
    <>
      {show('suspend') && can.suspend ? (
        <Button variant="outline" size="sm" onClick={() => setOpenAction('suspend')}>
          Suspend
        </Button>
      ) : null}

      {show('unsuspend') && can.suspend ? (
        <Button variant="outline" size="sm" onClick={() => setOpenAction('unsuspend')}>
          Lift suspension
        </Button>
      ) : null}

      {show('ban') && can.ban ? (
        <Button variant="danger" size="sm" onClick={() => setOpenAction('ban')}>
          Ban
        </Button>
      ) : null}

      {show('restore') && can.ban ? (
        <Button variant="outline" size="sm" onClick={() => setOpenAction('restore')}>
          Restore account
        </Button>
      ) : null}

      {/* ------------------------------------------------------- Suspend */}
      <ConfirmActionDialog
        open={openAction === 'suspend'}
        onOpenChange={(open) => (open ? undefined : close())}
        title="Suspend user"
        target={target}
        effect="The account is suspended immediately. The user cannot sign in until the suspension is lifted."
        severity="warning"
        confirmLabel="Suspend"
        loading={suspend.isPending}
        onConfirm={(reason) => suspend.mutate(reason)}
        fields={
          <>
            <div className="space-y-2">
              <Label htmlFor="suspend-category">
                Category <span className="text-danger">*</span>
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="suspend-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUSPENSION_REASONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humaniseEnum(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-foreground-muted">
                The reason below is recorded as the description alongside this category.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="suspend-expires">Ends at (optional)</Label>
              <Input
                id="suspend-expires"
                type="datetime-local"
                value={expiresAt}
                min={nowLocal()}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <p className="text-caption text-foreground-muted">
                Leave empty for an indefinite suspension.
              </p>
            </div>

            {/* plan.md Phase 3: suspend offers an optional session revocation. */}
            <div className="flex items-start gap-2">
              <Checkbox
                id="suspend-revoke"
                checked={revokeSessions}
                onCheckedChange={(checked) => setRevokeSessions(checked === true)}
              />
              <Label htmlFor="suspend-revoke" className="font-normal">
                Sign the user out of all devices now
              </Label>
            </div>
          </>
        }
      />

      {/* ---------------------------------------------------- Unsuspend */}
      <ConfirmActionDialog
        open={openAction === 'unsuspend'}
        onOpenChange={(open) => (open ? undefined : close())}
        title="Lift suspension"
        target={target}
        effect="The account returns to active and the user can sign in again."
        severity="info"
        confirmLabel="Lift suspension"
        loading={unsuspend.isPending}
        onConfirm={(reason) => unsuspend.mutate(reason)}
      />

      {/* ---------------------------------------------------------- Ban */}
      <ConfirmActionDialog
        open={openAction === 'ban'}
        onOpenChange={(open) => (open ? undefined : close())}
        title="Ban user"
        target={target}
        effect="The account is banned and the user cannot sign in. Only a restore can reverse this."
        severity="critical"
        /*
         * A ban is the most severe action in this module, so it requires the
         * operator to type the user's ID — enough friction to stop a misclick
         * on the wrong row (plan.md §Recommended Screen Pattern).
         */
        typedConfirmation={user.id}
        confirmLabel="Ban user"
        loading={ban.isPending}
        onConfirm={(reason) => ban.mutate(reason)}
      />

      {/* ------------------------------------------------------ Restore */}
      <ConfirmActionDialog
        open={openAction === 'restore'}
        onOpenChange={(open) => (open ? undefined : close())}
        title="Restore account"
        target={target}
        effect="The ban is lifted and the user can sign in again."
        severity="warning"
        confirmLabel="Restore"
        loading={restore.isPending}
        onConfirm={(reason) => restore.mutate(reason)}
      />
    </>
  )
}
