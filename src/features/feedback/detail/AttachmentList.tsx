import {
  ExternalLink,
  FileAudio,
  FileText,
  FileVideo,
  ImageIcon,
  Paperclip,
  ShieldAlert,
} from 'lucide-react'
import type { ComponentType } from 'react'

import { formatBytes } from '@/lib/format'
import type { FeedbackAttachment } from '@/types/feedback'

import { attachmentKind, safeAttachmentHref, type AttachmentKind } from '../attachments'

/**
 * The files a reporter attached — as **rows, never a gallery**
 * (feedback_management_plan.md §5.7, §3.9).
 *
 * ⚠️ Every string in an attachment is attacker-controlled. The backend
 * validates `fileSize` and nothing else: no URL parse, no scheme check, no host
 * allowlist, no MIME allowlist. `{"fileUrl":"javascript:alert(document.domain)",
 * "fileName":"<img src=x onerror=alert(1)>.png","fileType":"text/html"}` was
 * accepted from an ordinary user account and returned verbatim to this panel,
 * verified live 2026-09-06.
 *
 * Three rules follow, and all three are structural rather than advisory:
 *
 * 1. **Nothing loads.** No `<img>`, no preview, no thumbnail. A row is text.
 *    An admin panel that fetches a stranger's URL on render is a request the
 *    operator never made, to a host nobody vetted.
 * 2. **An anchor exists only when `safeAttachmentHref` returns one.** Not a
 *    disabled anchor, not an anchor with `href="#"` — no `<a>` element at all.
 *    The test asserts this by querying the DOM for `a[href]` and finding none.
 * 3. **The icon is decorative.** It comes from `fileType`, a string a stranger
 *    wrote, so it never carries meaning the row's own text does not repeat —
 *    `receipt.pdf` claiming `application/pdf` while pointing at a `data:` URL
 *    is exactly the seeded case.
 */

const ICONS: Readonly<Record<AttachmentKind, ComponentType<{ className?: string }>>> = {
  image: ImageIcon,
  video: FileVideo,
  audio: FileAudio,
  document: FileText,
  unknown: Paperclip,
}

function AttachmentRow({ attachment }: { attachment: FeedbackAttachment }) {
  const href = safeAttachmentHref(attachment.fileUrl)
  const Icon = href ? ICONS[attachmentKind(attachment.fileType)] : ShieldAlert

  return (
    <li className="flex items-start gap-3 rounded-md border border-border bg-surface-muted p-3">
      <Icon
        className={
          href
            ? 'mt-0.5 size-4 shrink-0 text-foreground-subtle'
            : 'mt-0.5 size-4 shrink-0 text-danger'
        }
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1 space-y-0.5">
        {/*
         * The file name is rendered as text, always. React escapes it, so the
         * seeded `<img src=x onerror=alert(1)>.png` appears as those
         * characters — which is both the correct display and the proof that
         * nothing was injected.
         *
         * `wrap-anywhere`, not `break-words`: a file name has no spaces to
         * break at and would otherwise set a min-content width the card cannot
         * shrink below at 360px.
         */}
        <p className="text-body-strong wrap-anywhere">{attachment.fileName}</p>
        <p className="text-caption text-foreground-muted">
          {/*
           * `fileType` is unvalidated too, so it is shown as the claim it is
           * rather than translated into a friendly label that would lend it
           * authority.
           */}
          {attachment.fileType} · {formatBytes(attachment.fileSize)}
        </p>
        {/*
         * `text-danger-foreground`, not `text-danger`. The latter is `red-500`
         * — a **fill** colour for solid backgrounds — and as prose on
         * `surface-muted` it measures 2.9:1, below the 4.5:1 AA floor. Caught
         * by the F5 contrast pass, the only check in the project that can
         * compute this.
         */}
        {href ? null : (
          <p className="text-caption text-danger-foreground">
            Unsafe link — not opened. This file is hosted at an address the panel will
            not follow, so there is nothing safe to click.
          </p>
        )}
      </div>

      {href ? (
        /*
         * `rel="noopener noreferrer"` and `target="_blank"`: the destination is
         * a URL a stranger supplied, so it never gets a handle on this window
         * and never learns where it was linked from.
         */
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 text-body text-primary hover:underline"
        >
          Open
          <ExternalLink className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{attachment.fileName}, opens in a new tab</span>
        </a>
      ) : null}
    </li>
  )
}

export function AttachmentList({
  attachments,
}: {
  attachments: readonly FeedbackAttachment[]
}) {
  if (attachments.length === 0) {
    return <p className="text-caption text-foreground-subtle">No files attached.</p>
  }

  return (
    <ul className="space-y-2">
      {attachments.map((attachment) => (
        <AttachmentRow key={attachment.id} attachment={attachment} />
      ))}
    </ul>
  )
}
