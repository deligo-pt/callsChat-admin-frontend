import { Plus, X } from 'lucide-react'
import { useState } from 'react'

import { isAppError } from '@/api/errors'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BootstrapConfig } from '@/types/bootstrap'

import { buildBlockedVersionsPayload } from './bootstrapSchemas'
import { VersionTag } from './fields'
import { isValidSemver } from './semver'
import { useUpdateBootstrapMutation } from './useBootstrap'

/**
 * Versions barred from running at all (plan.md §3.4).
 *
 * Its own control and its own save, inside the release card, for two reasons:
 *
 * 1. **The server REPLACES this array**, it does not merge. Every save sends
 *    the whole list, which is a different shape of interaction from the text
 *    fields around it — those merge, and sending a partial one is fine.
 * 2. **An entry that is not a version number blocks nobody.** The API stored
 *    `["garbage","1.2"]` without complaint, verified live. So the input
 *    validates each entry as SemVer *before* adding it, and any entry already
 *    stored that fails renders flagged rather than silently useless.
 */
export function BlockedVersionsInput({
  config,
  canEdit,
}: {
  config: BootstrapConfig
  canEdit: boolean
}) {
  const [versions, setVersions] = useState<readonly string[]>(config.blockedVersions)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useUpdateBootstrapMutation(config.platform)

  /*
   * Re-seed when the server's record moves — a save landing, a refetch, or a
   * platform switch. Keyed on `configVersion` because this endpoint bumps it
   * on every write (§3.5), so it moves whenever the record does.
   *
   * Adjusted during render rather than in an effect: React endorses this for
   * "reset state when a prop changes", and an effect would be the cascading
   * render the compiler flags.
   */
  const [seededVersion, setSeededVersion] = useState(config.configVersion)
  if (seededVersion !== config.configVersion) {
    setSeededVersion(config.configVersion)
    setVersions(config.blockedVersions)
    setError(null)
  }

  const dirty =
    versions.length !== config.blockedVersions.length ||
    versions.some((value, index) => value !== config.blockedVersions[index])

  function add() {
    const value = draft.trim()
    if (value.length === 0) return

    if (!isValidSemver(value)) {
      /*
       * The whole point of the control. The server would accept this and store
       * it, and it would then block nobody — an operator believing a bad build
       * is barred when it is not.
       */
      setError(`"${value}" is not a version number, so it would block no one.`)
      return
    }
    if (versions.includes(value)) {
      setError(`${value} is already blocked.`)
      return
    }

    setVersions([...versions, value])
    setDraft('')
    setError(null)
  }

  function remove(value: string) {
    setVersions(versions.filter((entry) => entry !== value))
    setError(null)
  }

  function save() {
    /* ⚠️ The whole array, always — the server replaces it. */
    mutation.mutate(buildBlockedVersionsPayload(config.platform, versions))
  }

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <Label htmlFor="bootstrap-blocked-draft">Blocked versions</Label>
      <p id="bootstrap-blocked-hint" className="text-caption text-foreground-muted">
        Matched as exact text — a client reporting this version is forced to update.
      </p>

      {versions.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 py-1">
          {versions.map((version, index) => (
            <li key={`${index}-${version}`} className="flex items-center">
              <VersionTag value={version} />
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => remove(version)}
                  aria-label={`Remove ${version}`}
                  className="-ml-1 touch-target rounded-sm px-1 text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-1 text-caption text-foreground-subtle">
          No versions are blocked.
        </p>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <Input
              id="bootstrap-blocked-draft"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                if (error) setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  /* Not a submit — this control saves separately. */
                  event.preventDefault()
                  add()
                }
              }}
              placeholder="1.1.0"
              className="font-mono"
              aria-describedby="bootstrap-blocked-hint"
              aria-invalid={error ? true : undefined}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={add}
            disabled={!draft.trim()}
          >
            <Plus aria-hidden="true" />
            Add
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="text-caption text-danger-foreground" role="alert">
          {error}
        </p>
      ) : null}

      {mutation.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {isAppError(mutation.error)
              ? mutation.error.message
              : 'The blocked versions could not be saved. The list is unchanged.'}
          </AlertDescription>
        </Alert>
      ) : null}

      {canEdit && dirty ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="button" onClick={save} disabled={mutation.isPending} size="sm">
            {mutation.isPending ? 'Saving…' : 'Save blocked versions'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => {
              setVersions(config.blockedVersions)
              setError(null)
            }}
          >
            Discard
          </Button>
        </div>
      ) : null}
    </div>
  )
}
