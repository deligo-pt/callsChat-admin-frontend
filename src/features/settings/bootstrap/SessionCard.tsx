import { isAppError } from '@/api/errors'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'

import type { BootstrapConfig } from '@/types/bootstrap'

import { SettingsCard } from '../SettingsCard'
import { DangerousSwitch } from './DangerousSwitch'
import { isValidSemver } from './semver'
import { useUpdateBootstrapMutation } from './useBootstrap'

/**
 * Signing users out of the mobile app (plan.md §5.5, phase B3).
 *
 * Two controls, and they differ in blast radius rather than in kind:
 *
 * - **Global force logout** destroys every session on every device, for
 *   everyone. It goes through `ConfirmActionDialog`.
 * - **Sign out below version** destroys sessions only for clients older than
 *   the given version — the surgical form of the same act, used after a
 *   security fix. It is a text field with its own save, because choosing the
 *   version *is* the decision and a dialog on top would ask the operator to
 *   confirm something they just typed.
 *
 * ⚠️ Both are irreversible in the sense that matters: turning the switch back
 * off does not sign anyone back in. The copy says so rather than implying the
 * switch is a toggle whose off state restores anything.
 */
export function SessionCard({
  config,
  canEdit,
}: {
  config: BootstrapConfig
  canEdit: boolean
}) {
  const [threshold, setThreshold] = useState(config.forceLogoutBeforeVersion ?? '')
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const mutation = useUpdateBootstrapMutation(config.platform, () => {
    setSavedMessage(
      'Saved. Clients below this version are signed out on their next start.',
    )
  })

  /* Adjust during render, not in an effect — see `FeatureFlagsCard`. */
  const [seededVersion, setSeededVersion] = useState(config.configVersion)
  if (seededVersion !== config.configVersion) {
    setSeededVersion(config.configVersion)
    setThreshold(config.forceLogoutBeforeVersion ?? '')
    setError(null)
  }

  const stored = config.forceLogoutBeforeVersion ?? ''
  const dirty = threshold.trim() !== stored

  function saveThreshold() {
    const value = threshold.trim()

    if (value.length > 0 && !isValidSemver(value)) {
      /*
       * The server accepts any string here, and a value that is not a version
       * signs nobody out — the same silent no-op as a non-SemVer blocked
       * version (§3.4).
       */
      setError(`"${value}" is not a version number, so it would sign no one out.`)
      return
    }

    setSavedMessage(null)
    setError(null)
    mutation.mutate({
      platform: config.platform,
      /* Cleared with `null`, meaning "no threshold", not an empty version. */
      forceLogoutBeforeVersion: value.length > 0 ? value : null,
    })
  }

  return (
    <SettingsCard
      title="Session & security"
      description="Signing users out of the mobile app. They must sign in again."
      tone={config.forceLogout ? 'danger' : 'default'}
    >
      <div className="space-y-5">
        <DangerousSwitch
          config={config}
          field="forceLogout"
          label="Global force logout"
          description="Signs out every user, on every device, immediately."
          title="Sign out every user"
          confirmLabel="Sign everyone out"
          effect={(platform) =>
            `Every signed-in ${platform === 'ANDROID' ? 'Android' : 'iOS'} user is signed out the next time the app is opened, and must sign in again. Turning this off afterwards does not sign anyone back in.`
          }
          canEdit={canEdit}
        />

        <div className="space-y-1.5 border-t border-border pt-4">
          <Label htmlFor="bootstrap-logout-before">Sign out below version</Label>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <Input
                id="bootstrap-logout-before"
                value={threshold}
                onChange={(event) => {
                  setThreshold(event.target.value)
                  if (error) setError(null)
                }}
                placeholder="1.2.0"
                className="font-mono"
                disabled={!canEdit || mutation.isPending}
                aria-describedby="bootstrap-logout-before-hint"
                aria-invalid={error ? true : undefined}
              />
            </div>
            {canEdit && dirty ? (
              <Button
                type="button"
                onClick={saveThreshold}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            ) : null}
          </div>
          <p
            id="bootstrap-logout-before-hint"
            className="text-caption text-foreground-muted"
          >
            Signs out only users on an older version than this — the usual choice after
            a security fix. Leave empty to sign nobody out by version.
          </p>

          {error ? (
            <p className="text-caption text-danger-foreground" role="alert">
              {error}
            </p>
          ) : null}
          {savedMessage ? (
            <p className="text-caption text-success-foreground">{savedMessage}</p>
          ) : null}
          {mutation.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {isAppError(mutation.error)
                  ? mutation.error.message
                  : 'That change could not be saved. Sessions are unchanged.'}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </SettingsCard>
  )
}
