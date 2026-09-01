import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router'
import { z } from 'zod'

import { RateLimitedError } from '@/api/errors'
import { queryKeys } from '@/api/queryKeys'
import { ROUTES } from '@/app/routes'
import { signIn, signInErrorMessage } from '@/auth/session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'

/**
 * plan.md §10.1: the endpoint takes `identifier`, which accepts an email OR a
 * phone number — so this is deliberately NOT validated as an email. Rejecting
 * a valid phone number client-side would lock out accounts the backend
 * accepts.
 */
const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or phone number.'),
  password: z.string().min(1, 'Enter your password.'),
})

type LoginValues = z.infer<typeof loginSchema>

interface LocationState {
  from?: string
}

/**
 * Admin sign-in.
 *
 * plan.md §RBAC: this is a SEPARATE flow from consumer phone-OTP login, which
 * the backend already owns. MFA is deferred for MVP but the endpoint shape
 * leaves room to add a challenge step without replacing this screen.
 */
export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const from = (location.state as LocationState | null)?.from ?? ROUTES.dashboard

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: signIn,
    /*
     * A failed sign-in must never be retried automatically. Repeating a
     * password guess is pointless against a correct rejection and actively
     * harmful against a rate limiter.
     */
    retry: false,
    onSuccess: (admin) => {
      queryClient.setQueryData(queryKeys.session.current, admin)
      // `replace` keeps the login screen out of the back-button history.
      void navigate(from, { replace: true })
    },
    onError: () => {
      // Never leave a password sitting in a form field after a failure.
      form.resetField('password')
      form.setFocus('password')
    },
  })

  /*
   * A rate-limit response is worth stating plainly — otherwise it reads as
   * "wrong password" and the operator keeps trying, making it worse.
   * Everything else collapses to one message: see `signInErrorMessage` for why
   * the API's own two distinct rejections must not be shown verbatim.
   */
  const serverMessage = mutation.error
    ? mutation.error instanceof RateLimitedError
      ? 'Too many sign-in attempts. Wait a moment and try again.'
      : signInErrorMessage(mutation.error)
    : null

  return (
    <form
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      className="space-y-5"
      noValidate
    >
      <div className="space-y-1">
        <h1 className="text-h2">Sign in</h1>
        <p className="text-caption text-foreground-muted">
          Use your CallsChat admin account.
        </p>
      </div>

      {serverMessage ? (
        <p
          role="alert"
          className="rounded-md bg-danger-soft px-3 py-2 text-body text-danger-foreground"
        >
          {serverMessage}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="identifier">Email or phone</Label>
        <Input
          id="identifier"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoFocus
          aria-invalid={Boolean(form.formState.errors.identifier) || undefined}
          aria-describedby={
            form.formState.errors.identifier ? 'identifier-error' : undefined
          }
          {...form.register('identifier')}
        />
        {form.formState.errors.identifier ? (
          <p id="identifier-error" role="alert" className="text-caption text-danger">
            {form.formState.errors.identifier.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          aria-invalid={Boolean(form.formState.errors.password) || undefined}
          aria-describedby={
            form.formState.errors.password ? 'password-error' : undefined
          }
          {...form.register('password')}
        />
        {form.formState.errors.password ? (
          <p id="password-error" role="alert" className="text-caption text-danger">
            {form.formState.errors.password.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" loading={mutation.isPending}>
        Sign in
      </Button>
    </form>
  )
}
