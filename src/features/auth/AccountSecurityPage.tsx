import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { isAppError, UnauthorizedError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { changeEmail, changePassword, signOut } from '@/auth/session'
import { PasswordRules } from '@/components/form'
import { PageHeader } from '@/components/display'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { ADMIN_ROLE_LABELS } from '@/types/identity'

import {
  changeEmailSchema,
  changePasswordSchema,
  type ChangeEmailValues,
  type ChangePasswordValues,
} from './passwordPolicy'
import { SignOutAllDevicesCard } from './SignOutAllDevicesCard'

/**
 * Turn an API error into something an operator can act on.
 *
 * Both endpoints answer a wrong current password with a 401. That must NOT be
 * treated as an expired session — the operator is signed in perfectly well,
 * they simply mistyped. Saying "your session expired" and bouncing them to the
 * login screen would be both wrong and infuriating.
 */
function credentialErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof UnauthorizedError) {
    return 'That current password is not correct.'
  }
  if (isAppError(error)) return error.message
  return fallback
}

function FieldError({ id, message }: { id: string; message?: string | undefined }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-caption text-danger">
      {message}
    </p>
  )
}

function ChangePasswordForm() {
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  /*
   * `useWatch` rather than `form.watch()` — the latter returns a fresh function
   * each render and cannot be memoized safely, which the lint rule flags.
   */
  const newPassword = useWatch({ control: form.control, name: 'newPassword' })

  const mutation = useMutation({
    mutationFn: changePassword,
    retry: false,
    onSuccess: async () => {
      form.reset()
      /*
       * Changing a password ends the session deliberately. The backend keeps
       * the old access token valid, so staying signed in would mean a
       * credential minted under the previous password still works — exactly
       * what someone changing a password after a suspected compromise is
       * trying to stop.
       */
      toast.success('Password changed. Sign in again with your new password.')
      await signOut()
      window.location.assign('/login')
    },
  })

  const serverMessage = mutation.error
    ? credentialErrorMessage(mutation.error, 'The password could not be changed.')
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>Change password</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-5"
          noValidate
        >
          {serverMessage ? (
            <p
              role="alert"
              className="rounded-md bg-danger-soft px-3 py-2 text-body text-danger-foreground"
            >
              {serverMessage}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <PasswordInput
              id="currentPassword"
              autoComplete="current-password"
              aria-invalid={Boolean(form.formState.errors.currentPassword) || undefined}
              aria-describedby="currentPassword-error"
              {...form.register('currentPassword')}
            />
            <FieldError
              id="currentPassword-error"
              message={form.formState.errors.currentPassword?.message}
            />
          </div>

          {/* 1 column below md, 2 above (plan.md §6.3). */}
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <PasswordInput
                id="newPassword"
                autoComplete="new-password"
                aria-invalid={Boolean(form.formState.errors.newPassword) || undefined}
                aria-describedby="newPassword-error password-rules"
                {...form.register('newPassword')}
              />
              <FieldError
                id="newPassword-error"
                message={form.formState.errors.newPassword?.message}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <PasswordInput
                id="confirmPassword"
                autoComplete="new-password"
                aria-invalid={
                  Boolean(form.formState.errors.confirmPassword) || undefined
                }
                aria-describedby="confirmPassword-error"
                {...form.register('confirmPassword')}
              />
              <FieldError
                id="confirmPassword-error"
                message={form.formState.errors.confirmPassword?.message}
              />
            </div>
          </div>

          {/* The policy, stated up front rather than discovered by rejection. */}
          <PasswordRules id="password-rules" value={newPassword ?? ''} />

          <Button type="submit" loading={mutation.isPending}>
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const { refresh } = useAuth()

  const form = useForm<ChangeEmailValues>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: changeEmail,
    retry: false,
    onSuccess: async () => {
      form.reset()
      toast.success('Email address updated.')
      // The session record carries the email; re-read it rather than guess.
      await refresh()
    },
  })

  const serverMessage = mutation.error
    ? credentialErrorMessage(mutation.error, 'The email address could not be changed.')
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>Change email address</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-5"
          noValidate
        >
          {serverMessage ? (
            <p
              role="alert"
              className="rounded-md bg-danger-soft px-3 py-2 text-body text-danger-foreground"
            >
              {serverMessage}
            </p>
          ) : null}

          <p className="text-caption text-foreground-muted">
            Currently{' '}
            <span className="font-medium text-foreground">{currentEmail}</span>. This is
            the address you sign in with.
          </p>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newEmail">New email address</Label>
              <Input
                id="newEmail"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(form.formState.errors.newEmail) || undefined}
                aria-describedby="newEmail-error"
                {...form.register('newEmail')}
              />
              <FieldError
                id="newEmail-error"
                message={form.formState.errors.newEmail?.message}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="emailPassword">Confirm with your password</Label>
              <PasswordInput
                id="emailPassword"
                autoComplete="current-password"
                aria-invalid={Boolean(form.formState.errors.password) || undefined}
                aria-describedby="emailPassword-error"
                {...form.register('password')}
              />
              <FieldError
                id="emailPassword-error"
                message={form.formState.errors.password?.message}
              />
            </div>
          </div>

          <Button type="submit" loading={mutation.isPending}>
            Update email
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/**
 * Account & security — `/account`.
 *
 * Self-service credential management for the signed-in admin, wired to
 * `PATCH /admin/auth/password` and `PATCH /admin/auth/email`. Both re-verify
 * the current password server-side, which is why each form asks for it.
 *
 * This is NOT admin-user management (Phase 10) — an admin can only change
 * their own credentials here, and there is no way to reach another account.
 */
export function AccountSecurityPage() {
  const { admin } = useAuth()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account & security"
        description="Manage the credentials for your own admin account."
        breadcrumbs={[{ label: 'Account & security' }]}
      />

      {admin ? (
        <p className="text-caption text-foreground-muted">
          Signed in as{' '}
          <span className="font-medium text-foreground">{admin.email}</span> ·{' '}
          {ADMIN_ROLE_LABELS[admin.role]}
        </p>
      ) : null}

      {/* Single column throughout: these are short forms, and side-by-side
          password fields on a wide screen invite filling the wrong one. */}
      <div className="max-w-3xl space-y-6">
        <ChangePasswordForm />
        {admin ? <ChangeEmailForm currentEmail={admin.email} /> : null}
        {/* Last: it is the one control on this page that ends the visit. */}
        <SignOutAllDevicesCard />
      </div>
    </div>
  )
}
