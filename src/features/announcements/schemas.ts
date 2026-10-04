import { z } from 'zod'

import {
  announcementAudienceSchema,
  announcementMediaTypeSchema,
  announcementPrioritySchema,
  ANNOUNCEMENT_ACTION_TEXT_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MIN_LENGTH,
  type Announcement,
  type AnnouncementStatus,
  type AnnouncementWritePayload,
} from '@/types/announcement'

/**
 * The compose form (plan.md §2.2, phase B3).
 *
 * Mirrors the server's rules exactly where it has them, and **declines to
 * invent the ones it is missing** — with one exception, stated below. Every
 * bound here was read out of a live validation rejection on 2026-10-04, not
 * guessed:
 *
 *   `body/title Title must be at least 3 characters`
 *   `body/title String must contain at most 255 character(s)`
 *   `body/content Announcement content is required`
 *   `body/actionText String must contain at most 100 character(s)`
 *
 * ⚠️ **`content` has no maximum, and this schema does not add one.** The
 * service accepted 6000 characters without complaint, and inventing a ceiling
 * here would reject copy the API would have published. The editor shows a
 * character count instead, so the operator can see the size of what they are
 * sending to every phone on the platform (O6).
 *
 * ⚠️ **`actionUrl` is deliberately NOT format-validated, and that is the
 * exception worth arguing about.** The service does not validate it — `"not a
 * url"` was accepted where the same string on `mediaUrl` was refused — so a
 * strict rule here would reject targets the backend stores happily, including
 * the app-relative paths `broadcast.md` §3.1 itself uses (`/settings/sessions`,
 * `/channels`). A format rule would therefore break the documented use case.
 * The field is bounded in length and otherwise trusted, and the hint tells the
 * operator that nothing will check it — because the cost of a typo is a dead
 * button on every phone, and nothing downstream will catch it.
 */

export const announcementFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(
        ANNOUNCEMENT_TITLE_MIN_LENGTH,
        `Use at least ${String(ANNOUNCEMENT_TITLE_MIN_LENGTH)} characters.`,
      )
      .max(
        ANNOUNCEMENT_TITLE_MAX_LENGTH,
        `Use ${String(ANNOUNCEMENT_TITLE_MAX_LENGTH)} characters or fewer.`,
      ),
    content: z.string().trim().min(1, 'Write the announcement body.'),

    priority: announcementPrioritySchema,
    targetAudience: announcementAudienceSchema,
    isPinned: z.boolean(),

    actionText: z
      .string()
      .trim()
      .max(
        ANNOUNCEMENT_ACTION_TEXT_MAX_LENGTH,
        `Use ${String(ANNOUNCEMENT_ACTION_TEXT_MAX_LENGTH)} characters or fewer.`,
      ),
    actionUrl: z.string().trim(),

    /*
     * Media already stored. Set when editing a record that has an attachment,
     * or after this dialog's own upload succeeds. A file chosen but not yet
     * uploaded is component state, never form state — see `MediaField`.
     */
    mediaUrl: z.string().trim(),
    mediaKey: z.string().trim(),
    mediaType: announcementMediaTypeSchema.or(z.literal('')),
    mediaDuration: z.number().nullable(),
    mediaSize: z.number().nullable(),
  })
  /**
   * ⚠️ **A call-to-action needs both halves or neither.**
   *
   * The server enforces nothing here: it will happily store an `actionText`
   * with no `actionUrl`, which renders a prominent button on every user's phone
   * that goes nowhere (`broadcast.md` §5.2 renders the CTA whenever
   * `actionText` is present). And an `actionUrl` with no `actionText` is a
   * target no client will ever render, which is merely useless.
   *
   * This is the one rule in this file with no server counterpart, and it earns
   * its place because the failure is invisible from the panel and visible to
   * every user.
   */
  .refine((values) => Boolean(values.actionText) === Boolean(values.actionUrl), {
    message: 'A call to action needs both a label and a link, or neither.',
    path: ['actionText'],
  })

export type AnnouncementFormValues = z.infer<typeof announcementFormSchema>

/**
 * Every field name the server can name in a validation message.
 *
 * Passed to `applyServerFieldErrors`, which only sets errors on fields the
 * caller declares — so a message naming something this form does not render
 * cannot produce an error nobody can see or clear.
 */
export const ANNOUNCEMENT_FORM_FIELDS = [
  'title',
  'content',
  'priority',
  'status',
  'targetAudience',
  'isPinned',
  'actionText',
  'actionUrl',
  'mediaUrl',
  'mediaKey',
  'mediaType',
  'mediaDuration',
  'mediaSize',
] as const

export const ANNOUNCEMENT_FORM_DEFAULTS: AnnouncementFormValues = {
  title: '',
  content: '',
  /*
   * `NORMAL`, not `HIGH`. Priority decides how loudly the message lands on a
   * stranger's phone, so the quiet-but-real default is the right one — an
   * operator must choose to raise their voice, never forget to lower it.
   */
  priority: 'NORMAL',
  /*
   * `ALL`. The audience selector is the one field where every option is a
   * deliberate choice, and `ALL` is what an "official announcement" means by
   * default. Narrowing is the exception and is visible in the control.
   */
  targetAudience: 'ALL',
  /*
   * `false`. Pinning puts an item at the top of every user's chat list
   * indefinitely; it is an escalation, not a default.
   */
  isPinned: false,
  actionText: '',
  actionUrl: '',
  mediaUrl: '',
  mediaKey: '',
  mediaType: '',
  mediaDuration: null,
  mediaSize: null,
}

/**
 * Seed the form from an existing record.
 *
 * ⚠️ Every field on a row is optional and nullable, because no announcement row
 * has ever been observed (O5). `??` on each one is not defensive style — a
 * missing `priority` would otherwise put `undefined` into a `Select` and make
 * it an uncontrolled component mid-edit.
 */
export function toFormValues(record: Announcement): AnnouncementFormValues {
  return {
    title: record.title,
    content: record.content,
    priority:
      (record.priority as AnnouncementFormValues['priority'] | undefined) ??
      ANNOUNCEMENT_FORM_DEFAULTS.priority,
    targetAudience:
      (record.targetAudience as AnnouncementFormValues['targetAudience'] | undefined) ??
      ANNOUNCEMENT_FORM_DEFAULTS.targetAudience,
    isPinned: record.isPinned ?? false,
    actionText: record.actionText ?? '',
    actionUrl: record.actionUrl ?? '',
    mediaUrl: record.mediaUrl ?? '',
    mediaKey: record.mediaKey ?? '',
    mediaType: (record.mediaType as AnnouncementFormValues['mediaType']) || '',
    mediaDuration: record.mediaDuration ?? null,
    mediaSize: record.mediaSize ?? null,
  }
}

/**
 * Build the request body.
 *
 * ⚠️ **`status` is a parameter, not a form field**, and that is the whole shape
 * of this module's safety model. There is no status dropdown: the operator
 * presses *Save as draft* or *Publish now*, and the button they pressed is what
 * decides. A select would let "published" be the value sitting in a control
 * nobody looked at (plan.md §3.5 — there are only two outcomes, so a dropdown
 * would imply a third).
 *
 * ⚠️ **All four enum/boolean fields are always sent**, even when unchanged.
 * Only `title` and `content` are mandatory on the wire, and what the service
 * does with an omitted `status` or `targetAudience` has never been observed
 * (§3.7). A draft that silently publishes reaches every user on the platform.
 *
 * ⚠️ **Empty optional strings are omitted, never sent as `""`.** `PATCH`
 * merges, so sending `actionText: ""` on a record that has one would blank it —
 * and the panel has no way to tell "the operator cleared this" from "the
 * operator never touched it" if both arrive as an empty string. Clearing is
 * therefore expressed by omission, which means **this form cannot remove an
 * existing CTA or attachment** — see `AnnouncementEditorDialog` for how that is
 * surfaced rather than hidden (O15).
 */
export function buildWritePayload(
  values: AnnouncementFormValues,
  status: AnnouncementStatus,
): AnnouncementWritePayload {
  return {
    title: values.title,
    content: values.content,
    status,
    priority: values.priority,
    targetAudience: values.targetAudience,
    isPinned: values.isPinned,
    ...(values.actionText ? { actionText: values.actionText } : {}),
    ...(values.actionUrl ? { actionUrl: values.actionUrl } : {}),
    ...(values.mediaUrl ? { mediaUrl: values.mediaUrl } : {}),
    ...(values.mediaKey ? { mediaKey: values.mediaKey } : {}),
    ...(values.mediaType ? { mediaType: values.mediaType } : {}),
    ...(values.mediaDuration !== null ? { mediaDuration: values.mediaDuration } : {}),
    ...(values.mediaSize !== null ? { mediaSize: values.mediaSize } : {}),
  }
}
