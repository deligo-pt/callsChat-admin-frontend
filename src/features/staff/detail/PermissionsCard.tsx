import { AlertTriangle, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { formLevelMessage } from '@/api/formErrors'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard'
import type { ModulePermission, StaffMember } from '@/types/staff'

import { PermissionGrid } from '../PermissionGrid'
import { useUpdatePermissionsMutation } from '../useStaff'

/**
 * Edit what this person can reach.
 *
 * Three rules, each one a defect this module already knows about:
 *
 * 1. **Save posts the complete array, never a delta** (§3.3). The grid's value
 *    *is* the complete intended set by construction, so there is no diffing
 *    step that could get it wrong.
 * 2. **The result is confirmed in the card, not in a toast.** A bottom-right
 *    toast sits on top of this footer's own Save button at 1024px and blocks
 *    the next click — caught by the e2e suite in S1.
 * 3. **A server response never overwrites what the operator is typing.** The
 *    grid re-seeds only when the record's identity changes, and edits in
 *    flight survive the refetch that follows a save.
 */
export function PermissionsCard({
  member,
  readOnly = false,
}: {
  member: StaffMember
  readOnly?: boolean
}) {
  const mutation = useUpdatePermissionsMutation(member.id)

  const [draft, setDraft] = useState<readonly ModulePermission[]>(
    member.adminPermissions,
  )
  const [saved, setSaved] = useState(false)

  /**
   * The version of the record the grid currently reflects.
   *
   * Without it, every background refetch re-seeds the draft and an operator
   * mid-edit has their ticks silently reverted to the server's set — the S1
   * defect, in the one place where reverting a change means quietly restoring
   * access somebody just removed.
   */
  const seeded = useRef<string | null>(null)
  const signature = `${member.id}:${member.adminPermissions.join(',')}`
  const shownFor = useRef(member.id)

  useEffect(() => {
    if (seeded.current === signature) return
    /* First render, a different member, or the server's set really changed. */
    seeded.current = signature
    setDraft(member.adminPermissions)

    /*
     * The confirmation is cleared only when the page changes subject — NOT on
     * every re-seed. A successful save invalidates the query, and the refetch
     * that follows changes the signature, so clearing here made the card wipe
     * its own "Saved." the instant it appeared. What actually makes the
     * message stale is the operator editing again, and `!isDirty` below covers
     * that.
     */
    if (shownFor.current !== member.id) {
      shownFor.current = member.id
      setSaved(false)
    }
  }, [signature, member.id, member.adminPermissions])

  const isDirty =
    draft.length !== member.adminPermissions.length ||
    draft.some((key, index) => key !== member.adminPermissions[index])

  useUnsavedChangesGuard(isDirty && !readOnly)

  const error = formLevelMessage(
    mutation.error,
    'The permissions could not be saved. Nothing has been changed.',
  )

  async function save() {
    /*
     * The whole draft, not the difference from what the server holds. The API
     * replaces the set outright, so a delta silently revokes everything the
     * operator did not re-tick.
     */
    await mutation.mutateAsync(draft)
    setSaved(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle id="permissions-heading">Module access</CardTitle>
        <CardDescription>
          What this account can reach. Saving replaces the whole set — whatever is
          ticked here becomes their complete access.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <PermissionGrid
          value={draft}
          onChange={setDraft}
          disabled={readOnly || mutation.isPending}
          aria-labelledby="permissions-heading"
        />
      </CardContent>

      {readOnly ? null : (
        <CardFooter className="flex flex-wrap items-center justify-end gap-3">
          {/* Stale the moment they start editing again. */}
          {saved && !isDirty ? (
            <p className="mr-auto flex items-center gap-2 text-caption text-success-foreground">
              <Check className="size-4" aria-hidden="true" />
              Saved. It applies to their next request.
            </p>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            disabled={!isDirty || mutation.isPending}
            onClick={() => setDraft(member.adminPermissions)}
          >
            Discard
          </Button>
          <Button
            type="button"
            disabled={!isDirty}
            loading={mutation.isPending}
            onClick={() => void save()}
          >
            Save permissions
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
