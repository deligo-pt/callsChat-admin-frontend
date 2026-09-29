import { Plus, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

import { isAppError } from '@/api/errors'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { BootstrapConfig } from '@/types/bootstrap'

import { SettingsCard } from '../SettingsCard'
import { buildFeaturesPayload } from './bootstrapSchemas'
import { useUpdateBootstrapMutation } from './useBootstrap'

/**
 * Modules the mobile app turns on or off without a release (plan.md §5.4).
 *
 * ⚠️ **The server REPLACES this map, it does not merge.** Sending
 * `{"chat":false}` deleted `calls` and `signup` outright, verified live
 * 2026-09-28 — a 200, no warning, two features silently gone.
 *
 * So this card holds **every flag in state** and sends every flag on save.
 * There is no diff anywhere in it, and `buildFeaturesPayload` takes a complete
 * record rather than a patch, so a future edit cannot reintroduce one without
 * changing the signature.
 *
 * Adding a key is deliberate rather than freeform: the API accepts any name,
 * which means a typo creates a flag the app will never read and nothing
 * reports it.
 */
export function FeatureFlagsCard({
  config,
  canEdit,
}: {
  config: BootstrapConfig
  canEdit: boolean
}) {
  const [flags, setFlags] = useState<Record<string, boolean>>({ ...config.features })
  const [newFlag, setNewFlag] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const mutation = useUpdateBootstrapMutation(config.platform, () => {
    setSavedMessage('Saved. Mobile clients pick this up on their next start.')
  })

  /*
   * Re-seed when the server's record moves — a save landing, a background
   * refetch, or a platform switch.
   *
   * Adjusted **during render** rather than in an effect: React endorses this
   * for exactly the "reset state when a prop changes" case, and an effect here
   * would be a cascading render the compiler rightly flags. It also keeps
   * `savedMessage` alive, which keying the component on `configVersion` would
   * destroy — the save itself bumps the version, so a remount would wipe the
   * confirmation the operator just earned.
   */
  const [seededVersion, setSeededVersion] = useState(config.configVersion)
  if (seededVersion !== config.configVersion) {
    setSeededVersion(config.configVersion)
    setFlags({ ...config.features })
    setError(null)
  }

  const names = Object.keys(flags)
  const dirty =
    names.length !== Object.keys(config.features).length ||
    names.some((name) => flags[name] !== config.features[name])

  function addFlag() {
    const name = newFlag.trim()
    if (name.length === 0) return

    if (name in flags) {
      setError(`"${name}" already exists.`)
      return
    }
    /*
     * The API accepts any key, so nothing server-side catches `calll` or
     * `Chat`. A name the app never reads is a flag that silently does nothing.
     */
    if (!/^[a-z][a-zA-Z0-9_]*$/.test(name)) {
      setError(
        'Use the name the app expects — letters and numbers, starting lower-case, like "videoCalls".',
      )
      return
    }

    setFlags({ ...flags, [name]: false })
    setNewFlag('')
    setError(null)
    setSavedMessage(null)
  }

  function toggle(name: string, value: boolean) {
    setFlags({ ...flags, [name]: value })
    setSavedMessage(null)
  }

  return (
    <SettingsCard
      title="Feature flags"
      description="Modules the mobile app turns on or off without a release."
      {...(canEdit
        ? {
            onSubmit: (event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault()
              setSavedMessage(null)
              /* ⚠️ The whole map, always — the server replaces it. */
              mutation.mutate(buildFeaturesPayload(config.platform, flags))
            },
          }
        : {})}
      onDiscard={() => {
        setFlags({ ...config.features })
        setError(null)
        setSavedMessage(null)
      }}
      isDirty={dirty}
      isSaving={mutation.isPending}
      error={mutation.error}
      successMessage={savedMessage}
      updatedAt={config.updatedAt}
      updatedBy={config.updatedBy}
    >
      <div className="space-y-4">
        {/*
         * Stated on the card, not in a code comment. An operator who assumes
         * this behaves like every other partial save on this screen will turn
         * one flag off and delete the rest.
         */}
        <p className="flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Saving replaces the whole list. Every flag shown here is sent together, so
            removing one from this screen removes it from the app.
          </span>
        </p>

        {names.length === 0 ? (
          <p className="text-caption text-foreground-subtle">No flags are set.</p>
        ) : (
          <ul className="space-y-3">
            {names.map((name) => (
              <li key={name} className="flex items-center justify-between gap-4">
                <Label
                  htmlFor={`flag-${name}`}
                  className="min-w-0 font-mono wrap-anywhere"
                >
                  {name}
                </Label>
                <Switch
                  id={`flag-${name}`}
                  checked={flags[name] === true}
                  disabled={!canEdit}
                  onCheckedChange={(next) => toggle(name, next)}
                />
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <div className="space-y-2 border-t border-border pt-4">
            <Label htmlFor="bootstrap-new-flag">Add a flag</Label>
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  id="bootstrap-new-flag"
                  value={newFlag}
                  onChange={(event) => {
                    setNewFlag(event.target.value)
                    if (error) setError(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addFlag()
                    }
                  }}
                  placeholder="videoCalls"
                  className="font-mono"
                  aria-describedby="bootstrap-new-flag-hint"
                  aria-invalid={error ? true : undefined}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={addFlag}
                disabled={!newFlag.trim()}
              >
                <Plus aria-hidden="true" />
                Add
              </Button>
            </div>
            <p
              id="bootstrap-new-flag-hint"
              className="text-caption text-foreground-muted"
            >
              The app decides what a flag means. A name it does not read does nothing.
            </p>
            {error ? (
              <p className="text-caption text-danger-foreground" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

        {mutation.isError && !isAppError(mutation.error) ? (
          <Alert variant="destructive">
            <AlertDescription>
              The feature flags could not be saved. Nothing has been changed.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </SettingsCard>
  )
}
