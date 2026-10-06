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
import { NotSet, UnsafeStoredUrlNotice } from './fields'
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
 *
 * ⚠️ `minAndroidSdk` renders on **Android only**, and moved here from
 * `LegalCard` on 2026-10-06. The field exists on the iOS record and means
 * nothing there (§3.9), so the iOS payload omits it rather than sending a
 * value that cannot apply — `toReleasePolicyValues` leaves the key off
 * entirely on iOS, which is what makes the omission automatic rather than a
 * rule someone has to remember here.
 */
export function ReleasePolicyCard({
  config,
  canEdit,
}: {
  config: BootstrapConfig
  canEdit: boolean
}) {
  const isAndroid = config.platform === 'ANDROID'

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
      'minAndroidSdk',
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

        {/*
         * Beneath the version floors, because it is the same question asked
         * about the OS instead of the app: which clients are allowed to run.
         */}
        {isAndroid ? (
          <div className="space-y-1.5">
            <Label htmlFor="bootstrap-min-sdk">Minimum Android SDK</Label>
            <Input
              id="bootstrap-min-sdk"
              type="number"
              inputMode="numeric"
              className="font-mono sm:max-w-[10rem]"
              disabled={!canEdit}
              aria-describedby="bootstrap-min-sdk-hint"
              aria-invalid={errors.minAndroidSdk ? true : undefined}
              {...register('minAndroidSdk', { valueAsNumber: true })}
            />
            <p
              id="bootstrap-min-sdk-hint"
              className="text-caption text-foreground-muted"
            >
              Android 7.0 is SDK 24. Devices below this are not supported.
            </p>
            {errors.minAndroidSdk ? (
              <p className="text-caption text-danger-foreground" role="alert">
                {errors.minAndroidSdk.message}
              </p>
            ) : null}
          </div>
        ) : (
          /*
           * Stated rather than hidden. Hiding it leaves an operator wondering
           * whether iOS has a floor the panel forgot; a disabled input would
           * imply a permission they are missing. Neither is true.
           */
          <p className="text-caption text-foreground-muted">
            <NotSet>
              The API has no minimum iOS version — only an Android SDK floor, which does
              not apply here.
            </NotSet>
          </p>
        )}

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
