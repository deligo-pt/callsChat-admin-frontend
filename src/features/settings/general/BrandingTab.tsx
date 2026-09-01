import { Info, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { PERMISSIONS } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ErrorState, LoadingState } from '@/components/feedback'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { LOGO_ACCEPTED_TYPES } from '@/types/settings'

import { uploadBrandLogo } from '../api'
import { SettingsCard } from '../SettingsCard'
import { useSettingsMutation, useSettingsQuery } from '../useSettings'
import { formatBytes, validateLogoFile, type LogoAccepted } from './logoValidation'

/**
 * Brand logo — `POST /admin/settings/logo`.
 *
 * The one **irreversible** control in this phase. `logoUrl` has no writer on
 * any JSON route and no delete endpoint, so an upload can only ever be
 * replaced, never undone (system_settings_plan.md §3.5). The flow is therefore
 * deliberately three steps — choose, preview, commit — rather than a drop zone
 * that uploads on drop.
 */

interface Selection {
  readonly file: File
  readonly previewUrl: string
  readonly info: LogoAccepted | null
}

export function BrandingTab() {
  const { can } = useAuth()
  const canEdit = can(PERMISSIONS.configurationConfigure)
  const query = useSettingsQuery()

  const inputRef = useRef<HTMLInputElement>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [rejection, setRejection] = useState<string | null>(null)
  /* In-card, not a toast — see the note in GeneralTab. */
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  // Object URLs are retained for the document's lifetime unless revoked.
  useEffect(() => {
    return () => {
      if (selection) URL.revokeObjectURL(selection.previewUrl)
    }
  }, [selection])

  const mutation = useSettingsMutation(uploadBrandLogo, () => {
    clearSelection()
    setSavedMessage('Logo updated. Clients pick it up within a minute.')
  })

  function clearSelection() {
    setSelection((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl)
      return null
    })
    setRejection(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function onChoose(file: File | undefined) {
    if (!file) return
    setRejection(null)

    const result = await validateLogoFile(file)
    if (!result.ok) {
      setRejection(result.error.message)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setSelection((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl)
      return { file, previewUrl: URL.createObjectURL(file), info: result.info }
    })
  }

  if (query.isPending) return <LoadingState variant="form" />
  if (query.isError || !query.data) {
    return (
      <ErrorState
        title="Settings could not be loaded"
        onRetry={() => void query.refetch()}
      />
    )
  }

  const settings = query.data.settings

  return (
    <SettingsCard
      title="Brand logo"
      description="Displayed on the sign-in screen and in the mobile app header."
      updatedAt={settings.updatedAt}
      updatedBy={settings.updatedBy}
      successMessage={selection ? null : savedMessage}
      footerExtra={
        canEdit && selection ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={clearSelection}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={mutation.isPending}
              onClick={() => void mutation.mutateAsync(selection.file).catch(() => {})}
            >
              Upload logo
            </Button>
          </div>
        ) : null
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/*
         * Keyed by the URL so a new image starts with a clean "did it load?"
         * state. Resetting that in an effect would be a cascading render for
         * something React already expresses as identity.
         */}
        <LogoPreview
          key={selection?.previewUrl ?? settings.logoUrl ?? 'none'}
          label={selection ? 'New logo' : 'Current logo'}
          url={selection?.previewUrl ?? settings.logoUrl}
        />

        <div className="min-w-0 flex-1 space-y-3">
          {selection ? (
            <p className="text-body">
              {selection.file.name}
              <span className="block text-caption text-foreground-muted">
                {formatBytes(selection.file.size)}
                {selection.info
                  ? ` · ${selection.info.width}×${selection.info.height}px`
                  : ''}
                {' · not uploaded yet'}
              </span>
            </p>
          ) : (
            <p className="text-body text-foreground-muted">
              {settings.logoUrl
                ? 'Clients are showing the logo on the left.'
                : 'No logo is set. Clients fall back to their bundled default.'}
            </p>
          )}

          {rejection ? (
            <p role="alert" className="text-caption text-danger">
              {rejection}
            </p>
          ) : null}

          {canEdit ? (
            <>
              <input
                ref={inputRef}
                type="file"
                className="sr-only"
                accept={LOGO_ACCEPTED_TYPES.join(',')}
                onChange={(event) => void onChoose(event.target.files?.[0])}
                aria-label="Choose a logo file"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
              >
                <Upload />
                {selection
                  ? 'Choose a different file'
                  : settings.logoUrl
                    ? 'Replace logo'
                    : 'Choose logo'}
              </Button>
              <p className="text-caption text-foreground-muted">
                PNG, JPG, GIF, WebP, SVG, ICO, BMP or AVIF. Up to 5 MB.
              </p>
            </>
          ) : (
            <p className="text-caption text-foreground-muted">
              Your role can view the logo but not change it.
            </p>
          )}
        </div>
      </div>

      {/*
       * Stated plainly rather than discovered. The API genuinely has no way to
       * remove a logo, and an operator who uploads the wrong file needs to
       * know that before they click, not after.
       */}
      <Alert>
        <Info />
        <AlertDescription>
          A logo cannot be removed once uploaded — only replaced with another image.
          Check the preview before uploading.
        </AlertDescription>
      </Alert>
    </SettingsCard>
  )
}

/**
 * The logo on a checkerboard.
 *
 * A transparent PNG on a white card is invisible, and "invisible" and "failed
 * to load" look identical — which is exactly the confusion that would follow a
 * broken upload.
 */
function LogoPreview({ label, url }: { label: string; url: string | null }) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="space-y-2">
      <p className="text-overline text-foreground-muted">{label}</p>
      <div
        className="flex size-24 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted"
        style={{
          backgroundImage:
            'repeating-conic-gradient(var(--color-border) 0% 25%, transparent 0% 50%)',
          backgroundSize: '12px 12px',
        }}
      >
        {url && !failed ? (
          <img
            src={url}
            alt="Brand logo"
            className="max-h-20 max-w-20 object-contain"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="px-2 text-center text-caption text-foreground-subtle">
            {failed ? 'Will not load' : 'None'}
          </span>
        )}
      </div>
    </div>
  )
}
