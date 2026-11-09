import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { ConfirmActionDialog } from '@/components/feedback'
import { FormField } from '@/components/form'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { LegalDocument } from '@/types/legal'

import { TYPE_LABELS } from './labels'
import { toIsoDay } from './legalForm'
import { usePublishLegalDocument } from './useLegal'

/**
 * Publish a draft (plan.md §3.4, LG4). `legal.publish` — Super Admin only.
 *
 * ⚠️ **Irreversible.** The server archives the type's active version, makes
 * this one public, and from then on neither can be edited, unpublished or
 * deleted. So: the version change is spelled out, the effect is stated
 * plainly, and the operator types the version number to confirm.
 *
 * The three fields are the publish endpoint's optional overrides. They start
 * from the draft's own values and are only sent when changed, so an untouched
 * dialog publishes exactly what the draft says.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/

export interface PublishDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly draft: LegalDocument
  /** The type's current PUBLISHED version, if any — it is archived on publish. */
  readonly active: LegalDocument | undefined
  readonly onPublished: () => void
}

/**
 * ⚠️ Always mounted, never keyed per opening. Unmounting when closed skipped
 * the dialog's close handling, and a body keyed per opening mounts already
 * open, before `useReturnFocus` has seen the Publish button. Either way focus
 * never went back to Publish (found by LG6's focus test). The fields are reset
 * on each opening instead, so a reopened dialog starts from the draft again.
 */
export function PublishDialog(props: PublishDialogProps) {
  return <PublishDialogBody {...props} />
}

function PublishDialogBody({
  open,
  onOpenChange,
  draft,
  active,
  onPublished,
}: PublishDialogProps) {
  const publish = usePublishLegalDocument()
  const draftDay = draft.effectiveDate.slice(0, 10)
  const [day, setDay] = useState(draftDay)
  const [reconsent, setReconsent] = useState(draft.requiresReconsent)
  const [changelog, setChangelog] = useState(draft.changelog ?? '')
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDay(draftDay)
      setReconsent(draft.requiresReconsent)
      setChangelog(draft.changelog ?? '')
    }
  }

  const label = TYPE_LABELS[draft.documentType]
  const validDay = DAY.test(day)
  const today = new Date().toISOString().slice(0, 10)

  function confirm() {
    const payload = {
      ...(day !== draftDay ? { effectiveDate: toIsoDay(day) } : {}),
      ...(reconsent !== draft.requiresReconsent
        ? { requiresReconsent: reconsent }
        : {}),
      ...(changelog.trim() !== (draft.changelog ?? '')
        ? { changelog: changelog.trim() }
        : {}),
    }
    publish.mutate(
      { id: draft.id, payload },
      {
        onSuccess: () => {
          toast.success(`${label} v${draft.version} is now published.`)
          onOpenChange(false)
          onPublished()
        },
        onError: (error) =>
          toast.error(
            isAppError(error)
              ? error.message
              : 'The draft could not be published. Nothing was changed.',
          ),
      },
    )
  }

  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Publish ${label} v${draft.version}?`}
      target={`${label} v${draft.version}`}
      effect={
        active
          ? `v${active.version} is archived and this version becomes the one the apps show. Neither can be edited, unpublished or deleted afterwards.`
          : 'This becomes the first published version of this policy. It can’t be edited, unpublished or deleted afterwards.'
      }
      severity="critical"
      reason="none"
      typedConfirmation={draft.version}
      confirmLabel="Publish"
      loading={publish.isPending}
      confirmDisabled={!validDay}
      onConfirm={confirm}
      details={
        <div className="space-y-3">
          <p className="flex flex-wrap items-center gap-2 rounded-md bg-surface-muted px-3 py-2 text-body">
            <span className="font-mono text-foreground-muted">
              {active ? `v${active.version} (active)` : 'Nothing published'}
            </span>
            <ArrowRight className="size-4 text-foreground-muted" aria-hidden="true" />
            <span className="font-mono font-medium text-foreground">
              v{draft.version} (new)
            </span>
          </p>
          <p className="text-caption text-foreground-muted">
            The website still shows its built-in text until it is switched to the API,
            so this changes what the apps show first.
          </p>
        </div>
      }
      fields={
        <>
          <FormField
            id="publish-effective"
            label="Effective date"
            hint={
              day > today
                ? 'In the future: users see the date as advance notice.'
                : 'Takes effect immediately.'
            }
            error={validDay ? undefined : 'Pick a date.'}
          >
            <Input
              id="publish-effective"
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              aria-describedby={
                validDay ? 'publish-effective-hint' : 'publish-effective-error'
              }
            />
          </FormField>
          <label className="flex items-start gap-3 text-body">
            <Checkbox
              checked={reconsent}
              onCheckedChange={(value) => setReconsent(value === true)}
              className="mt-0.5"
            />
            <span>
              Require users to accept this version again
              <span className="block text-caption text-foreground-muted">
                The apps ask everyone to accept before they continue.
              </span>
            </span>
          </label>
          <FormField
            id="publish-changelog"
            label="Changelog"
            hint="Kept with this version in the history."
          >
            <Textarea
              id="publish-changelog"
              rows={2}
              value={changelog}
              onChange={(event) => setChangelog(event.target.value)}
              aria-describedby="publish-changelog-hint"
            />
          </FormField>
        </>
      }
    />
  )
}
