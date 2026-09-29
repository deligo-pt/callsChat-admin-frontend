import { useRef, useState } from 'react'

import { ConfirmActionDialog, type ActionSeverity } from '@/components/feedback'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { BootstrapConfig, BootstrapPlatform } from '@/types/bootstrap'

import { useUpdateBootstrapMutation } from './useBootstrap'

/**
 * A switch that can stop the product (plan.md §5.5, phase B3).
 *
 * Three fields on this screen are ordinary booleans in the payload and
 * catastrophic in effect — `maintenanceMode`, `forceUpdate`, `forceLogout`.
 * Nothing in the API marks them as different from `minAndroidSdk`, and a save
 * is live on the unauthenticated public endpoint on the very next request.
 * This control is the only thing that treats them differently.
 *
 * **Asymmetric on purpose.** Turning one ON goes through
 * `ConfirmActionDialog` with a mandatory reason; turning one OFF sends
 * immediately, with no dialog. Restoring service should never be harder than
 * breaking it — during an incident the operator undoing the damage is often
 * not the one who caused it, and a confirmation step there is a step between
 * users and a working app.
 *
 * ⚠️ **The reason is not stored anywhere**, and the dialog says so. The API
 * has no field for it and no audit log (§3.6). That is the same honesty the
 * staff module needed for its status reason, and the opposite of the feedback
 * module's transition note, which really is saved and readable afterwards.
 */

export interface DangerousSwitchProps {
  config: BootstrapConfig
  /** Which flag this control owns. */
  field: 'maintenanceMode' | 'forceUpdate' | 'forceLogout'
  label: string
  /** One line under the label, in the card. */
  description: string
  /** What happens the moment it is confirmed. Written for an operator. */
  effect: (platform: BootstrapPlatform) => string
  /** Verb phrase for the dialog title, e.g. "Turn on maintenance mode". */
  title: string
  confirmLabel: string
  severity?: ActionSeverity
  canEdit: boolean
}

const PLATFORM_LABEL: Readonly<Record<BootstrapPlatform, string>> = {
  ANDROID: 'Android',
  IOS: 'iOS',
}

export function DangerousSwitch({
  config,
  field,
  label,
  description,
  effect,
  title,
  confirmLabel,
  severity = 'critical',
  canEdit,
}: DangerousSwitchProps) {
  const [confirming, setConfirming] = useState(false)
  const mutation = useUpdateBootstrapMutation(config.platform)

  /*
   * Focus has to be sent back by hand.
   *
   * `ConfirmActionDialog` restores focus to whatever held it when the dialog
   * opened — correct where a button opens it. Here the opener is a Radix
   * `Switch` whose checked state changes underneath, and the feedback module
   * found on 2026-09-07 that a dialog opened this way can leave focus on
   * `document.body`. Deferring a frame means this is the last word on where
   * focus lands, after the dialog's own restore has run.
   */
  const switchRef = useRef<HTMLButtonElement>(null)

  function returnFocus() {
    requestAnimationFrame(() => switchRef.current?.focus())
  }

  const current = config[field]

  function onToggle(next: boolean) {
    if (next) {
      /* Turning ON always asks. */
      setConfirming(true)
      return
    }

    /*
     * Turning OFF sends immediately. No dialog, no reason — this is the action
     * that ends an outage, and every second of ceremony is a second of
     * downtime.
     */
    mutation.mutate({ platform: config.platform, [field]: false })
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor={`bootstrap-${field}`} className="text-body-strong">
            {label}
          </Label>
          <p className="text-caption text-foreground-muted">{description}</p>
        </div>
        <Switch
          id={`bootstrap-${field}`}
          ref={switchRef}
          checked={current}
          disabled={!canEdit || mutation.isPending}
          onCheckedChange={onToggle}
          aria-describedby={`bootstrap-${field}-description`}
        />
        <span id={`bootstrap-${field}-description`} className="sr-only">
          {description}
        </span>
      </div>

      <ConfirmActionDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(false)
            returnFocus()
          }
        }}
        title={title}
        target={`${PLATFORM_LABEL[config.platform]} clients`}
        effect={effect(config.platform)}
        severity={severity}
        confirmLabel={confirmLabel}
        loading={mutation.isPending}
        /*
         * The truth, and it is a worse truth than the feedback module's. The
         * API has no field for this text and no change log (§3.6), so it goes
         * nowhere. Promising a record that does not exist would be the easiest
         * lie on this screen to tell.
         */
        reasonHint="At least 10 characters. This is for the person sitting beside you — the API stores no reason and keeps no history, so nothing here is recorded anywhere."
        onConfirm={() => {
          mutation.mutate(
            { platform: config.platform, [field]: true },
            {
              onSuccess: () => {
                setConfirming(false)
                returnFocus()
              },
            },
          )
        }}
      />
    </>
  )
}
