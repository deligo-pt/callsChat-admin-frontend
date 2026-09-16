import { useCallback, useEffect, useRef, useState } from 'react'

import { PERMISSIONS } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ErrorState, LoadingState } from '@/components/feedback'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { SystemSettings } from '@/types/settings'
import { fieldAria, FormField } from '@/components/form'
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard'

import { updatePlatformSettings } from '../api'
import { SettingsCard } from '../SettingsCard'
import { buildPlatformPayload, type PlatformFormValues } from '../serialize'
import { useSettingsMutation, useSettingsQuery } from '../useSettings'
import { LanguageEditor } from './LanguageEditor'

/**
 * Platform and localization — `PATCH /admin/settings/platform`.
 *
 * The mirror image of `/general` in one important respect: here a cleared
 * field is sent as `null`, because `""` is rejected as an invalid URL. That
 * asymmetry lives in `buildPlatformPayload` and nowhere else.
 */

type Draft = PlatformFormValues

const EMPTY: Draft = {
  defaultLanguage: 'en',
  supportedLanguages: [],
  playStoreUrl: '',
  appStoreUrl: '',
  paymentEnabled: false,
  paymentProvider: 'none',
  subscriptionPlansEnabled: false,
}

function isUrlish(value: string): boolean {
  return value.trim() === '' || /^https?:\/\/\S+\.\S+/.test(value.trim())
}

export function PlatformTab() {
  const { can } = useAuth()
  const canEdit = can(PERMISSIONS.configurationConfigure)
  const query = useSettingsQuery()

  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [urlErrors, setUrlErrors] = useState<{ play?: string; app?: string }>({})

  const settings = query.data?.settings
  const seededVersion = useRef<string | null>(null)

  const seed = useCallback((record: SystemSettings) => {
    seededVersion.current = record.updatedAt
    setDraft({
      defaultLanguage: record.defaultLanguage,
      supportedLanguages: record.supportedLanguages,
      playStoreUrl: record.playStoreUrl ?? '',
      appStoreUrl: record.appStoreUrl ?? '',
      paymentEnabled: record.paymentEnabled,
      paymentProvider: record.paymentProvider,
      subscriptionPlansEnabled: record.subscriptionPlansEnabled,
    })
    setUrlErrors({})
  }, [])

  useEffect(() => {
    if (!settings) return
    if (seededVersion.current === settings.updatedAt) return
    seed(settings)
  }, [settings, seed])

  const mutation = useSettingsMutation(updatePlatformSettings, (saved) => {
    seed(saved)
    setSavedMessage('Saved. Clients pick this up within a minute.')
  })

  const dirty = settings
    ? draft.defaultLanguage !== settings.defaultLanguage ||
      draft.supportedLanguages.join(',') !== settings.supportedLanguages.join(',') ||
      draft.playStoreUrl !== (settings.playStoreUrl ?? '') ||
      draft.appStoreUrl !== (settings.appStoreUrl ?? '') ||
      draft.paymentEnabled !== settings.paymentEnabled ||
      draft.subscriptionPlansEnabled !== settings.subscriptionPlansEnabled
    : false

  useUnsavedChangesGuard(dirty && canEdit)

  if (query.isPending) return <LoadingState variant="form" />
  if (query.isError || !settings) {
    return (
      <ErrorState
        title="Settings could not be loaded"
        description="The platform settings did not load. Nothing has been changed."
        onRetry={() => void query.refetch()}
      />
    )
  }

  function submit() {
    const errors: { play?: string; app?: string } = {}
    if (!isUrlish(draft.playStoreUrl)) {
      errors.play = 'Enter a full URL, starting with https://'
    }
    if (!isUrlish(draft.appStoreUrl)) {
      errors.app = 'Enter a full URL, starting with https://'
    }
    setUrlErrors(errors)
    if (errors.play || errors.app) return

    void mutation.mutateAsync(buildPlatformPayload(draft)).catch(() => {
      /* Rendered by the card's error slot. */
    })
  }

  function patch(changes: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...changes }))
  }

  return (
    <SettingsCard
      title="Platform & localization"
      description="Languages every client offers, and where users are sent to install the app."
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onDiscard={() => seed(settings)}
      isDirty={dirty}
      isSaving={mutation.isPending}
      error={mutation.error}
      successMessage={dirty ? null : savedMessage}
      updatedAt={settings.updatedAt}
      updatedBy={settings.updatedBy}
    >
      <fieldset disabled={!canEdit} className="contents space-y-4">
        <FormField id="supportedLanguages" label="Supported languages">
          <LanguageEditor
            supported={draft.supportedLanguages}
            defaultLanguage={draft.defaultLanguage}
            disabled={!canEdit}
            onChange={({ supported, defaultLanguage }) =>
              patch({ supportedLanguages: supported, defaultLanguage })
            }
          />
        </FormField>

        <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
          <FormField
            id="playStoreUrl"
            label="Google Play listing"
            hint="Optional. Leave blank to remove the link from clients."
            error={urlErrors.play}
          >
            <Input
              type="url"
              {...fieldAria('playStoreUrl', true, Boolean(urlErrors.play))}
              value={draft.playStoreUrl}
              onChange={(event) => patch({ playStoreUrl: event.target.value })}
              autoComplete="off"
            />
          </FormField>

          <FormField
            id="appStoreUrl"
            label="App Store listing"
            hint="Optional. Leave blank to remove the link from clients."
            error={urlErrors.app}
          >
            <Input
              type="url"
              {...fieldAria('appStoreUrl', true, Boolean(urlErrors.app))}
              value={draft.appStoreUrl}
              onChange={(event) => patch({ appStoreUrl: event.target.value })}
              autoComplete="off"
            />
          </FormField>
        </div>

        {/*
         * Fenced off and labelled. These three flags are carried in the public
         * config but nothing consumes them yet — no processor is wired up. An
         * unlabelled pair of switches next to real settings would read as a
         * live billing control, which is exactly the wrong impression to give
         * on a page where every other toggle does something immediately.
         */}
        <div className="space-y-3 rounded-lg border border-border bg-surface-muted p-4">
          <div>
            <p className="text-overline text-foreground-muted">
              Placeholder — not wired to a payment processor
            </p>
            <p className="text-caption text-foreground-muted">
              These flags are published to clients so they can prepare for billing.
              Turning one on charges nobody and enables nothing today.
            </p>
          </div>

          <label className="flex items-center justify-between gap-4">
            <span className="text-body">Payments enabled</span>
            <Switch
              checked={draft.paymentEnabled}
              disabled={!canEdit}
              onCheckedChange={(checked) => patch({ paymentEnabled: checked })}
              aria-label="Payments enabled"
            />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span className="text-body">Subscription plans enabled</span>
            <Switch
              checked={draft.subscriptionPlansEnabled}
              disabled={!canEdit}
              onCheckedChange={(checked) =>
                patch({ subscriptionPlansEnabled: checked })
              }
              aria-label="Subscription plans enabled"
            />
          </label>

          <p className="text-caption text-foreground-muted">
            Provider: <span className="font-medium">{draft.paymentProvider}</span>
          </p>
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
