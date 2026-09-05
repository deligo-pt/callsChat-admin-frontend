import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

import { useAuth } from '@/auth/useAuth'
import { PERMISSIONS } from '@/auth/permissions'
import { ErrorState, LoadingState } from '@/components/feedback'
import { Input } from '@/components/ui/input'
import type { SystemSettings } from '@/types/settings'
import { fieldAria, FormField } from '@/components/form'
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard'
import { applyServerFieldErrors } from '@/api/formErrors'

import { updateGeneralSettings } from '../api'
import { SettingsCard } from '../SettingsCard'
import { generalSettingsSchema, type GeneralSettingsValues } from '../schemas'
import { buildGeneralPayload } from '../serialize'
import { useSettingsMutation, useSettingsQuery } from '../useSettings'

/**
 * Brand identity and support contacts — `PATCH /admin/settings/general`.
 *
 * Every value here is read by the mobile app and the web client on bootstrap,
 * so the description says whose screen each field lands on rather than
 * restating the field name.
 */

const FIELDS = [
  'appName',
  'supportEmail',
  'supportPhone',
  'tosUrl',
  'privacyPolicyUrl',
] as const

export function GeneralTab() {
  const { can } = useAuth()
  const canEdit = can(PERMISSIONS.configurationConfigure)
  const query = useSettingsQuery()
  /*
   * Confirmed in the card, not with a toast.
   *
   * A bottom-right toast sits directly on top of this card's own Save button
   * at 1024px and blocks the next click for as long as it is on screen —
   * caught by the e2e suite at that viewport. Reporting the result beside the
   * "Updated ..." line is also simply better: the confirmation appears where
   * the action happened. Toasts stay for outcomes with no in-place surface.
   */
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const form = useForm<GeneralSettingsValues>({
    resolver: zodResolver(generalSettingsSchema),
    defaultValues: {
      appName: '',
      supportEmail: '',
      supportPhone: '',
      tosUrl: '',
      privacyPolicyUrl: '',
    },
  })

  const settings = query.data?.settings

  /**
   * `updatedAt` of the record the form currently reflects.
   *
   * Without this, the effect below re-seeds on every change to the query data
   * — including a background refetch — and an operator typing while a save
   * settles has their keystrokes silently reverted to the server's values.
   */
  const seededVersion = useRef<string | null>(null)

  const seed = useCallback(
    (record: SystemSettings) => {
      seededVersion.current = record.updatedAt
      form.reset(
        {
          appName: record.appName,
          supportEmail: record.supportEmail,
          supportPhone: record.supportPhone ?? '',
          tosUrl: record.tosUrl ?? '',
          privacyPolicyUrl: record.privacyPolicyUrl ?? '',
        },
        /*
         * Fields the operator has edited keep what they typed; everything else
         * takes the server's value, and the defaults move either way so the
         * dirty comparison stays honest.
         *
         * Without this, a save landing — or a background refetch — while
         * someone is mid-sentence silently reverts their keystrokes. Observed
         * in e2e: type, save, keep typing, and the second edit vanished the
         * moment the first response arrived.
         */
        { keepDirtyValues: true },
      )
    },
    [form],
  )

  const isDirty = form.formState.isDirty

  useEffect(() => {
    if (!settings) return
    // Already showing this version of the record.
    if (seededVersion.current === settings.updatedAt) return

    seed(settings)
  }, [settings, seed])

  const mutation = useSettingsMutation(updateGeneralSettings, (saved) => {
    // Re-seed from the SERVER's record, so its normalisation is what shows.
    seed(saved)
    setSavedMessage('Saved. Clients pick this up within a minute.')
  })

  useUnsavedChangesGuard(isDirty && canEdit)

  if (query.isPending) return <LoadingState variant="form" />
  if (query.isError || !settings) {
    return (
      <ErrorState
        title="Settings could not be loaded"
        description="The system settings record did not load. Nothing has been changed."
        onRetry={() => void query.refetch()}
      />
    )
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(buildGeneralPayload(values))
    } catch (error) {
      /*
       * Attribute what can be attributed. Anything left over renders in the
       * card-level alert via `mutation.error`, so nothing is swallowed.
       */
      applyServerFieldErrors(error, form.setError, FIELDS)
    }
  })

  const errors = form.formState.errors

  return (
    <SettingsCard
      title="Brand identity"
      description="Shown to every user in the mobile app and web client. Changes reach clients within a minute."
      onSubmit={(event) => void onSubmit(event)}
      onDiscard={() => form.reset()}
      isDirty={isDirty}
      isSaving={mutation.isPending}
      error={mutation.error}
      // Stale the moment they start editing again.
      successMessage={isDirty ? null : savedMessage}
      updatedAt={settings.updatedAt}
      updatedBy={settings.updatedBy}
    >
      <fieldset disabled={!canEdit} className="contents">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            id="appName"
            label="App name"
            required
            hint="2–60 characters."
            error={errors.appName?.message}
            className="md:col-span-2"
          >
            <Input
              {...fieldAria('appName', true, Boolean(errors.appName))}
              {...form.register('appName')}
              autoComplete="off"
            />
          </FormField>

          <FormField
            id="supportEmail"
            label="Support email"
            required
            hint="Cannot be left blank — the API has no way to clear it."
            error={errors.supportEmail?.message}
          >
            <Input
              type="email"
              {...fieldAria('supportEmail', true, Boolean(errors.supportEmail))}
              {...form.register('supportEmail')}
              autoComplete="off"
            />
          </FormField>

          <FormField
            id="supportPhone"
            label="Support phone"
            hint="Optional. International format, e.g. +12025550199."
            error={errors.supportPhone?.message}
          >
            <Input
              type="tel"
              {...fieldAria('supportPhone', true, Boolean(errors.supportPhone))}
              {...form.register('supportPhone')}
              autoComplete="off"
            />
          </FormField>

          <FormField
            id="tosUrl"
            label="Terms of service URL"
            hint="Optional. Leave blank to remove the link from clients."
            error={errors.tosUrl?.message}
          >
            <Input
              type="url"
              {...fieldAria('tosUrl', true, Boolean(errors.tosUrl))}
              {...form.register('tosUrl')}
              autoComplete="off"
            />
          </FormField>

          <FormField
            id="privacyPolicyUrl"
            label="Privacy policy URL"
            hint="Optional. Leave blank to remove the link from clients."
            error={errors.privacyPolicyUrl?.message}
          >
            <Input
              type="url"
              {...fieldAria('privacyPolicyUrl', true, Boolean(errors.privacyPolicyUrl))}
              {...form.register('privacyPolicyUrl')}
              autoComplete="off"
            />
          </FormField>
        </div>
      </fieldset>

      {!canEdit ? (
        <p className="text-caption text-foreground-muted">
          Your role can view these settings but not change them.
        </p>
      ) : null}
    </SettingsCard>
  )
}
