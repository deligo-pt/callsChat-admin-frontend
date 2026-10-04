import { AlertTriangle, Image, Paperclip, Video, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/format'
import {
  announcementMediaLimitFor,
  isAllowedAnnouncementMedia,
  ANNOUNCEMENT_IMAGE_MIME_TYPES,
  ANNOUNCEMENT_VIDEO_MIME_TYPES,
  type AnnouncementMediaType,
} from '@/types/announcement'

/**
 * Choose an attachment — image or short video (plan.md §3.4, phase B3).
 *
 * ⚠️ **This component never uploads anything.** It holds the chosen `File` and
 * hands it up; `AnnouncementEditorDialog` uploads on commit and nowhere else.
 * That split is the whole design: `POST /media/upload` has **no delete route**,
 * so every accepted byte is permanent and publicly readable, and uploading on
 * selection would litter the CDN with an orphan for every abandoned draft.
 *
 * ⚠️ **The validation here is the only validation there is, and it is ours.**
 * The server checks nothing — it accepted a `text/plain` file during contract
 * probing and served it back from a public host — so this gate is a courtesy to
 * the operator, not a security boundary. Anyone with an admin token can bypass
 * it with curl. It exists because `broadcast.md` §5.2 renders only an image
 * lightbox or a video player, so anything outside these types would reach a
 * client that cannot show it.
 */

const ACCEPT = [
  ...ANNOUNCEMENT_IMAGE_MIME_TYPES,
  ...ANNOUNCEMENT_VIDEO_MIME_TYPES,
].join(',')

export interface MediaFieldProps {
  /** A file chosen in this session, not yet uploaded. */
  pending: File | null
  onPendingChange: (file: File | null) => void

  /** An attachment the record already carries, if any. */
  existingUrl?: string | undefined
  existingType?: AnnouncementMediaType | '' | undefined
  existingSize?: number | null | undefined

  disabled?: boolean
}

export function MediaField({
  pending,
  onPendingChange,
  existingUrl,
  existingType,
  existingSize,
  disabled = false,
}: MediaFieldProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [rejection, setRejection] = useState<string | null>(null)

  const hasExisting = Boolean(existingUrl)

  function choose(file: File | null) {
    setRejection(null)
    if (!file) {
      onPendingChange(null)
      return
    }

    const verdict = isAllowedAnnouncementMedia(file)
    if (!verdict.ok) {
      /*
       * The message names the rule AND the value, because the operator is about
       * to retry and needs to know which way to go. "Unsupported file" alone
       * sends them back to a file picker with nothing learned.
       */
      setRejection(
        verdict.reason === 'UNSUPPORTED_TYPE'
          ? `${file.type || 'That file type'} cannot be attached. Use a PNG, JPEG, WebP or GIF image, or an MP4 or WebM video.`
          : `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(
              announcementMediaLimitFor(
                file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE',
              ),
            )}.`,
      )
      onPendingChange(null)
      /*
       * Clear the native input too, so choosing the same file again re-fires
       * `change`. Without this a corrected re-pick of the identical file is
       * silently ignored and the error looks sticky.
       */
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    onPendingChange(file)
  }

  return (
    <div className="space-y-2">
      {/*
       * ⚠️ A real `<label htmlFor>`, not a styled `<span>`. It was a span until
       * `editor.test.tsx` could not find the control by its name — which is
       * exactly what a screen-reader user would have hit: a file input
       * announced as nothing but "button". The visible text was always there;
       * the association was not.
       */}
      <label htmlFor={inputId} className="block text-body-strong">
        Attachment
      </label>

      {/* What the record already has. */}
      {hasExisting && !pending ? (
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2">
          {existingType === 'VIDEO' ? (
            <Video
              className="size-4 shrink-0 text-foreground-muted"
              aria-hidden="true"
            />
          ) : (
            <Image
              className="size-4 shrink-0 text-foreground-muted"
              aria-hidden="true"
            />
          )}
          <span className="min-w-0 flex-1 truncate text-body">
            {existingType === 'VIDEO' ? 'Video attached' : 'Image attached'}
            {typeof existingSize === 'number' ? (
              <span className="text-foreground-muted">
                {' '}
                · {formatBytes(existingSize)}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      {/* A file chosen in this session. */}
      {pending ? (
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-primary bg-primary-soft px-3 py-2">
          <Paperclip className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-body" title={pending.name}>
            {pending.name}
            <span className="text-foreground-muted">
              {' '}
              · {formatBytes(pending.size)}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${pending.name}`}
            disabled={disabled}
            onClick={() => {
              onPendingChange(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => choose(event.target.files?.[0] ?? null)}
      />

      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip aria-hidden="true" />
        {pending || hasExisting
          ? 'Choose a different file'
          : 'Attach an image or video'}
      </Button>

      {rejection ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{rejection}</AlertDescription>
        </Alert>
      ) : (
        <p className="text-caption text-foreground-muted">
          {/*
           * ⚠️ **The permanence warning is not boilerplate.** `/media/upload`
           * has no delete route, so an attachment can only ever be replaced by
           * another upload or destroyed by deleting the whole announcement
           * (§3.4). An operator who assumes they can tidy it up later is
           * assuming something that is not true, and this line is the only
           * place the panel can tell them.
           */}
          Uploaded when you save. An attachment cannot be removed afterwards — only
          replaced, or destroyed by deleting the announcement.
        </p>
      )}

      {/*
       * ⚠️ Stated only when it matters. An operator editing a record WITH an
       * attachment needs to know the panel cannot take it off again; one
       * composing a fresh announcement does not need that sentence yet (O15).
       */}
      {hasExisting ? (
        <p className="text-caption text-foreground-muted">
          Choosing a new file replaces this one. There is no way to leave the
          announcement with no attachment at all.
        </p>
      ) : null}
    </div>
  )
}
