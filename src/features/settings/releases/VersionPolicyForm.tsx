import { useCallback, useEffect, useRef, useState } from 'react'

import { StatusBadge } from '@/components/display'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { isPolicyCoherent } from '@/lib/semver'
import type { AppVersionPolicy } from '@/types/settings'
import { fieldAria, FormField } from '@/components/form'

import { updateVersionPolicy } from '../api'
import { SettingsCard } from '../SettingsCard'
import { buildVersionPolicyPayload, type VersionPolicyFormValues } from '../serialize'
import { useSettingsMutation } from '../useSettings'
import { ForceUpdateDialog } from './ForceUpdateDialog'

/**
 * One platform's release policy — `PATCH .../deployment/app-versions`.
 *
 * Two server behaviours drive the whole design:
 *
 * 1. **The route replaces, it does not merge.** Sending only the three required
 *    fields wiped `buildNumber` and `releaseNotes` on the live iOS policy
 *    during contract testing. Every field is therefore always submitted, via
 *    `buildVersionPolicyPayload` — omitting one is data loss, never "leave it
 *    alone", and the hints say so.
 * 2. **There is no `minRequiredVersion <= latestVersion` check.** `latest 1.0.0`
 *    with `min 99.0.0` was accepted. Combined with `forceUpdate` that tells
 *    every user to install a build that does not exist, so the guard below
 *    blocks the save. It is UX, not enforcement (plan.md §3.4) — anything with
 *    an API client can still write the bad pair.
 */

const STORE_NAME = {
  ANDROID: 'Google Play Store',
  IOS: 'App Store',
} as const

const OS_NAME = { ANDROID: 'Android', IOS: 'iOS' } as const

function toForm(policy: AppVersionPolicy): VersionPolicyFormValues {
  return {
    platform: policy.platform,
    latestVersion: policy.latestVersion,
    buildNumber: policy.buildNumber ?? '',
    minRequiredVersion: policy.minRequiredVersion,
    forceUpdate: policy.forceUpdate,
    releaseNotes: policy.releaseNotes ?? '',
  }
}

export interface VersionPolicyFormProps {
  policy: AppVersionPolicy
  canEdit: boolean
}

export function VersionPolicyForm({ policy, canEdit }: VersionPolicyFormProps) {
  const [draft, setDraft] = useState<VersionPolicyFormValues>(() => toForm(policy))
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const seededVersion = useRef(policy.updatedAt)

  const seed = useCallback((record: AppVersionPolicy) => {
    seededVersion.current = record.updatedAt
    setDraft(toForm(record))
    setProblem(null)
  }, [])

  useEffect(() => {
    if (seededVersion.current === policy.updatedAt) return
    seed(policy)
  }, [policy, seed])

  const mutation = useSettingsMutation(updateVersionPolicy, (saved) => {
    seed(saved)
    setSavedMessage('Saved. Clients pick this up within a minute.')
  })

  const dirty =
    draft.latestVersion !== policy.latestVersion ||
    draft.minRequiredVersion !== policy.minRequiredVersion ||
    draft.buildNumber !== (policy.buildNumber ?? '') ||
    draft.forceUpdate !== policy.forceUpdate ||
    draft.releaseNotes !== (policy.releaseNotes ?? '')

  const coherent = isPolicyCoherent(draft.latestVersion, draft.minRequiredVersion)
  const os = OS_NAME[policy.platform]

  function patch(changes: Partial<VersionPolicyFormValues>) {
    setDraft((current) => ({ ...current, ...changes }))
    setProblem(null)
  }

  function submit() {
    if (draft.latestVersion.trim() === '' || draft.minRequiredVersion.trim() === '') {
      setProblem('Both version numbers are required.')
      return
    }
    if (!coherent) {
      setProblem(
        `The minimum required version is above the latest release, so nobody could satisfy it.`,
      )
      return
    }

    void mutation.mutateAsync(buildVersionPolicyPayload(draft)).catch(() => {
      /* Rendered by the card's error slot. */
    })
  }

  return (
    <>
      <SettingsCard
        tone={draft.forceUpdate ? 'danger' : 'default'}
        title={`${os} release policy`}
        description={`What the ${os} app is told about updates on launch.`}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        onDiscard={() => seed(policy)}
        isDirty={dirty}
        isSaving={mutation.isPending}
        error={mutation.error}
        successMessage={dirty ? null : savedMessage}
        updatedAt={policy.updatedAt}
        updatedBy={policy.updatedBy}
      >
        <fieldset disabled={!canEdit} className="contents space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              id={`${policy.platform}-latestVersion`}
              label="Latest version"
              required
              hint={`The build users are asked to install from the ${STORE_NAME[policy.platform]}.`}
            >
              <Input
                {...fieldAria(`${policy.platform}-latestVersion`, true, false)}
                value={draft.latestVersion}
                onChange={(event) => patch({ latestVersion: event.target.value })}
                autoComplete="off"
              />
            </FormField>

            <FormField
              id={`${policy.platform}-minRequiredVersion`}
              label="Minimum required version"
              required
              hint="Anything below this is out of date."
              error={
                !coherent && draft.minRequiredVersion.trim() !== ''
                  ? 'This is above the latest release — nobody could satisfy it.'
                  : undefined
              }
            >
              <Input
                {...fieldAria(`${policy.platform}-minRequiredVersion`, true, !coherent)}
                value={draft.minRequiredVersion}
                onChange={(event) => patch({ minRequiredVersion: event.target.value })}
                autoComplete="off"
              />
            </FormField>
          </div>

          <FormField
            id={`${policy.platform}-buildNumber`}
            label="Build number"
            /*
             * Both facts are stated because both bite. The API rejects a
             * numeric `buildNumber` outright, and this route replaces rather
             * than merges — so a field cleared here is cleared on the server.
             */
            hint="Optional, and stored as text. Clearing it removes it from the policy."
            className="max-w-xs"
          >
            <Input
              {...fieldAria(`${policy.platform}-buildNumber`, true, false)}
              value={draft.buildNumber}
              onChange={(event) => patch({ buildNumber: event.target.value })}
              autoComplete="off"
              inputMode="numeric"
            />
          </FormField>

          <FormField
            id={`${policy.platform}-releaseNotes`}
            label="Release notes"
            hint="Shown in the update prompt. Clearing it removes it from the policy."
          >
            <Textarea
              {...fieldAria(`${policy.platform}-releaseNotes`, true, false)}
              rows={2}
              value={draft.releaseNotes}
              onChange={(event) => patch({ releaseNotes: event.target.value })}
            />
          </FormField>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-body-strong">Force update</span>
                {draft.forceUpdate ? (
                  <StatusBadge domain="maintenance" value="ACTIVE" />
                ) : null}
              </div>
              <p className="text-caption text-foreground-muted">
                {draft.forceUpdate
                  ? `${os} users below ${draft.minRequiredVersion || '—'} cannot use the app until they update.`
                  : `${os} users below the minimum are told to update but can carry on.`}
              </p>
            </div>

            <Switch
              checked={draft.forceUpdate}
              disabled={!canEdit}
              aria-label={`Force update on ${os}`}
              onCheckedChange={(checked) => {
                /*
                 * Arming opens a typed confirmation; disarming is immediate.
                 * Letting users back in is never slowed down.
                 */
                if (!checked) {
                  patch({ forceUpdate: false })
                  return
                }
                if (!coherent) {
                  setProblem(
                    'Fix the version numbers before forcing an update — the minimum is above the latest release.',
                  )
                  return
                }
                setDialogOpen(true)
              }}
            />
          </div>
        </fieldset>

        {problem ? (
          <p role="alert" className="text-caption text-danger">
            {problem}
          </p>
        ) : null}
      </SettingsCard>

      <ForceUpdateDialog
        open={dialogOpen}
        platform={policy.platform}
        latestVersion={draft.latestVersion}
        minRequiredVersion={draft.minRequiredVersion}
        storeName={STORE_NAME[policy.platform]}
        onOpenChange={setDialogOpen}
        onConfirm={() => patch({ forceUpdate: true })}
      />
    </>
  )
}
