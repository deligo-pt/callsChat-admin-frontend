import { z } from 'zod'

import { envelopeSchema, idSchema, isoDateTime, paginatedSchema } from './common'

/**
 * Official Announcements — the admin broadcast contract (plan.md §2).
 *
 * ⚠️ **Read the provenance note before tightening anything in this file.**
 * Two parts of this contract have very different standing:
 *
 * - **Measured, on 2026-10-04 against the live service.** Every enum, every
 *   length limit, which fields are URL-validated, the list envelope, the stats
 *   object, the media-upload response, and the query parameters. These came out
 *   of the service's own validation rejections, so they are facts.
 * - **Inferred from `broadcast.md` §3.1.** The *row* itself. The live table
 *   holds zero announcements and creating a disposable draft was refused as a
 *   shared-resource write, so **no created record has ever been observed**, and
 *   §3.1's example is the *client feed* projection rather than the admin list's.
 *
 * So the row below is deliberately permissive: `.nullable().optional()` on
 * everything the doc shows but nobody has seen. The alternative failure is
 * worse than a loose schema — the feedback ticket page was taken out by a key
 * that was `.nullable()` but not `.optional()`, which rejected an entire
 * response over one absent field.
 *
 * `plan.md` O5 closes this: one real `POST /admin/announcements` response
 * tightens the row, and `features/announcements/contract.test.ts` is where the
 * tightening gets pinned.
 */

/* -------------------------------------------------------------------------
 * Vocabularies — all four measured from validation rejections
 * ---------------------------------------------------------------------- */

/**
 * `body/priority Invalid enum value. Expected 'LOW' | 'NORMAL' | 'HIGH' |
 * 'URGENT'`, verbatim.
 *
 * `broadcast.md` §5.2 maps only three of these to a colour (URGENT rose, HIGH
 * amber, NORMAL indigo) and says nothing about `LOW`. The panel labels all
 * four; inventing a fourth colour on mobile is not our call to make.
 */
export const announcementPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
export type AnnouncementPriority = z.infer<typeof announcementPrioritySchema>
export const ANNOUNCEMENT_PRIORITY_VALUES = announcementPrioritySchema.options

/**
 * `body/status Invalid enum value. Expected 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'`.
 *
 * ⚠️ **Three values, and there is no scheduled state.** `publishedAt` is not in
 * the write schema — a garbage value passed without rejection, meaning it is
 * stripped — so an announcement is a draft or it is live *now* (plan.md §3.5).
 * Anything in this panel offering a send time would be offering something the
 * API cannot do.
 *
 * ⚠️ This replaced a seven-value invention — `SCHEDULED｜QUEUED｜
 * SENT_TO_PROVIDER｜DELIVERED｜FAILED｜EXPIRED` — that lived in `types/ops.ts`
 * from before this API existed, along with a whole `delivery{}` counter block.
 * None of it was real (plan.md §3.1).
 */
export const announcementStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>
export const ANNOUNCEMENT_STATUS_VALUES = announcementStatusSchema.options

/**
 * `body/targetAudience Invalid enum value. Expected 'ALL' | 'PERSONAL' |
 * 'BUSINESS'`.
 *
 * Segments by the recipient's **account mode**, which is the only targeting
 * this API has: no explicit id lists, no role filters, no locale. The old
 * `ALL_USERS｜HOSTS_ONLY｜EXPLICIT_IDS｜BY_STATUS` invention promised all four.
 */
export const announcementAudienceSchema = z.enum(['ALL', 'PERSONAL', 'BUSINESS'])
export type AnnouncementAudience = z.infer<typeof announcementAudienceSchema>
export const ANNOUNCEMENT_AUDIENCE_VALUES = announcementAudienceSchema.options

/** `body/mediaType Invalid enum value. Expected 'IMAGE' | 'VIDEO'`. */
export const announcementMediaTypeSchema = z.enum(['IMAGE', 'VIDEO'])
export type AnnouncementMediaType = z.infer<typeof announcementMediaTypeSchema>
export const ANNOUNCEMENT_MEDIA_TYPE_VALUES = announcementMediaTypeSchema.options

/* -------------------------------------------------------------------------
 * Field limits — measured
 * ---------------------------------------------------------------------- */

/** `body/title Title must be at least 3 characters`. */
export const ANNOUNCEMENT_TITLE_MIN_LENGTH = 3
/** `body/title String must contain at most 255 character(s)`. */
export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 255
/** `body/actionText String must contain at most 100 character(s)`. */
export const ANNOUNCEMENT_ACTION_TEXT_MAX_LENGTH = 100

/**
 * ⚠️ **`content` has no server-side maximum.** A 6000-character body was
 * accepted without complaint, and whatever is sent reaches every mobile client
 * (plan.md O6). The panel sets no limit either, because inventing one here
 * would reject copy the service would have published — but the compose form
 * shows a character count so the operator can see what they are sending.
 */
export const ANNOUNCEMENT_CONTENT_MIN_LENGTH = 1

/* -------------------------------------------------------------------------
 * The record
 * ---------------------------------------------------------------------- */

/**
 * The author projection from `broadcast.md` §3.1 — **inferred, not observed.**
 *
 * The name sits two levels down, under `author.profile.displayName`, and every
 * level of that is tolerated as absent. `authorId` is the field that is
 * actually dependable, and `lib/hooks/useActorName` resolves it the same way
 * every other actor id in this panel is resolved.
 */
export const announcementAuthorSchema = z.object({
  id: idSchema.optional(),
  profile: z
    .object({
      displayName: z.string().nullable().optional(),
      avatarUrl: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
})
export type AnnouncementAuthor = z.infer<typeof announcementAuthorSchema>

export const announcementSchema = z.object({
  /*
   * `id`, `title` and `content` are the only three fields this schema insists
   * on, and the insistence is earned: `title` and `content` are the two
   * **required** fields on the write route, so a record cannot exist without
   * them.
   */
  id: idSchema,
  title: z.string(),
  content: z.string(),

  /*
   * ⚠️ `.or(z.string())` on all three, for the reason `errorCodeSchema` and
   * `verificationRejectionCodeSchema` have it: a value the backend adds must
   * degrade to a humanised label, not blank the queue an operator is working.
   * The panel only ever *sends* a value from the enum itself — see
   * {@link AnnouncementWritePayload}, where these are strict and required.
   *
   * ⚠️ `.nullable()` as well as `.optional()`, and the distinction is one a
   * test caught rather than a judgement call: these columns have never been
   * observed, so "absent" and "explicitly null" are both guesses, and a schema
   * that tolerated only the first would blank the queue over the second. That
   * is precisely the shape of the bug that took out the feedback ticket page.
   */
  status: announcementStatusSchema.or(z.string()).nullable().optional(),
  priority: announcementPrioritySchema.or(z.string()).nullable().optional(),
  targetAudience: announcementAudienceSchema.or(z.string()).nullable().optional(),

  isPinned: z.boolean().nullable().optional(),
  pinnedAt: isoDateTime.nullable().optional(),

  /*
   * ⚠️ `mediaUrl` is the only URL-validated field on the write route, but it is
   * **not** validated here. A row is read, not sent: refusing to parse a record
   * because the backend stored something malformed would hide the record that
   * needs fixing.
   */
  mediaUrl: z.string().nullable().optional(),
  mediaKey: z.string().nullable().optional(),
  mediaType: announcementMediaTypeSchema.or(z.string()).nullable().optional(),
  mediaThumbnailUrl: z.string().nullable().optional(),
  mediaDuration: z.number().nullable().optional(),
  mediaSize: z.number().nullable().optional(),

  /**
   * ⚠️ `actionUrl` is free text. The service does **not** URL-validate it —
   * `"not a url"` was accepted where the same value on `mediaUrl` was refused.
   * Whatever is stored here is handed to a mobile client as a CTA target, so
   * the compose form is the only thing standing between an operator's typo and
   * a dead button on every phone.
   */
  actionText: z.string().nullable().optional(),
  actionUrl: z.string().nullable().optional(),

  /**
   * ⚠️ In the write schema, undocumented in `broadcast.md`, and never set by
   * this panel (plan.md O8). An *official broadcast* is public by definition, so
   * what encryption would mean here is an open question — until it is answered,
   * the field is read and displayed, never written.
   */
  isEncrypted: z.boolean().nullable().optional(),
  encryptedPayload: z.unknown().optional(),

  authorId: idSchema.nullable().optional(),
  author: announcementAuthorSchema.nullable().optional(),

  /**
   * Impressions on this one row.
   *
   * ⚠️ `broadcast.md` §3.4 says reading an announcement through the *client*
   * route increments this. That is exactly why the panel never calls that route
   * (plan.md §3.2): an admin opening a draft to edit it would inflate the one
   * number this module reports.
   */
  viewsCount: z.number().nullable().optional(),
  /** Per-caller, and meaningless on an admin row. Parsed so it cannot surprise. */
  isRead: z.boolean().nullable().optional(),

  publishedAt: isoDateTime.nullable().optional(),
  createdAt: isoDateTime.nullable().optional(),
  updatedAt: isoDateTime.nullable().optional(),
})
export type Announcement = z.infer<typeof announcementSchema>

/* -------------------------------------------------------------------------
 * Envelopes
 * ---------------------------------------------------------------------- */

/**
 * `GET /admin/announcements` → `{ success, data: [], pagination }` — the
 * **first** of this backend's three list envelopes, measured 2026-10-04.
 *
 * Worth stating plainly because it is not derivable: `GET /admin/feedbacks`
 * uses `{ data: { items, meta } }` and `GET /admin/verifications` uses
 * `{ data: { …counters, requests } }`. Three routes, three shapes, no rule.
 */
export const announcementListResponseSchema = paginatedSchema(announcementSchema)

/**
 * The write routes' response.
 *
 * ⚠️ **Unobserved.** `envelopeSchema` is the assumption that `POST`, `PATCH`
 * and `POST /:id/pin` answer with `{ success, data: <row> }`. Nothing is ever
 * painted from it — {@link announcementListResponseSchema} is the only thing
 * that draws a screen — so if the real shape differs, a refetch still shows the
 * truth (plan.md O5).
 */
export const announcementResponseSchema = envelopeSchema(announcementSchema)

/**
 * `GET /admin/announcements/stats` — **measured verbatim**, so this one is
 * strict. Any key moving or disappearing should be loud.
 *
 * ⚠️ These five numbers are platform-wide and are the **only** reach reporting
 * that exists. There is no per-announcement read-receipt or recipient endpoint,
 * so "who read this one" cannot be answered (plan.md O10).
 */
export const announcementStatsSchema = z.object({
  totalPublished: z.int().nonnegative(),
  totalDrafts: z.int().nonnegative(),
  totalImpressions: z.int().nonnegative(),
  totalPinned: z.int().nonnegative(),
  totalReadReceipts: z.int().nonnegative(),
})
export type AnnouncementStats = z.infer<typeof announcementStatsSchema>

export const announcementStatsResponseSchema = envelopeSchema(announcementStatsSchema)

/* -------------------------------------------------------------------------
 * Media
 * ---------------------------------------------------------------------- */

/**
 * `POST /api/v1/media/upload` — **measured verbatim**, so strict.
 *
 * ⚠️ **This route is a one-way door and it validates nothing.** A
 * `text/plain` file was accepted, stored, and served back publicly from
 * `https://media.callschat.com/...` with no authentication; there is no delete
 * route, so an upload can only ever be orphaned (plan.md §3.4, O1).
 *
 * Two rules follow for every caller:
 *
 * 1. **Validate before sending** — {@link isAllowedAnnouncementMedia}. The
 *    server will not, and the object becomes permanent the instant it accepts.
 * 2. **Upload last.** Never on file selection; only when the operator commits,
 *    so an abandoned draft leaves nothing behind.
 */
export const mediaUploadResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    url: z.url(),
    key: z.string(),
    filename: z.string(),
    mimetype: z.string(),
  }),
})
export type MediaUpload = z.infer<typeof mediaUploadResponseSchema>['data']

/**
 * What the panel is willing to upload.
 *
 * ⚠️ **This list is ours, not the server's.** The server has no allow-list at
 * all, so this is a product decision about what an announcement may contain,
 * and it is a UX guard rather than a security boundary — anyone with an admin
 * token can bypass it with curl. `broadcast.md` §1 asks for "images and short
 * videos (MP4, WebM)", and §5.2 renders them with an image lightbox or a video
 * player, so anything outside these would reach a client that cannot show it.
 */
export const ANNOUNCEMENT_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export const ANNOUNCEMENT_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const

/**
 * Size ceilings, also ours.
 *
 * The video limit is deliberately modest: `broadcast.md` §1 says *short*
 * videos, the example in §2.1 is 45 seconds, and every byte is streamed to
 * every user on the platform over mobile data.
 */
export const ANNOUNCEMENT_MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ANNOUNCEMENT_MAX_VIDEO_BYTES = 50 * 1024 * 1024

/** Which `mediaType` a file maps to, or `null` if the panel will not send it. */
export function announcementMediaTypeFor(
  mimeType: string,
): AnnouncementMediaType | null {
  if ((ANNOUNCEMENT_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return 'IMAGE'
  }
  if ((ANNOUNCEMENT_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return 'VIDEO'
  }
  return null
}

/** The size ceiling for a file of this kind. */
export function announcementMediaLimitFor(mediaType: AnnouncementMediaType): number {
  return mediaType === 'VIDEO'
    ? ANNOUNCEMENT_MAX_VIDEO_BYTES
    : ANNOUNCEMENT_MAX_IMAGE_BYTES
}

/** Why a file was refused, or `null` when it is acceptable. */
export type AnnouncementMediaRejection = 'UNSUPPORTED_TYPE' | 'TOO_LARGE'

/**
 * The pre-upload check (plan.md §3.4 rule 1).
 *
 * Returns the resolved `mediaType` on success so a caller cannot forget to
 * send it — the server accepts media with no `mediaType` and the mobile client
 * then has no idea whether to open a lightbox or a video player.
 */
export function isAllowedAnnouncementMedia(file: {
  readonly type: string
  readonly size: number
}):
  | { ok: true; mediaType: AnnouncementMediaType }
  | { ok: false; reason: AnnouncementMediaRejection } {
  const mediaType = announcementMediaTypeFor(file.type)
  if (!mediaType) return { ok: false, reason: 'UNSUPPORTED_TYPE' }
  if (file.size > announcementMediaLimitFor(mediaType)) {
    return { ok: false, reason: 'TOO_LARGE' }
  }
  return { ok: true, mediaType }
}

/* -------------------------------------------------------------------------
 * Writes
 * ---------------------------------------------------------------------- */

/**
 * The create body.
 *
 * ⚠️ **The four enum/boolean fields are required here even though the server
 * treats them as optional, and that is deliberate** (plan.md §3.7). Only
 * `title` and `content` are mandatory on the wire; what the service does with
 * an omitted `status` or `targetAudience` has **never been observed**, because
 * the table is empty and no record has been created.
 *
 * Guessing wrong in either direction is bad in a way nothing else here is: a
 * draft that silently publishes reaches every user on the platform, and an
 * audience that silently widens does the same. So the type makes all four
 * explicit, the form has no "leave unset" state for them, and the request is
 * self-documenting in a network log.
 */
export interface AnnouncementWritePayload {
  readonly title: string
  readonly content: string
  readonly priority: AnnouncementPriority
  readonly status: AnnouncementStatus
  readonly targetAudience: AnnouncementAudience
  readonly isPinned: boolean

  readonly actionText?: string | undefined
  readonly actionUrl?: string | undefined

  readonly mediaUrl?: string | undefined
  readonly mediaKey?: string | undefined
  readonly mediaType?: AnnouncementMediaType | undefined
  readonly mediaThumbnailUrl?: string | undefined
  readonly mediaDuration?: number | undefined
  readonly mediaSize?: number | undefined
}

/**
 * The `PATCH` body.
 *
 * Every field is optional server-side — an empty `{}` passes validation and
 * reaches the record lookup, verified. The panel still sends all four enum
 * fields on an edit, for the reason above.
 */
export type AnnouncementUpdatePayload = Partial<AnnouncementWritePayload>

/**
 * `GET /admin/announcements` query parameters, measured.
 *
 * ⚠️ There is **no `sortBy`**. It is not in the query schema, so passing one is
 * silently ignored — this API ignores unknown query parameters rather than
 * rejecting them, so a 200 is never proof a filter was applied. The queue
 * therefore ships no sort control (plan.md O4).
 *
 * ⚠️ `isPinned` is a **boolean here and a string on the wire**: the service
 * wants `'true'` or `'false'` and rejects anything else with
 * `Invalid enum value. Expected 'true' | 'false'`. `api/announcements.ts`
 * does that conversion in one place.
 */
export interface AnnouncementListQuery {
  readonly page?: number | undefined
  readonly limit?: number | undefined
  readonly status?: AnnouncementStatus | undefined
  readonly priority?: AnnouncementPriority | undefined
  readonly targetAudience?: AnnouncementAudience | undefined
  readonly isPinned?: boolean | undefined
  readonly search?: string | undefined
  /*
   * Mirrors `ListParams` so this can be handed to `queryKeys.*.list()` without
   * a cast. The named keys above are what the endpoint actually accepts; this
   * signature exists for structural compatibility, not to invite extra
   * parameters — and this API silently ignores unknown ones, so a stray key
   * would be a filter that never applied rather than an error.
   */
  readonly [key: string]: string | number | boolean | undefined
}
