import { z } from 'zod'

import { idSchema, isoDateTime, itemsEnvelopeSchema } from './common'

/**
 * Feedback & Support contract (feedback_management_plan.md §2).
 *
 * VERIFIED against `https://api.callschat.com/api/v1` on 2026-09-06 with a
 * `SUPER_ADMIN` token: all seven admin routes and all four user routes, a full
 * submit → triage → assign → reply → resolve → close → reopen lifecycle, and
 * every rejection below reproduced from the API's own message. Where the
 * written doc and the live service disagreed, the live service won
 * (feedback_management_plan.md §2.7).
 */

/* -------------------------------------------------------------------------
 * Enums
 * ---------------------------------------------------------------------- */

/**
 * What kind of thing the user filed.
 *
 * Set once, by the user, at submission. **No admin route accepts it** —
 * `PATCH /admin/feedbacks/:id` silently drops a `type` key, verified. It is a
 * read-only fact about the ticket for the whole of this panel.
 */
export const feedbackTypeSchema = z.enum(['BUG', 'IMPROVEMENT', 'REPORT', 'OTHER'])
export type FeedbackType = z.infer<typeof feedbackTypeSchema>

export const FEEDBACK_TYPE_VALUES = feedbackTypeSchema.options

/**
 * The six lifecycle states.
 *
 * Declaration order is the **server's enum order**, and that is load-bearing:
 * `sortBy=status` orders by ordinal, not alphabetically, so this array is also
 * the sort order an operator sees. The same holds for
 * {@link feedbackPrioritySchema}.
 */
export const feedbackStatusSchema = z.enum([
  'PENDING',
  'REVIEWING',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
])
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>

export const FEEDBACK_STATUS_VALUES = feedbackStatusSchema.options

/**
 * Urgency, set by the user and editable by staff.
 *
 * ⚠️ Declaration order is the server's enum order — `sortBy=priority` follows
 * it, so `sortOrder=asc` means `LOW → CRITICAL` (least urgent first) rather
 * than the alphabetical `CRITICAL → MEDIUM` a string sort would give. Verified
 * live 2026-09-06.
 */
export const feedbackPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
export type FeedbackPriority = z.infer<typeof feedbackPrioritySchema>

export const FEEDBACK_PRIORITY_VALUES = feedbackPrioritySchema.options

/* -------------------------------------------------------------------------
 * Nested actors
 * ---------------------------------------------------------------------- */

/**
 * The reporter, the assigned staff member and a reply's sender all arrive in
 * this one shape.
 *
 * ⚠️ `profile` is **nullable**, and every renderer must handle it. A user who
 * never finished profile setup has none, and `email` is then the only display
 * name available.
 *
 * ⚠️ **Every key inside `profile` except `displayName` is optional**, because
 * the backend selects a different, narrower projection at each of the three
 * places an actor appears. Verified live 2026-09-07 on a real ticket:
 *
 * | Where | `profile` contains |
 * |---|---|
 * | `user` | `displayName`, `avatarUrl`, `username` |
 * | `replies[].sender` | `displayName`, `avatarUrl` |
 * | `statusHistory[].changedBy` | **`displayName` only** |
 *
 * `avatarUrl` was `.nullable()` and not `.optional()`, which meant a `null`
 * parsed and an *absent* key did not — so every one of a ticket's history rows
 * failed validation and the whole detail response was rejected, leaving the
 * page showing a contract error instead of the ticket. `displayName` stays
 * required: it is the one key present in all three projections, and it is the
 * only thing any renderer here actually needs.
 *
 * The alternative — three schemas for three projections — would have to be
 * kept in sync by hand against a backend that has already shown it will change
 * the shape per call site (§3.2).
 */
export const feedbackActorSchema = z.object({
  id: idSchema,
  email: z.string(),
  phone: z.string().nullable().optional(),
  /** Not narrowed to an enum: an actor's role is display-only here. */
  role: z.string(),
  profile: z
    .object({
      displayName: z.string(),
      username: z.string().optional(),
      avatarUrl: z.string().nullable().optional(),
    })
    .nullable(),
})
export type FeedbackActor = z.infer<typeof feedbackActorSchema>

/* -------------------------------------------------------------------------
 * Relations
 * ---------------------------------------------------------------------- */

/**
 * One attached file.
 *
 * ⚠️ **Every string here is attacker-controlled**
 * (feedback_management_plan.md §3.9). The backend validates `fileSize` (must
 * be positive) and nothing else: no URL parse, no scheme check, no host
 * allowlist, no MIME allowlist. `{"fileUrl":"javascript:alert(document.domain)",
 * "fileName":"<img src=x onerror=alert(1)>.png","fileType":"text/html"}` was
 * accepted from an ordinary user account and returned verbatim to the admin
 * panel, verified 2026-09-06.
 *
 * `fileUrl` is therefore typed as a plain string, **not** `z.url()`. Rejecting
 * it at the contract boundary would blank the whole ticket — including the
 * report a moderator needs to read — over one hostile attachment. It is
 * accepted, carried, and defused at render time by `safeAttachmentHref` in
 * `features/feedback/attachments.ts`, which is the only thing permitted to
 * turn one of these into an `href`.
 */
export const feedbackAttachmentSchema = z.object({
  id: idSchema,
  feedbackId: idSchema,
  fileUrl: z.string(),
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
  createdAt: isoDateTime,
})
export type FeedbackAttachment = z.infer<typeof feedbackAttachmentSchema>

/**
 * One message in the reply stream.
 *
 * Append-only: there is no edit route and no delete route. A sent reply is
 * final, which is why the composer says so (feedback_management_plan.md §5.5).
 */
export const feedbackReplySchema = z.object({
  id: idSchema,
  feedbackId: idSchema,
  senderId: idSchema,
  message: z.string(),
  createdAt: isoDateTime,
  sender: feedbackActorSchema,
})
export type FeedbackReply = z.infer<typeof feedbackReplySchema>

/**
 * One row of the status audit trail.
 *
 * Returned **newest first** — the opposite of the reply stream, which reads
 * downward. Unbounded and unpaginated: a ticket churned through fifteen
 * transitions returns all fifteen inline.
 *
 * `changedBy` is expanded on the detail route and **absent** from the partial
 * transition response (§3.2), hence optional. `note` is genuinely optional on
 * the wire — `PATCH /:id/status` with no `note` stores `null`.
 */
export const feedbackStatusHistorySchema = z.object({
  id: idSchema,
  feedbackId: idSchema,
  fromStatus: feedbackStatusSchema,
  toStatus: feedbackStatusSchema,
  note: z.string().nullable(),
  changedById: idSchema,
  createdAt: isoDateTime,
  changedBy: feedbackActorSchema.partial({ email: true }).optional(),
})
export type FeedbackStatusHistory = z.infer<typeof feedbackStatusHistorySchema>

/* -------------------------------------------------------------------------
 * The record
 * ---------------------------------------------------------------------- */

/**
 * The columns present in **every** shape the API returns.
 *
 * There is no single feedback shape — four routes return four different
 * subsets, and one of them is not deterministic (§2.2). This is the common
 * floor; the relations are layered on top as optional.
 */
const feedbackBaseShape = {
  id: idSchema,
  userId: idSchema,
  type: feedbackTypeSchema,
  subject: z.string(),
  description: z.string(),
  status: feedbackStatusSchema,
  priority: feedbackPrioritySchema,
  userDeviceInfo: z.string().nullable(),
  /**
   * ⚠️ **Overwritten by the next reply** (feedback_management_plan.md §3.3).
   * `POST /:id/reply` copies the reply's `message` into this field without
   * saying so. The panel therefore never writes it — the reply composer is the
   * single writer — and re-reads it after every reply.
   */
  adminResponse: z.string().nullable(),
  assignedAdminId: idSchema.nullable(),
  resolvedAt: isoDateTime.nullable(),
  closedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}

/**
 * One ticket, in whatever completeness the answering route chose.
 *
 * **Every relation is optional, and that is the whole point.**
 * `PATCH /:id/status` returned the full record with `user`, `assignedAdmin`,
 * `attachments`, `replies` and a complete `statusHistory` on 2 of 12 identical
 * consecutive requests, and a 15-key record with only the newest history row
 * on the other 10 — same body, same ticket, seconds apart
 * (feedback_management_plan.md §3.2). Modelling the relations as required
 * would make the panel throw at random on a successful write.
 *
 * The rule that falls out of it is absolute and is enforced in `useFeedback`:
 * **no mutation response is ever rendered or seeded into the cache.** This
 * schema exists to confirm a write succeeded and to read back `id`, not to
 * paint a screen. `GET /admin/feedbacks/:id` was stable across 10 of 10 calls
 * and is the only shape a screen is drawn from.
 */
export const feedbackSchema = z.object({
  ...feedbackBaseShape,
  user: feedbackActorSchema.optional(),
  assignedAdmin: feedbackActorSchema.optional().nullable(),
  attachments: z.array(feedbackAttachmentSchema).optional(),
  replies: z.array(feedbackReplySchema).optional(),
  statusHistory: z.array(feedbackStatusHistorySchema).optional(),
  /** List rows only. The detail route omits it — count the arrays instead. */
  _count: z
    .object({
      attachments: z.number().int().nonnegative(),
      replies: z.number().int().nonnegative(),
    })
    .optional(),
})
export type Feedback = z.infer<typeof feedbackSchema>

/**
 * A ticket as the detail route returns it — the same schema, narrowed by use.
 *
 * Kept as an alias rather than a second schema with required relations: the
 * live service is the authority on which keys arrive, and a stricter parse
 * would fail the page rather than degrade it if a relation were ever dropped.
 * Screens branch on presence, which they must do anyway for `profile: null`.
 */
export type FeedbackDetail = Feedback

/* -------------------------------------------------------------------------
 * Dashboard statistics
 * ---------------------------------------------------------------------- */

/**
 * `GET /admin/feedbacks/stats` — flat counters, not a filtered aggregate.
 *
 * ⚠️ These are **global**. The route takes no query parameters, so the numbers
 * describe every ticket in the system regardless of what the queue is
 * filtered to. `StatsStrip` labels them "All tickets" for that reason
 * (feedback_management_plan.md §5.1).
 */
export const feedbackStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  reviewing: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  resolved: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
  reopened: z.number().int().nonnegative(),
  byType: z.object({
    bug: z.number().int().nonnegative(),
    improvement: z.number().int().nonnegative(),
    report: z.number().int().nonnegative(),
    other: z.number().int().nonnegative(),
  }),
  byPriority: z.object({
    low: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
  }),
})
export type FeedbackStats = z.infer<typeof feedbackStatsSchema>

/* -------------------------------------------------------------------------
 * Response envelopes
 * ---------------------------------------------------------------------- */

/**
 * `GET /admin/feedbacks` — the `{ success, data: { items, meta } }` envelope,
 * **not** the project-standard `{ success, data[], pagination }`.
 *
 * Second route on this backend to use it, after the database backups list.
 */
export const feedbackListResponseSchema = itemsEnvelopeSchema(feedbackSchema)

export const feedbackStatsResponseSchema = z.object({
  success: z.literal(true),
  data: feedbackStatsSchema,
})

/**
 * The five routes that answer with a ticket.
 *
 * `message` is present on the four mutations and absent on `GET /:id`, so it
 * is optional here rather than modelled twice — the same arrangement
 * `staffMemberResponseSchema` uses.
 */
export const feedbackResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: feedbackSchema,
})

/**
 * `POST /admin/feedbacks/:id/reply` — the one route with a compound `data`.
 *
 * `feedback` here is the base columns only, with no relations at all, which is
 * why it is not a substitute for a refetch.
 */
export const feedbackReplyResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.object({
    reply: feedbackReplySchema,
    feedback: feedbackSchema,
  }),
})

/* -------------------------------------------------------------------------
 * Request shapes
 * ---------------------------------------------------------------------- */

/**
 * Filter values for `GET /admin/feedbacks`.
 *
 * `ALL` is a filter value, not a state a ticket can be in, so it lives here
 * rather than widening the enums above — the same split `types/staff.ts` and
 * `types/identity.ts` make.
 */
export const feedbackStatusFilterSchema = z.enum([...FEEDBACK_STATUS_VALUES, 'ALL'])
export type FeedbackStatusFilter = z.infer<typeof feedbackStatusFilterSchema>

export const feedbackTypeFilterSchema = z.enum([...FEEDBACK_TYPE_VALUES, 'ALL'])
export type FeedbackTypeFilter = z.infer<typeof feedbackTypeFilterSchema>

export const feedbackPriorityFilterSchema = z.enum([...FEEDBACK_PRIORITY_VALUES, 'ALL'])
export type FeedbackPriorityFilter = z.infer<typeof feedbackPriorityFilterSchema>

/**
 * The four fields `sortBy` accepts — and unlike the staff directory's, they
 * are honoured. Verified live: `priority` and `createdAt` both reordered a
 * two-row result in both directions.
 */
export const feedbackSortFieldSchema = z.enum([
  'createdAt',
  'updatedAt',
  'priority',
  'status',
])
export type FeedbackSortField = z.infer<typeof feedbackSortFieldSchema>

export const FEEDBACK_SORT_FIELDS = feedbackSortFieldSchema.options

/** `PATCH /admin/feedbacks/:id` — the panel sends `priority` and nothing else. */
export interface UpdateFeedbackPayload {
  readonly priority: FeedbackPriority
}

/** `PATCH /admin/feedbacks/:id/status`. */
export interface TransitionFeedbackPayload {
  readonly status: FeedbackStatus
  /**
   * Optional server-side; the panel requires it.
   *
   * Unlike the staff module's write-only `reason`, this one **is readable
   * afterwards** — it lands in `statusHistory[].note` alongside `changedBy`.
   * The dialog copy is allowed to promise a record because there is one
   * (feedback_management_plan.md §5.6).
   */
  readonly note?: string
}

/**
 * `PATCH /admin/feedbacks/:id/assign`.
 *
 * ⚠️ `adminId` is **required even when unassigning** — omitting the key
 * answers `400 body/adminId Required`. `null` is the unassign value.
 */
export interface AssignFeedbackPayload {
  readonly adminId: string | null
}

/** `POST /admin/feedbacks/:id/reply`. */
export interface ReplyFeedbackPayload {
  readonly message: string
}

/* -------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */

/** `querystring/limit Number must be less than or equal to 100`. */
export const FEEDBACK_LIST_MAX_LIMIT = 100

/**
 * The panel's own floor for a transition note.
 *
 * The server accepts any string, or none. `ConfirmActionDialog` already
 * enforces ten characters for every other consequential action in the panel,
 * and a status change that another operator will read later is one.
 */
export const FEEDBACK_NOTE_MIN_LENGTH = 10
