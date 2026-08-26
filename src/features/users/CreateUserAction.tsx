import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { queryKeys } from '@/api/queryKeys'
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
import { humaniseEnum } from '@/lib/status'
import { accountTypeSchema, type AccountType } from '@/types/identity'

import { createUser } from './api'

/** Only these two are accepted at creation time — not SUSPENDED or BANNED. */
const CREATE_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE'] as const

const MIN_PASSWORD_LENGTH = 6
const PHONE_PATTERN = /^\+?[0-9\s()-]{6,20}$/

/**
 * Provision a new account — `POST /admin/users`.
 *
 * Deliberately restricted:
 *
 *   - **No role selector.** The endpoint accepts `role`, including
 *     `SUPER_ADMIN`, which would let this form mint an administrator in one
 *     step with no typed confirmation. New accounts are always created as
 *     `USER`; promoting one is a separate, Super-Admin-only action with its own
 *     confirmation (`RoleAction`). Creating and escalating should never be the
 *     same click.
 *   - **Defaults to `PENDING_VERIFICATION`**, so a provisioned account still
 *     goes through the normal verification path unless an operator explicitly
 *     chooses otherwise.
 */
export function CreateUserAction() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accountType, setAccountType] = useState<string>('PERSONAL')
  const [status, setStatus] = useState<string>('PENDING_VERIFICATION')

  const nameInvalid = displayName.trim() === ''
  /*
   * The backend does NOT validate phone format — it accepted "notaphone" and
   * created the account. This check is the only thing preventing an
   * unreachable record, and there is no delete endpoint to undo one.
   */
  const phoneInvalid = !PHONE_PATTERN.test(phone.trim())
  const emailInvalid =
    email.trim() !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const passwordInvalid = password !== '' && password.length < MIN_PASSWORD_LENGTH

  const invalid = nameInvalid || phoneInvalid || emailInvalid || passwordInvalid

  const mutation = useMutation({
    mutationFn: () =>
      createUser({
        displayName: displayName.trim(),
        phone: phone.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(password ? { password } : {}),
        accountType: accountType as AccountType,
        status: status as (typeof CREATE_STATUSES)[number],
      }),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })
      toast.success('Account created.')
      setOpen(false)
      setDisplayName('')
      setPhone('')
      setEmail('')
      setPassword('')
    },
    onError: (error) => {
      toast.error(
        isAppError(error) ? error.message : 'The account could not be created.',
      )
    },
  })

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plus /> Add user
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Create a user account"
        target={displayName.trim() || 'New account'}
        effect="A new account is created immediately. There is no way to delete it afterwards — only suspend or ban."
        severity="warning"
        confirmLabel="Create account"
        loading={mutation.isPending}
        confirmDisabled={invalid}
        onConfirm={() => mutation.mutate()}
        fields={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="create-name">
                Display name <span className="text-danger">*</span>
              </Label>
              <Input
                id="create-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                aria-invalid={nameInvalid || undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-phone">
                Phone <span className="text-danger">*</span>
              </Label>
              <Input
                id="create-phone"
                value={phone}
                placeholder="+8801712345678"
                onChange={(event) => setPhone(event.target.value)}
                aria-invalid={(phone !== '' && phoneInvalid) || undefined}
              />
              {phone !== '' && phoneInvalid ? (
                <p role="alert" className="text-caption text-danger">
                  Enter a valid phone number. The server does not check this and
                  accounts cannot be deleted, so a typo here is permanent.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-email">Email (optional)</Label>
              <Input
                id="create-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={emailInvalid || undefined}
              />
              {emailInvalid ? (
                <p role="alert" className="text-caption text-danger">
                  Enter a valid email address.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-password">Password (optional)</Label>
              <Input
                id="create-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={passwordInvalid || undefined}
              />
              <p className="text-caption text-foreground-muted">
                {passwordInvalid
                  ? `At least ${MIN_PASSWORD_LENGTH} characters.`
                  : 'Leave empty to let the user set their own.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-type">Account type</Label>
              <Select value={accountType} onValueChange={setAccountType}>
                <SelectTrigger id="create-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountTypeSchema.options.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humaniseEnum(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-status">Initial status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="create-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATE_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humaniseEnum(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/*
              Stated plainly rather than buried: new accounts are ordinary
              users, and admin access is a separate deliberate step.
            */}
            <p className="text-caption text-foreground-muted md:col-span-2">
              The account is created as a standard user. Granting moderator or admin
              access is a separate action.
            </p>
          </div>
        }
      />
    </>
  )
}
