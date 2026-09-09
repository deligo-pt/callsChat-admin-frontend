import type { FeedbackAttachment } from '@/types/feedback'

/**
 * Defusing attacker-controlled attachment metadata
 * (feedback_management_plan.md §3.9).
 *
 * Every string on a `feedback_attachments` row is written by an ordinary app
 * user and stored verbatim. The backend validates `fileSize` (must be
 * positive) and **nothing else** — no URL parse, no scheme check, no host
 * allowlist, no MIME allowlist. This was confirmed by submitting, from a
 * normal authenticated account on 2026-09-06:
 *
 *   { "fileUrl":  "javascript:alert(document.domain)",
 *     "fileName": "<img src=x onerror=alert(1)>.png",
 *     "fileType": "text/html",
 *     "fileSize": 1 }
 *
 * → `201 Created`, returned unchanged to `GET /admin/feedbacks/:id`.
 *
 * A naive `<a href={fileUrl}>` in an admin panel therefore executes an
 * attacker's script in a Super Admin's session, on a page that also holds a
 * session token. This module is the only place permitted to turn one of those
 * strings into an `href`, and it is the reason `AttachmentList` renders a file
 * table rather than a gallery.
 *
 * JSX escapes `fileName` and `fileType` for us, so those need no helper — they
 * need a rule, and the rule is: never `dangerouslySetInnerHTML`, never a
 * `download` attribute (the browser would take the name as a path), never a
 * template that puts either into a URL.
 */

/**
 * Schemes the panel will link to.
 *
 * `https:` only, and the exclusions are each deliberate:
 *
 * - `javascript:` — the live payload above. Executes on click.
 * - `data:` — `data:text/html,…` is same-origin-ish in enough browsers to be
 *   worth refusing outright, and no legitimate attachment is inlined.
 * - `blob:` — can only refer to something this document created, so on a
 *   ticket it means the mobile client leaked a local handle.
 * - `http:` — an admin session on an https page fetching a plaintext URL is a
 *   downgrade, and the real media host (`media.callschat.com`, per
 *   `types/settings.ts`) serves https.
 * - `file:`, `ftp:`, custom app schemes — nothing serves an attachment.
 */
const ALLOWED_PROTOCOL = 'https:'

/**
 * The href to use for an attachment, or `null` when it must not be linked.
 *
 * `null` is not an error state to swallow — `AttachmentList` renders that row
 * as inert text with a visible warning and shows the raw value, so an operator
 * can still report what was filed. Dropping the row instead would hide an
 * attack from the only people able to act on it.
 *
 * Parsing with `new URL()` rather than a regex is deliberate: the URL parser is
 * the same one the browser will use for the `href`, so there is no gap between
 * what this function judges and what the browser would do. A regex would have
 * to anticipate `java\nscript:`, `JavaScript:`, leading control characters and
 * every other normalisation the parser already handles.
 */
export function safeAttachmentHref(fileUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(fileUrl)
  } catch {
    /*
     * Relative URLs land here too, and they are refused on purpose: resolving
     * one against the panel's own origin would point an operator at this app
     * rather than at the file, and nothing legitimate arrives relative.
     */
    return null
  }

  if (parsed.protocol !== ALLOWED_PROTOCOL) return null

  /*
   * `parsed.href`, not the raw input: the parser has normalised escapes and
   * whitespace, so what is returned is exactly what the browser would navigate
   * to. Returning the original would let the two disagree.
   */
  return parsed.href
}

/** Whether this attachment can be opened at all. */
export function isSafeAttachment(attachment: FeedbackAttachment): boolean {
  return safeAttachmentHref(attachment.fileUrl) !== null
}

/**
 * The broad media class of an attachment, from its (unvalidated) `fileType`.
 *
 * Used only to pick a decorative icon. It is a hint derived from a string a
 * stranger wrote, so it never carries meaning the row's own text does not also
 * state — an `image` here does not mean the panel will render an image, and
 * nothing branches on it beyond the glyph.
 */
export type AttachmentKind = 'image' | 'video' | 'audio' | 'document' | 'unknown'

export function attachmentKind(fileType: string): AttachmentKind {
  const type = fileType.trim().toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('application/') || type.startsWith('text/')) return 'document'
  return 'unknown'
}
