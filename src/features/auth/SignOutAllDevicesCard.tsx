import { useMutation } from '@tanstack/react-query'
import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Sign out of every device — `POST /admin/auth/logout` with
 * `{ allDevices: true }`.
 *
 * ## Why this does not use `ConfirmActionDialog`
 *
 * The gateway in `components/feedback` exists for actions taken *on other
 * people's records*, and its mandatory ten-character reason is what makes
 * those attributable in the audit log. Neither applies here. This admin is
 * acting on their own account, the actor is already known, and the endpoint
 * has no reason field to carry one — demanding a written justification before
 * you may sign out of your own phone would be theatre, and the text would go
 * nowhere. The confirmation itself is kept because the action is abrupt and
 * affects devices the operator cannot see.
 *
 * plan.md §1D's "single gateway" rule is about sensitive actions on user
 * records; this is self-service credential hygiene, alongside the change of
 * password and email on the same page.
 */
export function SignOutAllDevicesCard() {
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: () => signOut({ allDevices: true }),
    retry: false,
    onSuccess: () => {
      setOpen(false)
      toast.success('Signed out of every device.')
      /*
       * A hard navigation, matching the change-password flow above it. The
       * credentials are gone, so a client-side route change would only race
       * the auth observer to the same destination.
       */
      window.location.assign('/login')
    },
  })

  const errorMessage = mutation.error
    ? isAppError(mutation.error)
      ? mutation.error.message
      : 'The sessions could not be revoked.'
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>Sign out everywhere</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-body text-foreground-muted">
          Ends every signed-in session on this account — this browser and every other
          device, including any you no longer have. Each one has to sign in again. Use
          this if you think someone else has your password, or after signing in on a
          device you do not control.
        </p>

        <Button variant="outline" onClick={() => setOpen(true)}>
          Sign out of all devices
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-[520px]"
          onInteractOutside={(event) => {
            if (mutation.isPending) event.preventDefault()
          }}
        >
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-md bg-danger-soft text-danger-foreground"
                aria-hidden="true"
              >
                <ShieldAlert className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-h3">Sign out of all devices</DialogTitle>
                <DialogDescription className="text-body">
                  Every session on this account is revoked immediately, including this
                  one. You will be returned to the sign-in screen.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {errorMessage ? (
            /*
             * Shown here rather than as a toast: a failed global sign-out
             * leaves the other devices signed in, and that is not something
             * to announce in a notification that disappears on its own.
             */
            <p
              role="alert"
              className="rounded-md bg-danger-soft px-3 py-2 text-body text-danger-foreground"
            >
              {errorMessage} You are still signed in, and your other devices have not
              been signed out.
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Sign out everywhere
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
