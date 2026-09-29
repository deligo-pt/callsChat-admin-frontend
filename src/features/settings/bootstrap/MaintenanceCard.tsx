import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { BootstrapConfig } from '@/types/bootstrap'

import { SettingsCard } from '../SettingsCard'
import {
  buildMaintenanceMessagePayload,
  maintenanceMessageSchema,
  type MaintenanceMessageValues,
} from './bootstrapSchemas'
import { DangerousSwitch } from './DangerousSwitch'
import { useBootstrapCardForm } from './useBootstrapCardForm'

/**
 * The maintenance notice (plan.md §7, phase B2).
 *
 * ⚠️ **The message saves with the card; the switch acts on its own.**
 *
 * They are separated because they are different kinds of act. Editing the
 * wording is preparation — an operator can do it calmly, days ahead. Flipping
 * the switch blacks out every mobile client immediately, with no dismissal and
 * no staging (§3.10), and goes through `ConfirmActionDialog`.
 *
 * Keeping them in one card is still right: the message is what the switch
 * displays, and an operator about to turn it on should see the sentence users
 * will read without opening anything else.
 */
export function MaintenanceCard({
  config,
  canEdit,
}: {
  config: BootstrapConfig
  canEdit: boolean
}) {
  const card = useBootstrapCardForm<MaintenanceMessageValues>({
    config,
    schema: maintenanceMessageSchema,
    toValues: (record) => ({ maintenanceMessage: record.maintenanceMessage ?? '' }),
    buildPayload: (values) => buildMaintenanceMessagePayload(config.platform, values),
    fields: ['maintenanceMessage'],
    savedMessage: config.maintenanceMode
      ? 'Saved — and maintenance mode is on, so clients are seeing this now.'
      : 'Saved. This is what clients will see if maintenance mode is turned on.',
    canEdit,
  })

  const { register, formState } = card.form
  const error = formState.errors.maintenanceMessage

  return (
    <SettingsCard
      title="Maintenance"
      description="Shown full-screen by every mobile client. It cannot be dismissed."
      tone={config.maintenanceMode ? 'danger' : 'default'}
      {...(canEdit ? { onSubmit: card.onSubmit } : {})}
      onDiscard={card.onDiscard}
      isDirty={card.isDirty}
      isSaving={card.isSaving}
      error={card.error}
      successMessage={card.savedMessage}
      updatedAt={config.updatedAt}
      updatedBy={config.updatedBy}
    >
      <div className="space-y-4">
        <DangerousSwitch
          config={config}
          field="maintenanceMode"
          label="Maintenance mode"
          description="Every mobile client shows a full-screen notice it cannot dismiss."
          title="Turn on maintenance mode"
          confirmLabel="Turn on maintenance mode"
          /*
           * ⚠️ Corrected in the B5 copy pass. This said the change "takes
           * effect immediately", which is true of the record and false of the
           * clients: the app reads bootstrap at **cold start**
           * (`bootstrap_plan.md` §5.1), so a phone already running does not
           * see it until it is next opened. An operator who believes an
           * outage notice reaches live sessions will stop watching for the
           * ones that did not get it.
           */
          effect={(platform) =>
            `Every ${platform === 'ANDROID' ? 'Android' : 'iOS'} client will show a full-screen maintenance notice it cannot dismiss, from the next time it is opened. The change is saved the moment you confirm — there is no scheduled window and no undo.`
          }
          canEdit={canEdit}
        />

        <div className="space-y-1.5">
          <Label htmlFor="bootstrap-maintenance-message">Message</Label>
          <Textarea
            id="bootstrap-maintenance-message"
            rows={3}
            disabled={!canEdit}
            placeholder="Scheduled maintenance. We will be back by 09:00 UTC."
            aria-describedby="bootstrap-maintenance-message-hint"
            aria-invalid={error ? true : undefined}
            {...register('maintenanceMessage')}
          />
          <p
            id="bootstrap-maintenance-message-hint"
            className="text-caption text-foreground-muted"
          >
            {config.maintenanceMode
              ? 'Maintenance mode is on — saving changes what users are reading right now.'
              : 'Leave empty and clients show their own default wording.'}
          </p>
          {error ? (
            <p className="text-caption text-danger-foreground" role="alert">
              {error.message}
            </p>
          ) : null}
        </div>
      </div>
    </SettingsCard>
  )
}
