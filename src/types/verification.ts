import { z } from 'zod'

import { countEnvelopeSchema, idSchema, isoDateTime } from './common'

/**
 * Verification & Compliance contract (plan.md §2).
 *
 * VERIFIED against the live API on **2026-09-29** with a `SUPER_ADMIN` token:
 * all four admin routes, every list filter, a decrypted document stream with
 * its response headers, and a full decision round-trip including every
 * validation branch. Where the written doc and the live service disagreed, the
 * live service won (plan.md §2.8).
 *
 * ⚠️ This module handles **government identity documents**. Three rules in this
 * file exist for that reason and not for tidiness:
 *
 * 1. No schema here ever carries a document's bytes or a URL that would fetch
 *    them unauthenticated. {@link verificationDocumentSchema} is metadata only.
 * 2. `previewUrl` is typed as a plain string and is **never** used as a fetch
 *    target — `api/verifications.ts` builds the path itself from `id` and
 *    `docIndex` (see that file).
 * 3. The decision response is modelled as a deliberately **unrenderable**
 *    shape, so no screen can paint itself from a write
 *    ({@link verificationDecisionResponseSchema}).
 */

/* -------------------------------------------------------------------------
 * Enums
 * ---------------------------------------------------------------------- */

/** KYC or KYB. The one field that decides which half of this module applies. */
export const verificationTargetTypeSchema = z.enum(['USER_IDENTITY', 'BUSINESS_ENTITY'])
export type VerificationTargetType = z.infer<typeof verificationTargetTypeSchema>

export const VERIFICATION_TARGET_TYPE_VALUES = verificationTargetTypeSchema.options

/**
 * The lifecycle states — **five of them, not the four the doc documents**
 * (plan.md §3.2).
 *
 * The live rejection message for a bad `status` lists
 * `'PENDING' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'ALL'`.
 * `verification_doc.md` documents `PENDING_REVIEW`, `APPROVED`, `REJECTED` and
 * `REVOKED`, and never mentions `PENDING` — which is the value **every live row
 * actually holds**. Filtering by either `PENDING` or `PENDING_REVIEW` returned
 * the same three rows, so they behave as aliases.
 *
 * Both are kept. Dropping `PENDING` would reject every real row; dropping
 * `PENDING_REVIEW` would reject a value the API can return. `lib/status.ts`
 * renders them identically, because the panel does not invent a distinction the
 * data does not make.
 *
 * ⚠️ `APPROVED` is **not terminal**, despite `verification_doc.md` calling it
 * *"Terminal state (Immutable)"*. A `PATCH /decision` with `action: "REJECT"`
 * against an approved request returns 200 and rejects it — found by doing it to
 * a real applicant's record (plan.md §3.1, appendix #1). Nothing in this type
 * can prevent that; the confirm dialog in V4 is what does.
 */
export const verificationStatusSchema = z.enum([
  'PENDING',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'REVOKED',
])
export type VerificationStatus = z.infer<typeof verificationStatusSchema>

export const VERIFICATION_STATUS_VALUES = verificationStatusSchema.options

/**
 * The six rejection codes. This is what the **applicant's app** shows them, so
 * it is not an internal note — `rejectionReason` is the human sentence.
 */
export const verificationRejectionCodeSchema = z.enum([
  'BLURRY_DOCUMENT',
  'EXPIRED_DOCUMENT',
  'NAME_MISMATCH',
  'INVALID_DOCUMENT',
  'INCOMPLETE_DOCUMENT',
  'OTHER',
])
export type VerificationRejectionCode = z.infer<typeof verificationRejectionCodeSchema>

export const VERIFICATION_REJECTION_CODE_VALUES =
  verificationRejectionCodeSchema.options

/** `PATCH /:id/decision` — uppercase only; `approve` answers 400. */
export const verificationDecisionActionSchema = z.enum(['APPROVE', 'REJECT'])
export type VerificationDecisionAction = z.infer<
  typeof verificationDecisionActionSchema
>

/* -------------------------------------------------------------------------
 * Nested blocks
 * ---------------------------------------------------------------------- */

/**
 * Who filed the application — **when the service says**.
 *
 * ⚠️ **Every key is optional and nullable, and that is a measurement rather
 * than caution** (plan.md §3.4). On a `BUSINESS_ENTITY` row the live service
 * returns the object with `displayName`, `username`, `email`, `phone` and
 * `avatarUrl` all `null`, while `accountType: "PERSONAL"` is populated and
 * means nothing. The detail route uses a *different* projection again — the
 * doc's example carries `id` and omits `username`, `avatarUrl` and
 * `accountType`.
 *
 * The feedback module already paid for getting this wrong twice: a key that was
 * `.nullable()` but not `.optional()` rejected an entire detail response
 * because one projection omitted it. Three schemas for three projections is the
 * alternative, and it would have to be hand-synced against a backend that has
 * shown it will change shape per call site.
 *
 * `features/verifications/subject.ts` is where "who is this" gets decided, and
 * it must cope with every field being absent.
 */
export const verificationApplicantSchema = z.object({
  id: idSchema.optional(),
  displayName: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  /**
   * ⚠️ **A storage key, not a URL.** Captured live 2026-09-29:
   * `"avatars/avatar_cmspy4u4r019g01qr2v5ihpaj_1786538993084.jpg"` — relative,
   * with no origin and no bucket.
   *
   * Passing it to an `<img src>` resolves it against the panel's own origin and
   * 404s. Nothing in the API tells us what to prefix it with, so the panel
   * renders **initials** instead and never attempts to load it. The field is
   * kept because its presence is a fact about the record, not because it can be
   * displayed.
   */
  avatarUrl: z.string().nullable().optional(),
  /** Not narrowed to an enum: it is display-only, and it lies on KYB rows. */
  accountType: z.string().nullable().optional(),
})
export type VerificationApplicant = z.infer<typeof verificationApplicantSchema>

/**
 * The company, on a `BUSINESS_ENTITY` application.
 *
 * Populated exactly where {@link verificationApplicantSchema} is empty, which
 * is why the Subject column reads from one or the other rather than from a
 * single field.
 *
 * ⚠️ **The detail route returns eleven fields, not the four the queue needs**
 * — captured live on 2026-09-29 and added in V2. The four were a placeholder
 * pending a real body; keeping them would have meant a KYB review screen that
 * silently withheld the company's address and the owning account from the
 * officer deciding on it.
 *
 * `userId` is the one that matters most: it is the account that filed the
 * application, and the only link from a business row back to a person, because
 * `applicant` is empty on these (§3.4).
 */
export const verificationBusinessSchema = z.object({
  id: idSchema,
  /** ⚠️ The owning account — the only route from a KYB row to a human. */
  userId: idSchema.nullable().optional(),
  companyName: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  /** Free text from the applicant. Never rendered as a link — see `safeUrl`. */
  website: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  operatingHours: z.string().nullable().optional(),
  isVerified: z.boolean().optional(),
  /** When the business profile was created — not when it applied. */
  createdAt: isoDateTime.optional(),
  updatedAt: isoDateTime.optional(),
})
export type VerificationBusiness = z.infer<typeof verificationBusinessSchema>

/**
 * One document in the manifest — **metadata only, never bytes**.
 *
 * ⚠️ `originalName` and `mimeType` come off an upload and are therefore
 * attacker-controlled free text. `originalName` is rendered (with
 * `wrap-anywhere`) and must never become anything but text. `mimeType` picks
 * the renderer, so it is checked against a small allowlist at the point of use
 * rather than trusted.
 *
 * ⚠️ `previewUrl` is a path, not a URL, and the panel **does not fetch it**.
 * `api/verifications.ts` builds `/admin/verifications/:id/document/:docIndex`
 * from the two ids it already has, so a server-supplied path can never redirect
 * a credentialed request somewhere else. It is kept in the type because it is
 * on the wire and because its absence would be worth noticing.
 */
export const verificationDocumentSchema = z.object({
  docIndex: z.int().nonnegative(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.int().nonnegative(),
  uploadedAt: isoDateTime,
  previewUrl: z.string(),
})
export type VerificationDocument = z.infer<typeof verificationDocumentSchema>

/**
 * One row of the immutable audit trail.
 *
 * ⚠️ **`ipAddress` and `userAgent` are personal data about a colleague**
 * (plan.md §3.7). `verification_doc.md`'s example shows four keys and never
 * mentions either. They are carried because an investigation needs them, and
 * the timeline keeps them behind a disclosure rather than in the default view.
 *
 * `action` is **not** narrowed to an enum. The doc lists six
 * (`SUBMITTED`, `DOCUMENTS_UPDATED`, `RESUBMITTED`, `VIEWED_DOCUMENT`,
 * `APPROVED`, `REJECTED`) and a seventh must degrade to a humanised label
 * rather than reject the whole application — the same rule `resolveStatus`
 * follows.
 *
 * ⚠️ **Rows arrive newest first**, verified live 2026-09-29 — the opposite of a
 * reply stream, which reads downward. The timeline does not re-sort them.
 *
 * ⚠️ **`metadata` has a different shape per action**, which is why it is an
 * open record rather than a typed object. All three observed live:
 *
 * | Action | Keys |
 * |---|---|
 * | `SUBMITTED` | `idType`, `targetType`, `documentCount` |
 * | `VIEWED_DOCUMENT` | `docIndex`, `mimeType`, `originalName` |
 * | `APPROVED` / `REJECTED` | `action`, `adminNotes`, `rejectionCode`, `rejectionReason` |
 *
 * ⚠️ `VIEWED_DOCUMENT` rows are **real and recorded**, confirming §3.3 is not a
 * theoretical concern: opening a document writes a permanent row naming the
 * admin who did it.
 */
export const verificationAuditLogSchema = z.object({
  id: idSchema,
  requestId: idSchema.optional(),
  actorId: idSchema.nullable().optional(),
  action: z.string(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  /** A free-form blob; shape varies by action. Read, never trusted. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: isoDateTime,
})
export type VerificationAuditLog = z.infer<typeof verificationAuditLogSchema>

/* -------------------------------------------------------------------------
 * The record
 * ---------------------------------------------------------------------- */

/**
 * One application, in whatever completeness the answering route chose.
 *
 * The list and detail routes were both stable across repeated calls on
 * 2026-09-29, so the columns below are required — unlike the feedback module,
 * where the same write returned two different shapes seconds apart. What is
 * optional here is exactly what the detail route **adds**: the decision fields
 * and the two arrays.
 *
 * ⚠️ `idType` is free text, not an enum. `verification_doc.md:165` types it
 * `Text` and gives four examples (`NATIONAL_ID`, `PASSPORT`,
 * `DRIVING_LICENSE`, `TRADE_LICENSE`) with per-target defaults, so an
 * applicant's client can submit anything. It is `null` on business
 * applications. Labelling belongs to the feature, which must handle a value it
 * has never seen.
 */
export const verificationSchema = z.object({
  id: idSchema,
  targetType: verificationTargetTypeSchema,
  /** Null on a `BUSINESS_ENTITY` row; the applicant's account id otherwise. */
  userId: idSchema.nullable(),
  businessId: idSchema.nullable(),
  /**
   * ⚠️ Returned on every row and **documented nowhere** (plan.md §8 O3). Null
   * on all five live rows. Carried so it is visible the day it is populated.
   */
  workspaceId: idSchema.nullable().optional(),
  status: verificationStatusSchema,
  idType: z.string().nullable(),
  /** List rows only — the detail route omits it. Count `documents` instead. */
  documentCount: z.int().nonnegative().optional(),
  submittedAt: isoDateTime,
  reviewedAt: isoDateTime.nullable(),

  /* ---- Detail-only ---- */

  /**
   * The enum, widened to a plain string on the way in.
   *
   * `.or(z.string())` for the same reason `errorCodeSchema` has it: a code the
   * backend adds must not blank the application an operator is trying to read.
   * The panel only ever *sends* a value from
   * {@link verificationRejectionCodeSchema}.
   */
  rejectionCode: verificationRejectionCodeSchema.or(z.string()).nullable().optional(),
  /**
   * ⚠️ Can be `null` on a `REJECTED` record. The API accepts a rejection with
   * no reason text at all — verified, 200 (plan.md §3.6). The detail page names
   * that gap rather than rendering an empty paragraph.
   */
  rejectionReason: z.string().nullable().optional(),
  /** Internal. The applicant never sees this; `rejectionReason` is what they read. */
  adminNotes: z.string().nullable().optional(),

  applicant: verificationApplicantSchema.nullable().optional(),
  business: verificationBusinessSchema.nullable().optional(),
  /** ⚠️ Empty on all three live business applications (plan.md §3.5). */
  documents: z.array(verificationDocumentSchema).optional(),
  /** ⚠️ Empty on one live application — not even a `SUBMITTED` row (§3.5). */
  auditLogs: z.array(verificationAuditLogSchema).optional(),
})
export type Verification = z.infer<typeof verificationSchema>

/**
 * An application as the detail route returns it — the same schema, narrowed by
 * use rather than by a second, stricter parse.
 *
 * A stricter schema would fail the page instead of degrading it the day a
 * relation is dropped, and screens must branch on presence anyway: an
 * application with zero documents and zero audit rows is a real, live state.
 */
export type VerificationDetail = Verification

/* -------------------------------------------------------------------------
 * Response envelopes
 * ---------------------------------------------------------------------- */

/**
 * `GET /admin/verifications` — the **third** envelope shape on this backend
 * (plan.md §2.2). Rows under `data.requests`, counters beside them.
 */
export const verificationListResponseSchema = countEnvelopeSchema(
  verificationSchema,
  'requests',
)

/** `GET /admin/verifications/:id`. */
export const verificationDetailResponseSchema = z.object({
  success: z.literal(true),
  data: verificationSchema,
})

/**
 * `PATCH /admin/verifications/:id/decision` — deliberately **unrenderable**.
 *
 * `verification_doc.md` documents `data` as three keys (`id`, `status`,
 * `reviewedAt`), and this schema keeps it to those three even if the service
 * sends more: Zod strips the rest.
 *
 * That is the point. Modelling the full record here would let a screen paint
 * itself from a write, and this is the one module where that matters most — a
 * decision is the moment the audit trail, the documents and the applicant's
 * account all change together, and only a refetch shows the result. The
 * mutation confirms; `GET /:id` draws.
 */
export const verificationDecisionResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.object({
    id: idSchema,
    status: verificationStatusSchema,
    reviewedAt: isoDateTime.nullable().optional(),
  }),
})
export type VerificationDecisionResult = z.infer<
  typeof verificationDecisionResponseSchema
>['data']

/* -------------------------------------------------------------------------
 * Request shapes
 * ---------------------------------------------------------------------- */

/**
 * Filter values. `ALL` is a filter, not a state an application can be in, so it
 * widens nothing above — the same split `types/feedback.ts` and
 * `types/staff.ts` make.
 */
export const verificationStatusFilterSchema = z.enum([
  ...VERIFICATION_STATUS_VALUES,
  'ALL',
])
export type VerificationStatusFilter = z.infer<typeof verificationStatusFilterSchema>

export const verificationTargetTypeFilterSchema = z.enum([
  ...VERIFICATION_TARGET_TYPE_VALUES,
  'ALL',
])
export type VerificationTargetTypeFilter = z.infer<
  typeof verificationTargetTypeFilterSchema
>

export interface VerificationListQuery {
  readonly page?: number | undefined
  readonly limit?: number | undefined
  /**
   * ⚠️ **Always sent, never omitted** (plan.md §3.8). Omitting it does not mean
   * "everything": the service defaults to the pending applications and returned
   * 3 of 5 rows. A queue that lets the parameter fall away shows a filtered
   * list while claiming to show all of them.
   */
  readonly status: VerificationStatusFilter
  readonly targetType?: VerificationTargetTypeFilter | undefined
  readonly search?: string | undefined
  /*
   * Mirrors `ListParams` so this can be handed to `queryKeys.*.list()` without
   * a cast. The named keys above are what the endpoint actually accepts; this
   * signature exists for structural compatibility, not to invite extra
   * parameters — and the API silently ignores unknown ones, so a stray key
   * would be a filter that never applied.
   */
  readonly [key: string]: string | number | boolean | undefined
}

/** `PATCH /:id/decision` with `action: "APPROVE"`. */
export interface ApproveVerificationPayload {
  readonly action: 'APPROVE'
  /** Internal note. Optional here and optional on the wire. */
  readonly adminNotes?: string
}

/**
 * `PATCH /:id/decision` with `action: "REJECT"`.
 *
 * ⚠️ **Both `rejectionCode` and `rejectionReason` are required here, and the
 * server requires neither** (plan.md §3.6). Verified live: `REJECT` with only a
 * code returned 200, and `REJECT` with only a reason returned 200 — so an
 * applicant can be refused and handed nothing to act on.
 *
 * The required keys are the enforcement. A reasonless rejection cannot be
 * constructed without a cast, which is a far better guard than a validator
 * somebody can forget to call.
 */
export interface RejectVerificationPayload {
  readonly action: 'REJECT'
  /** What the applicant's app shows them. */
  readonly rejectionCode: VerificationRejectionCode
  /** What a human reads. */
  readonly rejectionReason: string
  readonly adminNotes?: string
}

export type VerificationDecisionPayload =
  ApproveVerificationPayload | RejectVerificationPayload

/* -------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */

/** `querystring/limit Number must be less than or equal to 100`, verified. */
export const VERIFICATION_LIST_MAX_LIMIT = 100

/**
 * The status the queue opens on, and sends explicitly.
 *
 * `PENDING` rather than `PENDING_REVIEW` because that is the value every live
 * row holds (plan.md §3.2), and rather than `ALL` because the work of this
 * screen is the applications nobody has looked at yet.
 */
export const DEFAULT_VERIFICATION_STATUS_FILTER: VerificationStatusFilter = 'PENDING'

/**
 * The panel's own floor for a rejection reason.
 *
 * The server accepts any string, or none. `ConfirmActionDialog` enforces ten
 * characters for every other consequential action in this panel, and telling a
 * stranger their identity document was refused is one.
 */
export const VERIFICATION_REJECTION_REASON_MIN_LENGTH = 10

/**
 * MIME types the document viewer will render inline.
 *
 * An allowlist rather than a sniff, because `mimeType` is attacker-controlled
 * (see {@link verificationDocumentSchema}) and the renderer is chosen from it.
 * Anything else is offered as "cannot be previewed" rather than guessed at —
 * and never as a download (plan.md §1.2).
 */
export const VERIFICATION_VIEWABLE_IMAGE_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]

export const VERIFICATION_VIEWABLE_PDF_TYPE = 'application/pdf'
