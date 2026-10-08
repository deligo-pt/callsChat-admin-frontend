import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BootstrapConfig } from '@/types/bootstrap'

import { SettingsCard } from '../SettingsCard'
import {
  buildLegalPayload,
  legalSchema,
  toLegalValues,
  type LegalValues,
} from './bootstrapSchemas'
import { UnsafeStoredUrlNotice } from './fields'
import { useBootstrapCardForm } from './useBootstrapCardForm'

/**
 * The links and contacts every client shows, and the OS floor it enforces
 * (plan.md §7, phase B2).
 *
 * ⚠️ Both URLs are validated to `https:` before the request. The server
 * accepts any string for all three URL fields and serves them from a public
 * endpoint (§3.2) — these inputs are the only guard there is.
 *
 * ⚠️ `minAndroidSdk` moved to `ReleasePolicyCard` on 2026-10-06, together with
 * its Android-only rendering and its omit-on-iOS payload rule. It is a floor on
 * which clients may run, which is that card's subject; it was here only because
 * it arrived alongside the URL fields. The description above lost "and the OS
 * floor it enforces" with it.
 */
export function LegalCard({
  config,
  canEdit,
}: {
  config: BootstrapConfig
  canEdit: boolean
}) {
  const card = useBootstrapCardForm<LegalValues>({
    config,
    schema: legalSchema,
    toValues: toLegalValues,
    buildPayload: (values) => buildLegalPayload(config, values),
    fields: ['privacyPolicyUrl', 'termsUrl', 'supportEmail'],
    canEdit,
  })

  const { register, formState } = card.form
  const errors = formState.errors

  return (
    <SettingsCard
      title="Platform & legal"
      description="The links and contacts every client shows."
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
        <div className="space-y-1.5">
          <Label htmlFor="bootstrap-privacy-url">Privacy policy</Label>
          <Input
            id="bootstrap-privacy-url"
            type="url"
            placeholder="https://callschat.com/privacy"
            disabled={!canEdit}
            aria-invalid={errors.privacyPolicyUrl ? true : undefined}
            {...register('privacyPolicyUrl')}
          />
          {errors.privacyPolicyUrl ? (
            <p className="text-caption text-danger-foreground" role="alert">
              {errors.privacyPolicyUrl.message}
            </p>
          ) : (
            <UnsafeStoredUrlNotice stored={config.privacyPolicyUrl} />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bootstrap-terms-url">Terms of service</Label>
          <Input
            id="bootstrap-terms-url"
            type="url"
            placeholder="https://callschat.com/terms"
            disabled={!canEdit}
            aria-invalid={errors.termsUrl ? true : undefined}
            {...register('termsUrl')}
          />
          {errors.termsUrl ? (
            <p className="text-caption text-danger-foreground" role="alert">
              {errors.termsUrl.message}
            </p>
          ) : (
            <UnsafeStoredUrlNotice stored={config.termsUrl} />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bootstrap-support-email">Support email</Label>
          <Input
            id="bootstrap-support-email"
            type="email"
            placeholder="support@callschat.com"
            disabled={!canEdit}
            aria-describedby="bootstrap-support-email-hint"
            aria-invalid={errors.supportEmail ? true : undefined}
            {...register('supportEmail')}
          />
          <p
            id="bootstrap-support-email-hint"
            className="text-caption text-foreground-muted"
          >
            Shown in the app, and the address users reply to.
          </p>
          {errors.supportEmail ? (
            <p className="text-caption text-danger-foreground" role="alert">
              {errors.supportEmail.message}
            </p>
          ) : null}
        </div>
      </div>
    </SettingsCard>
  )
}
