import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Send } from 'lucide-react'
import { useId, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { applyServerFieldErrors, formLevelMessage } from '@/api/formErrors'
import { FormField, fieldAria } from '@/components/form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { formatCount } from '@/lib/format'
import { useReturnFocus } from '@/lib/hooks/useReturnFocus'
import { resolveStatus } from '@/lib/status'
import {
  announcementMediaTypeFor,
  ANNOUNCEMENT_AUDIENCE_VALUES,
  ANNOUNCEMENT_PRIORITY_VALUES,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  type Announcement,
  type AnnouncementStatus,
} from '@/types/announcement'

import { AUDIENCE_LABELS } from './labels'
import {
  announcementFormSchema,
  ANNOUNCEMENT_FORM_DEFAULTS,
  ANNOUNCEMENT_FORM_FIELDS,
  buildWritePayload,
  toFormValues,
  type AnnouncementFormValues,
} from './schemas'
import { MediaField } from './MediaField'
import {
  useCreateAnnouncementMutation,
  useUpdateAnnouncementMutation,
  useUploadAnnouncementMediaMutation,
} from './useAnnouncements'

/**
 * Compose or edit an announcement (plan.md §5, phase B3).
 *
 * ⚠️ **Everything this dialog sends is addressed to the entire userbase, and
 * there is no unsend.** `broadcast.md` §2 has the backend emit
 * `announcement:new` across the global socket cluster and fire an in-app toast
 * the instant a record is published. Four things follow, and none of them is
 * list-page convention.
 *
 * 1. **`status` is not a form field.** There is no status dropdown anywhere:
 *    the operator presses *Save as draft* or *Publish now*, and the button they
 *    pressed is what decides. A select would let "published" be the value
 *    sitting in a control nobody looked at — and §3.5 leaves exactly two
 *    outcomes, so a third option would be fiction.
 * 2. **Publishing asks twice.** Not because confirmation is a reflex, but
 *    because this is the one control in the panel whose effect lands on every
 *    phone on the platform before the response returns.
 * 3. **Media uploads on commit, never on selection** (§3.4). The route has no
 *    delete, so an abandoned draft must leave nothing behind.
 * 4. **No detail route exists**, so the form is seeded from the list row it was
 *    opened from (§3.2), and the list is refetched afterwards rather than
 *    patched from the write response.
 *
 * There is **no unsaved-changes guard**. Unlike `StaffCreatePage`, this is a
 * dialog rather than a route: closing it is an explicit gesture on a control
 * labelled Cancel, and `useBlocker` does not apply to a dialog anyway. The
 * cost of being wrong is retyping a headline, which is not worth a second
 * confirmation on top of the publish one.
 */

export interface AnnouncementEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The row being edited, or `null` to compose a new announcement. */
  record: Announcement | null
}

export function AnnouncementEditorDialog({
  open,
  onOpenChange,
  record,
}: AnnouncementEditorDialogProps) {
  const returnFocus = useReturnFocus(open)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        /*
         * Opened from state rather than a `DialogTrigger`, so Radix has no
         * element to restore focus to and a keyboard user would land at the top
         * of the document with the button they came from lost.
         */
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus()
        }}
        className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[680px]"
      >
        {/*
         * The form lives in a child so Radix unmounts it on close. State and
         * the chosen file therefore reset on every open, with no effect and no
         * chance of a previous draft's copy being reused for a new one.
         *
         * `key` additionally remounts it when the operator moves from one row
         * to another without closing — without it, `defaultValues` is read once
         * and the second row would open showing the first row's copy.
         */}
        <EditorForm
          key={record?.id ?? 'new'}
          record={record}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function EditorForm({
  record,
  onDone,
}: {
  record: Announcement | null
  onDone: () => void
}) {
  const titleId = useId()
  const contentId = useId()
  const actionTextId = useId()
  const actionUrlId = useId()
  const pinnedId = useId()

  const isEdit = record !== null
  const wasPublished = record?.status === 'PUBLISHED'

  const createMutation = useCreateAnnouncementMutation()
  const updateMutation = useUpdateAnnouncementMutation()
  const uploadMutation = useUploadAnnouncementMediaMutation()

  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: record ? toFormValues(record) : ANNOUNCEMENT_FORM_DEFAULTS,
  })

  /** Chosen but not uploaded. Deliberately NOT form state — see `MediaField`. */
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  /**
   * Which destructive save the operator has asked for and not yet confirmed.
   *
   * ⚠️ An inline confirm step rather than a nested `ConfirmActionDialog`. That
   * component is the gateway for actions on an existing record and collects a
   * reason the announcements API has nowhere to put; nesting a second modal
   * over a form the operator is mid-way through would also hide the copy they
   * are about to broadcast at the exact moment they are deciding to send it.
   * Here the copy stays on screen behind the question.
   */
  const [confirming, setConfirming] = useState<AnnouncementStatus | null>(null)

  const content = useWatch({ control: form.control, name: 'content' })
  const titleValue = useWatch({ control: form.control, name: 'title' })

  const busy =
    createMutation.isPending || updateMutation.isPending || uploadMutation.isPending

  const serverError =
    formLevelMessage(createMutation.error) ??
    formLevelMessage(updateMutation.error) ??
    formLevelMessage(uploadMutation.error)

  /**
   * Save with the given status.
   *
   * The order matters and is the §3.4 rule: **validate, then upload, then
   * write.** If validation fails nothing was uploaded; if the upload fails
   * nothing was written; and the only permanent side effect happens after the
   * operator has committed.
   */
  const save = (status: AnnouncementStatus) =>
    form.handleSubmit(async (values) => {
      try {
        let payloadValues = values

        if (pendingFile) {
          const mediaType = announcementMediaTypeFor(pendingFile.type)
          const upload = await uploadMutation.mutateAsync(pendingFile)

          payloadValues = {
            ...values,
            mediaUrl: upload.url,
            mediaKey: upload.key,
            /*
             * ⚠️ Resolved from the file, not from the upload response. The
             * service echoes whatever `Content-Type` it was handed and does no
             * sniffing, and a record with a `mediaUrl` but no `mediaType`
             * leaves the mobile client unable to choose between a lightbox and
             * a video player.
             */
            mediaType: mediaType ?? '',
            mediaSize: pendingFile.size,
            /*
             * Duration is not available without decoding the file, and the
             * service does not require it. Left null rather than guessed.
             */
            mediaDuration: null,
          }
        }

        const payload = buildWritePayload(payloadValues, status)

        if (record) {
          await updateMutation.mutateAsync({ id: record.id, payload })
        } else {
          await createMutation.mutateAsync(payload)
        }

        /*
         * ⚠️ "is live for" rather than "has been notified". The server emits
         * `announcement:new` across the socket cluster (`broadcast.md` §2) —
         * what it cannot tell us is that anybody received it. This panel has a
         * standing rule against reporting delivery it has not observed, and a
         * toast claiming every user was notified would break it on the one
         * screen where the operator most wants to believe it.
         */
        toast.success(
          status === 'PUBLISHED'
            ? 'Published. It is live for every matching user now.'
            : record
              ? 'Changes saved.'
              : 'Saved as a draft. Nobody has been notified.',
        )
        onDone()
      } catch (error) {
        /*
         * The service concatenates every bad field into one message —
         * `body/title …, body/priority …` — and `applyServerFieldErrors`
         * already splits exactly that shape. Anything it cannot attribute
         * falls through to the alert above the fields, so no rejection is
         * swallowed.
         */
        applyServerFieldErrors(error, form.setError, ANNOUNCEMENT_FORM_FIELDS)
        setConfirming(null)
      }
    })()

  /** Publishing, or editing something already live, asks first. */
  function request(status: AnnouncementStatus) {
    const needsConfirmation = status === 'PUBLISHED'
    if (needsConfirmation) setConfirming(status)
    else void save(status)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-h3">
          {isEdit ? 'Edit announcement' : 'New announcement'}
        </DialogTitle>
        <DialogDescription>
          {isEdit && wasPublished ? (
            /*
             * ⚠️ The one thing an operator editing live copy must know: the
             * people who already read it will not read it again. An edit is not
             * a correction they will see.
             */
            <>
              This announcement is already live. Saving changes updates what new readers
              see — it does not re-notify anyone who has already read it.
            </>
          ) : (
            <>
              Published announcements reach every matching user immediately, with a
              notification. There is no way to recall one.
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      {/*
       * `-m-1.5 p-1.5` is the focus ring's clearance, not decoration.
       * `globals.css` draws focus 4px outside the element, and `overflow-y:
       * auto` promotes `overflow-x` to `auto` per spec — so this is a clipping
       * box on both axes and a field flush against it loses the ring down its
       * left and right. The negative margin cancels the padding, so the fields
       * keep their width and only the clip box grows.
       *
       * ⚠️ **It was `-mx-1.5 px-1.5` — horizontal only — and so was
       * `ConfirmActionDialog`'s, which is where the defect was first reported.
       * Both are fixed together, because this one would have been found the
       * same way a week later.** At 360 the two selects stack into one column,
       * which puts the audience select against the bottom of the clip box and
       * sliced its ring off — caught by the top/bottom checks newly added to
       * `expectFocusRingNotClipped`, which had only ever tested left and right.
       *
       * ⚠️ **`scroll-p-2` is the other half, and padding alone cannot replace
       * it.** When a keyboard user tabs to a field below the fold, the browser
       * scrolls it *just* into view — measured flush, a gap of exactly 0 to the
       * clip edge — so the ring is sliced off no matter how much padding the
       * box carries. `scroll-padding` is what tells the browser to stop short
       * when scrolling something into view; the padding then covers the fields
       * that were already visible. Both are needed.
       */}
      <div className="-m-1.5 min-h-0 scroll-p-2 space-y-4 overflow-y-auto p-1.5">
        {serverError ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          id={titleId}
          label="Headline"
          required
          error={form.formState.errors.title?.message}
          hint={`${formatCount(titleValue?.length ?? 0)} of ${formatCount(
            ANNOUNCEMENT_TITLE_MAX_LENGTH,
          )} characters.`}
        >
          <Input
            {...fieldAria(titleId, true, Boolean(form.formState.errors.title))}
            {...form.register('title')}
            placeholder="CallsChat 2.0 Live Rooms Are Here!"
            disabled={busy}
          />
        </FormField>

        <FormField
          id={contentId}
          label="Body"
          required
          error={form.formState.errors.content?.message}
          /*
           * ⚠️ A count, not a limit. The service enforces **no maximum** on
           * `content` (O6), so inventing one here would reject copy it would
           * have published — but an operator should still see how much text
           * they are pushing to every phone on the platform.
           */
          hint={`${formatCount(content?.length ?? 0)} characters. There is no limit, but every one of them reaches every matching user.`}
        >
          <Textarea
            {...fieldAria(contentId, true, Boolean(form.formState.errors.content))}
            {...form.register('content')}
            rows={5}
            placeholder="Join high-definition 10-slot audio rooms, send virtual gifts, and interact with hosts."
            disabled={busy}
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <div className="space-y-2">
                <Label htmlFor="announcement-priority" className="text-body-strong">
                  Priority
                </Label>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={busy}
                >
                  <SelectTrigger id="announcement-priority" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNOUNCEMENT_PRIORITY_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {resolveStatus('announcementPriority', value).label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-caption text-foreground-muted">
                  {/*
                   * Names the consequence rather than the field. `URGENT` is
                   * not a label on our screen — it is a rose banner on a
                   * stranger's chat list (`broadcast.md` §5.2).
                   */}
                  Decides how loudly this lands in the app.
                </p>
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="targetAudience"
            render={({ field }) => (
              <div className="space-y-2">
                <Label htmlFor="announcement-audience" className="text-body-strong">
                  Audience
                </Label>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={busy}
                >
                  <SelectTrigger id="announcement-audience" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNOUNCEMENT_AUDIENCE_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {AUDIENCE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-caption text-foreground-muted">
                  Filtered by each recipient&rsquo;s account mode.
                </p>
              </div>
            )}
          />
        </div>

        {/* Optional call to action — both halves or neither. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id={actionTextId}
            label="Button label"
            error={form.formState.errors.actionText?.message}
            hint="Optional. Leave both this and the link empty for no button."
          >
            <Input
              {...fieldAria(
                actionTextId,
                true,
                Boolean(form.formState.errors.actionText),
              )}
              {...form.register('actionText')}
              placeholder="Explore Audio Stage"
              disabled={busy}
            />
          </FormField>

          <FormField
            id={actionUrlId}
            label="Button link"
            error={form.formState.errors.actionUrl?.message}
            /*
             * ⚠️ Says plainly that nothing checks this. The service does not
             * URL-validate `actionUrl` — `"not a url"` was accepted — and the
             * documented values are app-relative paths, so the panel cannot
             * validate it either without rejecting the documented use case. A
             * typo here is a dead button on every phone, and this hint is the
             * only warning that exists.
             */
            hint="An in-app path such as /channels. Nothing validates this — a mistake becomes a button that does nothing."
          >
            <Input
              {...fieldAria(
                actionUrlId,
                true,
                Boolean(form.formState.errors.actionUrl),
              )}
              {...form.register('actionUrl')}
              placeholder="/channels"
              disabled={busy}
            />
          </FormField>
        </div>

        <Controller
          control={form.control}
          name="mediaUrl"
          render={({ field }) => (
            <MediaField
              pending={pendingFile}
              onPendingChange={setPendingFile}
              existingUrl={field.value || undefined}
              existingType={form.getValues('mediaType')}
              existingSize={form.getValues('mediaSize')}
              disabled={busy}
            />
          )}
        />

        <Controller
          control={form.control}
          name="isPinned"
          render={({ field }) => (
            <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface-muted px-3 py-2.5">
              <div className="min-w-0">
                <Label htmlFor={pinnedId} className="text-body-strong">
                  Pin to the top
                </Label>
                <p className="text-caption text-foreground-muted">
                  Keeps this above every other announcement in the app, until it is
                  unpinned.
                </p>
              </div>
              <Switch
                id={pinnedId}
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={busy}
              />
            </div>
          )}
        />
      </div>

      <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        {confirming ? (
          /*
           * ⚠️ The confirm step replaces the footer rather than covering the
           * form. The operator is being asked to send this exact copy to
           * everyone, so the copy must stay visible while they answer.
           */
          <>
            <p className="flex-1 text-caption text-danger-foreground sm:text-left">
              {wasPublished
                ? 'Save changes to a live announcement?'
                : 'Publish to every matching user now? This cannot be recalled.'}
            </p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(null)}
              disabled={busy}
            >
              Go back
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={busy}
              onClick={() => void save(confirming)}
            >
              <Send aria-hidden="true" />
              {wasPublished ? 'Save changes' : 'Yes, publish now'}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={onDone} disabled={busy}>
              Cancel
            </Button>

            {/*
             * ⚠️ **Two buttons, never a status dropdown.** §3.5 leaves exactly
             * two outcomes — draft, or live now — and a select would imply a
             * third while letting the dangerous value sit in a control nobody
             * looked at.
             *
             * On an already-published record the draft button is **absent**
             * rather than disabled: moving live copy back to `DRAFT` would
             * silently remove it from every user's feed, which is an act of
             * withdrawal and belongs behind the explicit Archive action in the
             * queue, not behind a button labelled "Save as draft".
             */}
            {!wasPublished ? (
              <Button
                type="button"
                variant="outline"
                loading={updateMutation.isPending || createMutation.isPending}
                onClick={() => request('DRAFT')}
                disabled={busy}
              >
                Save as draft
              </Button>
            ) : null}

            <Button type="button" onClick={() => request('PUBLISHED')} disabled={busy}>
              <Send aria-hidden="true" />
              {wasPublished ? 'Save changes' : 'Publish now'}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  )
}
