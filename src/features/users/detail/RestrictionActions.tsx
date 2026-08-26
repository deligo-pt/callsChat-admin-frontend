import { Plus } from 'lucide-react'
import { useState } from 'react'

import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { resolveStatus } from '@/lib/status'
import { CAPABILITY_VALUES, type Capability, type UserIdentity } from '@/types/identity'

/** Named rather than `CAPABILITY_VALUES[0]` so the default is deliberate. */
const DEFAULT_CAPABILITY: Capability = 'MESSAGING'

import { addRestriction, removeRestriction } from './actions'
import { useUserMutation } from './useUserMutation'

function toIso(localValue: string): string | undefined {
  if (!localValue) return undefined
  const parsed = new Date(localValue)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

function nowLocal(): string {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

/**
 * Add a capability restriction.
 *
 * plan.md Phase 3 "Rules enforced": a restriction is NOT an account status.
 * Blocking gifting leaves the account active — which is exactly why this lives
 * in its own control with its own wording rather than beside suspend and ban.
 */
export function AddRestrictionAction({ user }: { user: UserIdentity }) {
  const [open, setOpen] = useState(false)
  const [capability, setCapability] = useState<string>(DEFAULT_CAPABILITY)
  const [expiresAt, setExpiresAt] = useState('')

  const mutation = useUserMutation({
    userId: user.id,
    mutationFn: (reason: string) =>
      addRestriction(user.id, {
        capability: capability as Capability,
        reason,
        ...(toIso(expiresAt) ? { expiresAt: toIso(expiresAt)! } : {}),
      }),
    successMessage: 'Restriction applied.',
    onSuccess: () => setOpen(false),
  })

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus /> Add restriction
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Restrict a capability"
        target={`${user.displayName} (${user.id})`}
        effect="The selected feature is blocked for this account. The account status is not changed."
        severity="warning"
        confirmLabel="Apply restriction"
        loading={mutation.isPending}
        onConfirm={(reason) => mutation.mutate(reason)}
        fields={
          /* plan.md §6.3: 1 column below md, 2 above. */
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="restriction-capability">
                Capability <span className="text-danger">*</span>
              </Label>
              <Select value={capability} onValueChange={setCapability}>
                <SelectTrigger id="restriction-capability" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAPABILITY_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {resolveStatus('restriction', value).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="restriction-expires">Ends at (optional)</Label>
              <Input
                id="restriction-expires"
                type="datetime-local"
                value={expiresAt}
                min={nowLocal()}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <p className="text-caption text-foreground-muted">
                Leave empty for an indefinite restriction.
              </p>
            </div>
          </div>
        }
      />
    </>
  )
}

export function RemoveRestrictionAction({
  user,
  restrictionId,
  label,
}: {
  user: UserIdentity
  restrictionId: string
  label: string
}) {
  const [open, setOpen] = useState(false)

  const mutation = useUserMutation({
    userId: user.id,
    mutationFn: (reason: string) => removeRestriction(user.id, restrictionId, reason),
    successMessage: 'Restriction removed.',
    onSuccess: () => setOpen(false),
  })

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Remove
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove restriction"
        target={`${label} — ${user.displayName}`}
        effect="The capability becomes available to this account again."
        severity="info"
        confirmLabel="Remove"
        loading={mutation.isPending}
        onConfirm={(reason) => mutation.mutate(reason)}
      />
    </>
  )
}
