import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { ConflictError } from '@/api/errors'
import { applyServerFieldErrors, formLevelMessage } from '@/api/formErrors'
import { ROUTES } from '@/app/routes'
import { PageHeader } from '@/components/display'
import {
  fieldAria,
  FormActions,
  FormField,
  FormGrid,
  FormSection,
  PasswordRules,
} from '@/components/form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/cn'
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard'
import { resolveStatus } from '@/lib/status'
import { STAFF_ROLE_VALUES } from '@/types/staff'

import { PermissionGrid } from './PermissionGrid'
import {
  buildCreatePayload,
  CREATE_STAFF_DEFAULTS,
  CREATE_STAFF_FIELDS,
  createStaffSchema,
  type CreateStaffValues,
} from './schemas'
import { useCreateStaffMutation } from './useStaff'

/**
 * Provision a staff member — `/staff/new`. Super Admin only.
 *
 * A route rather than a modal (staff_management_plan.md §4.1): five fields plus
 * an eight-key permission grid is a page, the act is worth being linkable, and
 * the dangerous half — the grid — needs room to explain each key rather than
 * a scroll area in a dialog.
 *
 * What the form has to be honest about, because the API is not:
 *
 * - **Nothing is emailed.** The operator types the password and is the only
 *   channel for delivering it (§3.5). Said on screen, next to the field.
 * - **Role and access are independent.** Promoting someone does not change
 *   their module keys, and the grid is what actually decides what they can
 *   reach — verified, the probe account kept both keys across a promotion.
 * - **An empty grid is a valid outcome**, not an incomplete form.
 */
export function StaffCreatePage() {
  const navigate = useNavigate()
  const mutation = useCreateStaffMutation()

  const form = useForm<CreateStaffValues>({
    resolver: zodResolver(createStaffSchema),
    defaultValues: CREATE_STAFF_DEFAULTS,
  })

  const password = useWatch({ control: form.control, name: 'password' })
  const isDirty = form.formState.isDirty

  /*
   * Disarms the guard for the navigation that FOLLOWS a successful create.
   *
   * `mutation.isSuccess` cannot be used for this. `useBlocker` closes over the
   * value it was given at render time, and the mutation's state update has not
   * been committed at the moment `navigate` runs — so the operator was asked
   * "leave without saving?" immediately after the account was created, which
   * reads as though it had failed. Caught by the component test, which is the
   * only place the blocker actually runs.
   */
  const [created, setCreated] = useState(false)

  useUnsavedChangesGuard(isDirty && !created)

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const created = await mutation.mutateAsync(buildCreatePayload(values))

      /*
       * A toast, unlike settings' in-place confirmations: this page navigates
       * away, so there is no surface left to confirm on.
       */
      toast.success(`${created.displayName} can now sign in.`)

      /*
       * `flushSync`, so the blocker is rebuilt with the guard down BEFORE the
       * navigation it is about to evaluate. See `created` above.
       */
      flushSync(() => setCreated(true))
      /*
       * The new record, not the directory. The operator's next question is
       * almost always "did the permissions land?", and the detail page answers
       * it from the server rather than from this response.
       */
      void navigate(ROUTES.staffMember(created.id))
    } catch (error) {
      /*
       * A `409` on this route can only be the email — it is the sole unique
       * field on a staff record — so it is attributed to that control rather
       * than left as a page-level alert the operator has to translate.
       *
       * ⚠️ The exact live shape is unverified: A0's contract probing never
       * created a duplicate, and the mock's `409 CONFLICT` is a reasoned guess
       * (§8 O11). Whatever the server actually sends still surfaces — an
       * unrecognised shape falls through to the form-level alert below rather
       * than being swallowed.
       */
      if (error instanceof ConflictError) {
        form.setError('email', { type: 'server', message: error.message })
        return
      }

      applyServerFieldErrors(error, form.setError, CREATE_STAFF_FIELDS)
    }
  })

  const errors = form.formState.errors
  const formError = formLevelMessage(
    mutation.error,
    'The account could not be created. Nothing has been changed.',
  )
  /* Field-mapped rejections show on their own control; don't say it twice. */
  const showFormError = formError !== null && !errors.email

  return (
    <div className="form-column space-y-6">
      <PageHeader
        title="Add staff member"
        description="Creates an account that can sign in to this panel immediately."
        breadcrumbs={[{ label: 'Staff', to: ROUTES.staff }, { label: 'Add staff' }]}
      />

      <form onSubmit={(event) => void onSubmit(event)} className="space-y-6" noValidate>
        {showFormError ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <FormSection
          title="Identity"
          description="The email address is how they sign in. Their `@username` is generated by the server and cannot be chosen."
        >
          <FormGrid>
            <FormField
              id="email"
              label="Email address"
              required
              error={errors.email?.message}
              className="md:col-span-2"
            >
              <Input
                {...fieldAria('email', false, Boolean(errors.email))}
                {...form.register('email')}
                type="email"
                autoComplete="off"
                placeholder="colleague@callschat.com"
              />
            </FormField>

            <FormField
              id="displayName"
              label="Display name"
              required
              hint="Shown wherever their actions are attributed."
              error={errors.displayName?.message}
            >
              <Input
                {...fieldAria('displayName', true, Boolean(errors.displayName))}
                {...form.register('displayName')}
                autoComplete="off"
              />
            </FormField>

            <FormField
              id="phone"
              label="Phone"
              /*
               * "Not validated" is the honest hint. The API accepts any string
               * here — `"nonsense"` was stored verbatim during contract
               * verification (§8 O4) — so promising a format would be a lie,
               * and enforcing one would reject numbers the backend keeps.
               */
              hint="Optional. Any format — the server does not check it."
              error={errors.phone?.message}
            >
              <Input
                {...fieldAria('phone', true, Boolean(errors.phone))}
                {...form.register('phone')}
                autoComplete="off"
                placeholder="+12025550199"
              />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection
          title="Role"
          description="Role labels the account. It does not decide what they can reach — the permissions below do, and changing one later leaves the other exactly as it was."
        >
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="gap-3"
                aria-label="Role"
              >
                {STAFF_ROLE_VALUES.map((role) => (
                  <label
                    key={role}
                    htmlFor={`role-${role}`}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md border bg-surface p-3 transition-colors',
                      'border-border hover:bg-surface-muted',
                      'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-soft has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-primary',
                    )}
                  >
                    <RadioGroupItem id={`role-${role}`} value={role} />
                    <span className="text-body-strong">
                      {resolveStatus('staffRole', role).label}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            )}
          />
        </FormSection>

        <FormSection
          title="Module access"
          titleId="permissions-heading"
          description="Nothing is granted by default. An account with no access here can sign in and see the panel shell, and nothing else — a valid, deliberate outcome."
        >
          <Controller
            control={form.control}
            name="permissions"
            render={({ field }) => (
              <PermissionGrid
                value={field.value}
                onChange={field.onChange}
                disabled={mutation.isPending}
                aria-labelledby="permissions-heading"
              />
            )}
          />
        </FormSection>

        <FormSection
          title="First password"
          description="They can change it themselves once signed in."
          contentClassName="space-y-4"
        >
          {/*
           * §3.5, stated before the field rather than discovered afterwards.
           * There is no welcome email and no reset link anywhere in this API,
           * so whoever fills this in is the delivery channel.
           */}
          <p className="flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
            <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Nothing is emailed to them. You will need to pass this password on
              yourself.
            </span>
          </p>

          <FormField
            id="password"
            label="Password"
            required
            error={errors.password?.message}
          >
            <PasswordInput
              {...fieldAria('password', true, Boolean(errors.password))}
              {...form.register('password')}
              autoComplete="new-password"
            />
          </FormField>

          {/*
           * The panel's rule, not the server's. `POST /admin/staff` checks
           * length and nothing else — `"password"` is accepted (§3.5).
           */}
          <PasswordRules id="password-hint" value={password ?? ''} />
        </FormSection>

        <FormActions sticky>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void navigate(ROUTES.staff)}
          >
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Create account
          </Button>
        </FormActions>
      </form>
    </div>
  )
}
