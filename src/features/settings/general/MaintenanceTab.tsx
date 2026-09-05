import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { PERMISSIONS } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { StatusBadge } from '@/components/display'
import { ErrorState, LoadingState } from '@/components/feedback'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { resolveMaintenanceState } from '@/lib/status'
import type { SystemSettings } from '@/types/settings'
import { fieldAria, FormField } from '@/components/form'

import { updateMaintenanceSettings } from '../api'
import { SettingsCard } from '../SettingsCard'
import { buildMaintenancePayload, type MaintenanceFormValues } from '../serialize'
import { useSettingsMutation, useSettingsQuery } from '../useSettings'
import { MaintenanceDialog } from './MaintenanceDialog'

/**
 * Maintenance mode — `PATCH /admin/settings/general`.
 *
 * Its own tab, never a switch buried among the brand fields. This is the
 * single highest-blast-radius control in the admin panel: turning it on
 * answers `503` to every non-admin route, for every user, at once.
 *
 * Three things follow from that, and none of them are decoration:
 *
 * 1. **The switch does not save.** Turning it on opens a typed confirmation;
 *    the message and window are saved separately. Nothing here takes the
 *    product down as a side effect of editing a text field.
 * 2. **Turning it off is one click, ungated.** Restoring service is never
 *    slowed down.
 * 3. **The window is advisory.** The backend does not act on it — no schedule
 *    fires, nothing turns itself on or off. The copy says so, because a
 *    scheduling field that does not schedule is worse than no field.
 */

/** `datetime-local` wants `YYYY-MM-DDTHH:mm`, not a full ISO instant. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function MaintenanceTab() {
  const { can } = useAuth()
  const canEdit = can(PERMISSIONS.configurationConfigure)
  const query = useSettingsQuery()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [draft, setDraft] = useState<Omit<MaintenanceFormValues, 'maintenanceMode'>>({
    maintenanceMessage: '',
    maintenanceStartsAt: '',
    maintenanceEndsAt: '',
  })

  const settings = query.data?.settings
  const seededVersion = useRef<string | null>(null)

  const seed = useCallback((record: SystemSettings) => {
    seededVersion.current = record.updatedAt
    setDraft({
      maintenanceMessage: record.maintenanceMessage ?? '',
      maintenanceStartsAt: toLocalInput(record.maintenanceStartsAt),
      maintenanceEndsAt: toLocalInput(record.maintenanceEndsAt),
    })
  }, [])

  useEffect(() => {
    if (!settings) return
    if (seededVersion.current === settings.updatedAt) return
    seed(settings)
  }, [settings, seed])

  const mutation = useSettingsMutation(updateMaintenanceSettings, (saved) => {
    seed(saved)
    setDialogOpen(false)
    /*
     * Only the recovery is confirmed in the card's success slot. Reporting
     * "maintenance is live" in success-green while the product is down reads
     * as reassurance at exactly the wrong moment — and that state already has
     * three louder signals: the status badge, the danger alert, and the global
     * banner on every screen.
     */
    setSavedMessage(
      saved.maintenanceMode ? null : 'Maintenance mode is off. Service has resumed.',
    )
  })

  if (query.isPending) return <LoadingState variant="form" />
  if (query.isError || !settings) {
    return (
      <ErrorState
        title="Settings could not be loaded"
        description="The maintenance state did not load. Nothing has been changed."
        onRetry={() => void query.refetch()}
      />
    )
  }

  const isActive = settings.maintenanceMode
  const state = resolveMaintenanceState(isActive, settings.maintenanceStartsAt)

  function save(maintenanceMode: boolean) {
    void mutation
      .mutateAsync(buildMaintenancePayload({ ...draft, maintenanceMode }))
      .catch(() => {
        /* Rendered by the card's error slot. */
      })
  }

  const detailsChanged =
    draft.maintenanceMessage !== (settings.maintenanceMessage ?? '') ||
    draft.maintenanceStartsAt !== toLocalInput(settings.maintenanceStartsAt) ||
    draft.maintenanceEndsAt !== toLocalInput(settings.maintenanceEndsAt)

  return (
    <>
      <SettingsCard
        tone="danger"
        title="Maintenance mode"
        description="Blocks the product for every user. The admin panel stays reachable."
        error={mutation.error}
        successMessage={detailsChanged ? null : savedMessage}
        updatedAt={settings.updatedAt}
        updatedBy={settings.updatedBy}
        onSubmit={(event) => {
          event.preventDefault()
          save(isActive)
        }}
        onDiscard={() => seed(settings)}
        isDirty={detailsChanged}
        isSaving={mutation.isPending}
        saveLabel="Save message"
      >
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-body-strong">Status</span>
              <StatusBadge domain="maintenance" value={state} />
            </div>
            <p className="text-caption text-foreground-muted">
              {isActive
                ? 'Every user is currently receiving a service-unavailable error.'
                : 'The product is running normally.'}
            </p>
          </div>

          {canEdit ? (
            isActive ? (
              /*
               * One click, no dialog. The only thing worse than an accidental
               * outage is a slow recovery from one.
               */
              <Button
                type="button"
                variant="primary"
                loading={mutation.isPending}
                onClick={() => save(false)}
              >
                End maintenance
              </Button>
            ) : (
              <Button
                type="button"
                variant="danger"
                onClick={() => setDialogOpen(true)}
              >
                Start maintenance
              </Button>
            )
          ) : null}
        </div>

        {isActive ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>
              CallsChat is down for users right now. End maintenance as soon as the work
              is finished.
            </AlertDescription>
          </Alert>
        ) : null}

        {/*
         * `space-y-4` on the fieldset, not just on the card body: `contents`
         * removes the fieldset's own box, so the card's `space-y-4` — which
         * targets its DIRECT children — sees one fieldset rather than the two
         * blocks inside it, and they end up touching.
         */}
        <fieldset disabled={!canEdit} className="contents space-y-4">
          <FormField
            id="maintenanceMessage"
            label="Message shown to users"
            hint="Returned with the 503 response. Leave blank for a bare error."
          >
            <Textarea
              {...fieldAria('maintenanceMessage', true, false)}
              rows={3}
              value={draft.maintenanceMessage}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  maintenanceMessage: event.target.value,
                }))
              }
            />
          </FormField>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              id="maintenanceStartsAt"
              label="Window starts"
              hint="Advisory only."
            >
              <Input
                type="datetime-local"
                {...fieldAria('maintenanceStartsAt', true, false)}
                value={draft.maintenanceStartsAt}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    maintenanceStartsAt: event.target.value,
                  }))
                }
              />
            </FormField>

            <FormField id="maintenanceEndsAt" label="Window ends" hint="Advisory only.">
              <Input
                type="datetime-local"
                {...fieldAria('maintenanceEndsAt', true, false)}
                value={draft.maintenanceEndsAt}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    maintenanceEndsAt: event.target.value,
                  }))
                }
              />
            </FormField>
          </div>
        </fieldset>

        {/*
         * Said plainly. The window is metadata the backend never reads: no job
         * turns maintenance on at the start time or off at the end. A field
         * that looks like a schedule but is not would be trusted once and only
         * once.
         */}
        <p className="text-caption text-foreground-muted">
          The window is shown to users and recorded for reference. It does not switch
          anything on or off — only the button above does that.
        </p>

        {!canEdit ? (
          <p className="text-caption text-foreground-muted">
            Your role can view the maintenance state but not change it.
          </p>
        ) : null}
      </SettingsCard>

      <MaintenanceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={() => save(true)}
        isSaving={mutation.isPending}
        message={draft.maintenanceMessage}
      />
    </>
  )
}
