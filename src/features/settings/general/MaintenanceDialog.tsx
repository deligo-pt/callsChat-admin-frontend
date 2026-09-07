import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'

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

/**
 * Confirmation for switching maintenance mode ON.
 *
 * ## Why not `ConfirmActionDialog`
 *
 * Same reasoning as `SignOutAllDevicesCard`. The shared gateway exists for
 * actions taken *on another person's record*, and its mandatory ten-character
 * reason is what makes those attributable in the audit log. Neither applies:
 * `PATCH /admin/settings/general` has no reason field to carry the text, and
 * there is no second party to attribute it to. A written justification that
 * goes nowhere is theatre.
 *
 * What this needs instead is a gate proportional to **scale**. Turning this on
 * answers `503` to every user of the product at once, so the confirmation asks
 * the operator to type the word — a deliberate act that cannot be produced by
 * a stray click or a mistimed Enter.
 *
 * Turning maintenance **off** has no dialog at all. Restoring service is never
 * gated; the only thing worse than an accidental outage is a slow recovery.
 */

const CONFIRM_WORD = 'MAINTENANCE'

export interface MaintenanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isSaving?: boolean
  /** Shown to users while the mode is active, so it can be checked here. */
  message: string
}

export function MaintenanceDialog({
  open,
  onOpenChange,
  onConfirm,
  isSaving = false,
  message,
}: MaintenanceDialogProps) {
  const [typed, setTyped] = useState('')
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD

  function change(next: boolean) {
    if (!next) setTyped('')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-danger" aria-hidden="true" />
            Put CallsChat into maintenance?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-left">
              <p>
                Every user is cut off immediately. Nobody can sign in, send a message,
                or place a call until you turn this back off.
              </p>
              {/*
               * The one fact that makes this recoverable. It comes from the
               * documented exemption list, which is NOT yet verified against a
               * running service — see system_settings_plan.md §8 R2. If that
               * turns out to be wrong, this sentence is the first thing to fix.
               */}
              <p>
                The admin panel stays reachable, so you can turn it off from this page.
              </p>
              <div className="rounded-md border border-border bg-surface-muted p-3">
                <p className="text-overline text-foreground-muted">Users will see</p>
                <p className="text-body">
                  {message.trim().length > 0
                    ? message
                    : 'No message set — users see a bare service-unavailable error.'}
                </p>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="maintenance-confirm">Type {CONFIRM_WORD} to confirm</Label>
          <Input
            id="maintenance-confirm"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            // A confirmation the browser can fill in is not a confirmation.
            spellCheck={false}
            aria-describedby="maintenance-confirm-hint"
          />
          <p
            id="maintenance-confirm-hint"
            className="text-caption text-foreground-muted"
          >
            Typing the word is deliberate: a stray click cannot take the product down.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => change(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={!confirmed}
            loading={isSaving}
            onClick={onConfirm}
          >
            Start maintenance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
