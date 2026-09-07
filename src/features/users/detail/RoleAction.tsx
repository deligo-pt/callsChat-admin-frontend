import { useState } from 'react'

import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { humaniseEnum } from '@/lib/status'
import { userRoleSchema, type UserIdentity, type UserRole } from '@/types/identity'

import { changeUserRole } from './actions'
import { useUserMutation } from './useUserMutation'

const ROLES = userRoleSchema.options

/** Roles that grant access to this admin panel. */
const PRIVILEGED: readonly UserRole[] = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN']

/**
 * Change a user's platform role.
 *
 * Gated on `users.change_role`, which only Super Admin holds: moving an
 * account to ADMIN or SUPER_ADMIN grants access to this panel, so it is
 * privilege escalation rather than ordinary user management.
 */
export function RoleAction({ user }: { user: UserIdentity }) {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<string>(user.role)

  const mutation = useUserMutation({
    userId: user.id,
    mutationFn: (reason: string) => changeUserRole(user.id, role as UserRole, reason),
    successMessage: 'Role changed.',
    onSuccess: () => setOpen(false),
  })

  const unchanged = role === user.role
  const escalating =
    PRIVILEGED.includes(role as UserRole) && !PRIVILEGED.includes(user.role)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Change role
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setRole(user.role)
        }}
        title="Change platform role"
        target={`${user.displayName} (${user.id})`}
        effect={
          escalating
            ? 'This grants the account access to the admin panel.'
            : 'This changes what the account can do on the platform.'
        }
        severity={escalating ? 'critical' : 'warning'}
        /*
         * Typing the user ID is required only when the change grants admin
         * access. Ordinary demotions do not need that friction, and adding it
         * everywhere would train operators to type past it without reading.
         */
        {...(escalating ? { typedConfirmation: user.id } : {})}
        confirmLabel="Change role"
        loading={mutation.isPending}
        // Confirming a no-op change would produce a meaningless audit entry.
        confirmDisabled={unchanged}
        onConfirm={(reason) => mutation.mutate(reason)}
        fields={
          <div className="space-y-2">
            <Label htmlFor="role-select">
              New role <span className="text-danger">*</span>
            </Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="role-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {humaniseEnum(value)}
                    {value === user.role ? ' (current)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {unchanged ? (
              <p className="text-caption text-foreground-muted">
                Select a different role to continue.
              </p>
            ) : null}

            {escalating ? (
              <p className="rounded-md bg-danger-soft px-3 py-2 text-caption text-danger-foreground">
                {humaniseEnum(role)} can sign in to the CallsChat admin panel.
              </p>
            ) : null}
          </div>
        }
      />
    </>
  )
}
