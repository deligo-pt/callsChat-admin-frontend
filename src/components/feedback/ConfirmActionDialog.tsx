import { AlertTriangle, Info, ShieldAlert } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/cn'
import { useReturnFocus } from '@/lib/hooks/useReturnFocus'

/** Minimum characters for a reason to be considered meaningful. */
export const MIN_REASON_LENGTH = 10

export type ActionSeverity = 'info' | 'warning' | 'critical'

const SEVERITY_CONFIG = {
  info: {
    icon: Info,
    iconClass: 'bg-info-soft text-info-foreground',
    confirmVariant: 'primary',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'bg-warning-soft text-warning-foreground',
    confirmVariant: 'primary',
  },
  critical: {
    icon: ShieldAlert,
    iconClass: 'bg-danger-soft text-danger-foreground',
    confirmVariant: 'danger',
  },
} as const

export interface ConfirmActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void

  /** Verb phrase, e.g. "Ban user" or "Approve withdrawal". */
  title: string
  /** The record being acted on, e.g. "Ayesha Rahman (usr_8Fk29Z)". */
  target: string
  /**
   * Plain-language statement of what will happen. Written for an operator, not
   * a developer — "This user will be signed out and cannot sign in again."
   */
  effect: string
  severity?: ActionSeverity

  /** Extra read-only context, e.g. the payout breakdown for a withdrawal. */
  details?: ReactNode

  /**
   * Interactive inputs the action needs beyond a reason — a suspension
   * category, an expiry date, a capability to restrict.
   *
   * Kept inside this dialog rather than letting features build their own
   * parameterised forms: plan.md §1D makes this the single gateway for
   * sensitive actions, and an action that skipped it would also skip the
   * mandatory reason and the target confirmation.
   */
  fields?: ReactNode

  /**
   * Blocks confirmation while the caller's own `fields` are invalid. The
   * reason and typed-confirmation checks are always applied on top of this.
   */
  confirmDisabled?: boolean

  /**
   * Require the operator to type this exact string before confirming.
   * Reserved for irreversible actions (plan.md §Recommended Screen Pattern).
   */
  typedConfirmation?: string

  /**
   * Whether to collect a reason. `'required'` — the default and the norm.
   *
   * `'none'` exists for the endpoints that **accept no reason at all**:
   * `PATCH /admin/staff/:id/role` and `DELETE /admin/staff/:id` have no field
   * for one, so demanding ten characters the client then discards would imply
   * a record that is never even sent (staff_management_plan.md §5.6). Use it
   * only when the API genuinely has nowhere to put the text — never to make a
   * dangerous action quicker to confirm.
   */
  reason?: 'required' | 'none'

  /**
   * Replaces the default hint under the reason field.
   *
   * The default promises the reason is "recorded in the audit log with your
   * name and the current time". That is true of the consumer-user actions this
   * dialog was built for and **false for staff**: the reason is posted and no
   * endpoint reads it back (§3.6). Callers whose reason lands somewhere else —
   * or nowhere readable — say so here.
   */
  reasonHint?: ReactNode

  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean

  /** Receives the mandatory reason. The caller performs the mutation. */
  onConfirm: (reason: string) => void
}

/**
 * The single gateway for every sensitive action in the application.
 *
 * plan.md §3.5 / §1D: no feature builds its own confirm flow. This renders the
 * target, the effect, a mandatory reason, and — for irreversible actions — a
 * typed confirmation, before the caller is allowed to fire the mutation.
 *
 * The backend independently re-validates permission and record state; this
 * dialog is about operator intent and the audit reason, not authorization.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  ...rest
}: ConfirmActionDialogProps) {
  const returnFocus = useReturnFocus(open)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        /*
         * These dialogs are opened from state, not a `DialogTrigger`, so Radix
         * has no element to restore focus to and a keyboard user lands at the
         * top of the document with the button they came from lost.
         */
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus()
        }}
        /*
         * Constrained height with a scrolling body.
         *
         * Since this dialog grew a `fields` slot, its content is variable and
         * can exceed a phone viewport — a six-field provisioning form at 360px
         * pushed the confirm button off-screen, and it shifted as validation
         * messages appeared. The header and footer stay pinned so the confirm
         * control is always reachable; only the middle scrolls.
         */
        className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[640px]"
        onInteractOutside={(event) => {
          // Never lose a typed reason to a stray click.
          if (rest.loading) event.preventDefault()
        }}
      >
        {/*
         * The form lives in a child so Radix unmounts it when the dialog
         * closes. State therefore resets on every open with no effect and no
         * risk of a previous reason being reused.
         */}
        <ConfirmActionForm {...rest} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

type ConfirmActionFormProps = Omit<
  ConfirmActionDialogProps,
  'open' | 'onOpenChange'
> & { onCancel: () => void }

function ConfirmActionForm({
  title,
  target,
  effect,
  severity = 'warning',
  details,
  fields,
  confirmDisabled = false,
  typedConfirmation,
  reason: reasonMode = 'required',
  reasonHint,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmActionFormProps) {
  const reasonId = useId()
  const typedId = useId()
  const errorId = useId()
  const hintId = useId()

  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const [touched, setTouched] = useState(false)

  const config = SEVERITY_CONFIG[severity]
  const Icon = config.icon

  const trimmedReason = reason.trim()
  const reasonTooShort =
    reasonMode === 'required' && trimmedReason.length < MIN_REASON_LENGTH
  const typedMismatch =
    typedConfirmation !== undefined && typed.trim() !== typedConfirmation
  const canConfirm = !reasonTooShort && !typedMismatch && !confirmDisabled && !loading

  function handleConfirm() {
    setTouched(true)
    if (!canConfirm) return
    onConfirm(trimmedReason)
  }

  const showReasonError = touched && reasonTooShort

  return (
    <>
      <DialogHeader>
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-md',
              config.iconClass,
            )}
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-h3">{title}</DialogTitle>
            <DialogDescription className="text-body">{effect}</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="min-h-0 space-y-4 overflow-y-auto">
        {/* Target — the operator must see exactly what they are acting on. */}
        <div className="rounded-md border border-border bg-surface-muted px-3 py-2.5">
          <span className="block text-overline text-foreground-subtle uppercase">
            Target
          </span>
          <span className="mt-0.5 block text-body font-medium break-words">
            {target}
          </span>
        </div>

        {details ? <div>{details}</div> : null}

        {fields ? <div className="space-y-4">{fields}</div> : null}

        {/* Mandatory reason — recorded in the audit event. */}
        {reasonMode === 'none' ? null : (
          <div className="space-y-2">
            <Label htmlFor={reasonId}>
              Reason <span className="text-danger">*</span>
            </Label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              /*
               * Marked touched on blur **only once something has been typed**.
               *
               * A bare `setTouched(true)` here showed the operator "a reason of
               * at least 10 characters is required" before they had typed a
               * character, whenever the dialog was opened from a Radix menu:
               * closing the menu moves focus, which blurs the autofocused
               * textarea on the very first frame. Every caller until
               * `features/feedback` opened this dialog from a plain button, so
               * the path never ran (feedback_management_plan.md F3).
               *
               * An empty field is still caught — `handleConfirm` sets `touched`
               * unconditionally, so attempting to confirm surfaces the error.
               */
              onBlur={() => {
                if (reason.length > 0) setTouched(true)
              }}
              rows={3}
              placeholder="Why is this action being taken? This is recorded in the audit log."
              aria-required="true"
              aria-invalid={showReasonError || undefined}
              aria-describedby={showReasonError ? errorId : undefined}
              className={showReasonError ? 'border-danger' : undefined}
            />
            {showReasonError ? (
              <p id={errorId} className="text-caption text-danger" role="alert">
                A reason of at least {MIN_REASON_LENGTH} characters is required.
              </p>
            ) : (
              <p id={hintId} className="text-caption text-foreground-muted">
                {reasonHint ?? (
                  <>
                    A reason of at least {MIN_REASON_LENGTH} characters is required. It
                    is recorded in the audit log with your name and the current time.
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {/* Typed confirmation for irreversible actions. */}
        {typedConfirmation !== undefined ? (
          <div className="space-y-2">
            <Label htmlFor={typedId}>
              Type <code className="font-mono font-semibold">{typedConfirmation}</code>{' '}
              to confirm
            </Label>
            <Input
              id={typedId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              aria-required="true"
              aria-invalid={(touched && typedMismatch) || undefined}
            />
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={config.confirmVariant}
          onClick={handleConfirm}
          loading={loading}
          /*
           * Deliberately NOT disabled, and deliberately NOT aria-disabled: a
           * disabled control gives no feedback about why it cannot be pressed,
           * and marking a genuinely clickable button as disabled would lie to
           * assistive technology. Pressing it surfaces the validation message
           * instead, announced via aria-describedby.
           */
          aria-describedby={showReasonError ? errorId : hintId}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </>
  )
}
