import { useCallback, useEffect, useRef, useState } from 'react'

import { PERMISSIONS } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ErrorState, LoadingState } from '@/components/feedback'
import { Input } from '@/components/ui/input'
import { fieldAria, FormField } from '@/components/form'
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard'
import {
  MEDIA_SIZE_MAX_MB,
  MEDIA_SIZE_MIN_MB,
  type SystemSettings,
} from '@/types/settings'

import { updateChatSettings } from '../api'
import { SettingsCard } from '../SettingsCard'
import { buildChatPayload } from '../serialize'
import { useSettingsMutation, useSettingsQuery } from '../useSettings'
import { FileTypeEditor } from './FileTypeEditor'

/**
 * Chat and media limits — `PATCH /admin/settings/chat`.
 *
 * Both fields here are quietly destructive. The size limit is what the mobile
 * app checks before it will let someone attach a file, and the type list
 * **replaces** rather than merges — so an extension left off the list stops
 * being sendable the moment this is saved, with nothing to say why on the
 * user's side.
 */

/** Rough intuition for what a limit means, so the number is not abstract. */
function sizeExample(mb: number): string {
  if (mb <= 5) return 'about a high-resolution photo'
  if (mb <= 15) return 'about a 15-second video'
  if (mb <= 40) return 'about a 30-second video'
  if (mb <= 75) return 'about a minute of video'
  return 'several minutes of video'
}

export function ChatTab() {
  const { can } = useAuth()
  const canEdit = can(PERMISSIONS.configurationConfigure)
  const query = useSettingsQuery()

  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [size, setSize] = useState('')
  const [types, setTypes] = useState<readonly string[]>([])
  const [sizeError, setSizeError] = useState<string | null>(null)

  const settings = query.data?.settings
  const seededVersion = useRef<string | null>(null)

  const seed = useCallback((record: SystemSettings) => {
    seededVersion.current = record.updatedAt
    setSize(String(record.maxMediaFileSizeMB))
    setTypes(record.allowedFileTypes)
    setSizeError(null)
  }, [])

  useEffect(() => {
    if (!settings) return
    if (seededVersion.current === settings.updatedAt) return
    seed(settings)
  }, [settings, seed])

  const mutation = useSettingsMutation(updateChatSettings, (saved) => {
    seed(saved)
    setSavedMessage('Saved. Clients pick this up within a minute.')
  })

  const dirty = settings
    ? size !== String(settings.maxMediaFileSizeMB) ||
      types.join(',') !== settings.allowedFileTypes.join(',')
    : false

  useUnsavedChangesGuard(dirty && canEdit)

  if (query.isPending) return <LoadingState variant="form" />
  if (query.isError || !settings) {
    return (
      <ErrorState
        title="Settings could not be loaded"
        description="The chat settings did not load. Nothing has been changed."
        onRetry={() => void query.refetch()}
      />
    )
  }

  const parsedSize = Number(size)

  function submit() {
    /*
     * Checked here as well as server-side. The bound is stated in the hint, so
     * the operator should never meet it — but a round trip to be told "minimum
     * is 1MB" is a worse way to learn it than an immediate message.
     */
    if (!Number.isInteger(parsedSize)) {
      setSizeError('Enter a whole number of megabytes.')
      return
    }
    if (parsedSize < MEDIA_SIZE_MIN_MB || parsedSize > MEDIA_SIZE_MAX_MB) {
      setSizeError(`Choose between ${MEDIA_SIZE_MIN_MB} and ${MEDIA_SIZE_MAX_MB} MB.`)
      return
    }
    if (types.length === 0) {
      return
    }

    setSizeError(null)
    void mutation
      .mutateAsync(
        buildChatPayload({ maxMediaFileSizeMB: parsedSize, allowedFileTypes: types }),
      )
      .catch(() => {
        /* Rendered by the card's error slot. */
      })
  }

  return (
    <SettingsCard
      title="Attachments"
      description="Applies to every file a user sends in a chat, on any client."
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
        <FormField
          id="maxMediaFileSizeMB"
          label="Maximum file size"
          hint={`${MEDIA_SIZE_MIN_MB}–${MEDIA_SIZE_MAX_MB} MB.${
            Number.isFinite(parsedSize) && parsedSize > 0
              ? ` ${parsedSize} MB is ${sizeExample(parsedSize)}.`
              : ''
          }`}
          error={sizeError ?? undefined}
          className="max-w-xs"
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={MEDIA_SIZE_MIN_MB}
              max={MEDIA_SIZE_MAX_MB}
              {...fieldAria('maxMediaFileSizeMB', true, Boolean(sizeError))}
              value={size}
              onChange={(event) => {
                setSize(event.target.value)
                setSizeError(null)
              }}
            />
            <span className="text-body text-foreground-muted">MB</span>
          </div>
        </FormField>

        <FormField id="allowedFileTypes" label="Allowed file types">
          <FileTypeEditor value={types} onChange={setTypes} disabled={!canEdit} />
        </FormField>
      </fieldset>

      {!canEdit ? (
        <p className="text-caption text-foreground-muted">
          Your role can view these settings but not change them.
        </p>
      ) : null}
    </SettingsCard>
  )
}
