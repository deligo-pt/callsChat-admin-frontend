import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BootstrapConfig } from '@/types/bootstrap'

import { SettingsCard } from '../SettingsCard'
import { BlockedVersionsInput } from './BlockedVersionsInput'
import {
  buildReleasePolicyPayload,
  releasePolicySchema,
  toReleasePolicyValues,
  type ReleasePolicyValues,
} from './bootstrapSchemas'
import { DangerousSwitch } from './DangerousSwitch'
import { UnsafeStoredUrlNotice } from './fields'
import { useBootstrapCardForm } from './useBootstrapCardForm'

/**
 * Which versions may run, and which are asked or forced to update
 * (plan.md §7, phase B2).
 *
 * Two controls on this card save on their own rather than with the form:
 *
 * - **Emergency force update** blocks every client whatever version it is on,
 *   so it goes through `ConfirmActionDialog` (`DangerousSwitch`).
 * - **Blocked versions** replaces rather than merges, so it owns its own
 *   control and its own save — see `BlockedVersionsInput`.
 *
 * ⚠️ `storeUrl` is validated to `https:` **before** the request. The server
 * accepts any string and serves it publicly (§3.2); this field is the only
 * thing between an operator's paste and a `javascript:` URL on every phone.
 */
export function ReleasePolicyCard({
  config,
  canEdit,
}: {
  config: BootstrapConfig
  canEdit: boolean
}) {
  const card = useBootstrapCardForm<ReleasePolicyValues>({
    config,
    schema: releasePolicySchema,
    toValues: toReleasePolicyValues,
    buildPayload: (values) => buildReleasePolicyPayload(config.platform, values),
    fields: [
      'latestVersion',
      'latestBuildNumber',
      'minSupportedVersion',
      'minBuildNumber',
      'storeUrl',
    ],
    canEdit,
  })

  const { register, formState } = card.form
  const errors = formState.errors

  return (
    <SettingsCard
      title="Release policy"
      description="Which versions may run, and which are asked or forced to update."
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bootstrap-latest-version">Latest version</Label>
            <Input
              id="bootstrap-latest-version"
              className="font-mono"
              placeholder="1.2.0"
              disabled={!canEdit}
              aria-invalid={errors.latestVersion ? true : undefined}
              {...register('latestVersion')}
            />
            {errors.latestVersion ? (
              <p className="text-caption text-danger-foreground" role="alert">
                {errors.latestVersion.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bootstrap-latest-build">Latest build number</Label>
            <Input
              id="bootstrap-latest-build"
              type="number"
              inputMode="numeric"
              className="font-mono"
              disabled={!canEdit}
              aria-invalid={errors.latestBuildNumber ? true : undefined}
              {...register('latestBuildNumber', { valueAsNumber: true })}
            />
            {errors.latestBuildNumber ? (
              <p className="text-caption text-danger-foreground" role="alert">
                {errors.latestBuildNumber.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bootstrap-min-version">Minimum supported version</Label>
            <Input
              id="bootstrap-min-version"
              className="font-mono"
              placeholder="1.0.0"
              disabled={!canEdit}
              aria-describedby="bootstrap-min-version-hint"
              aria-invalid={errors.minSupportedVersion ? true : undefined}
              {...register('minSupportedVersion')}
            />
            <p
              id="bootstrap-min-version-hint"
              className="text-caption text-foreground-muted"
            >
              Anything below this is forced to update.
            </p>
            {errors.minSupportedVersion ? (
              <p className="text-caption text-danger-foreground" role="alert">
                {errors.minSupportedVersion.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bootstrap-min-build">Minimum build number</Label>
            <Input
              id="bootstrap-min-build"
              type="number"
              inputMode="numeric"
              className="font-mono"
              disabled={!canEdit}
              aria-invalid={errors.minBuildNumber ? true : undefined}
              {...register('minBuildNumber', { valueAsNumber: true })}
            />
            {errors.minBuildNumber ? (
              <p className="text-caption text-danger-foreground" role="alert">
                {errors.minBuildNumber.message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bootstrap-store-url">Store link</Label>
          <Input
            id="bootstrap-store-url"
            type="url"
            placeholder="https://play.google.com/store/apps/details?id=…"
            disabled={!canEdit}
            aria-describedby="bootstrap-store-url-hint"
            aria-invalid={errors.storeUrl ? true : undefined}
            {...register('storeUrl')}
          />
          <p
            id="bootstrap-store-url-hint"
            className="text-caption text-foreground-muted"
          >
            Where clients are sent to update. This opens on the user&rsquo;s device.
          </p>
          {errors.storeUrl ? (
            <p className="text-caption text-danger-foreground" role="alert">
              {errors.storeUrl.message}
            </p>
          ) : (
            /* About the SAVED value, which clients are being given right now. */
            <UnsafeStoredUrlNotice stored={config.storeUrl} />
          )}
        </div>

        {/*
         * Acts on its own, not with the form's save: this one switch can wall
         * off every client, and it should not ride along with a version edit.
         */}
        <div className="border-t border-border pt-4">
          <DangerousSwitch
            config={config}
            field="forceUpdate"
            label="Emergency force update"
            description="Blocks every client behind an update wall, whatever version it is on."
            title="Force every client to update"
            confirmLabel="Force the update"
            effect={(platform) =>
              `Every ${platform === 'ANDROID' ? 'Android' : 'iOS'} client is blocked behind an update wall it cannot dismiss the next time it is opened — including clients already on the latest version. They are sent to the store link above.`
            }
            canEdit={canEdit}
          />
        </div>

        <BlockedVersionsInput config={config} canEdit={canEdit} />
      </div>
    </SettingsCard>
  )
}
