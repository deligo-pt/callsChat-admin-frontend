import { z } from 'zod'

import { envelopeSchema, idSchema, isoDateTime, paginatedSchema } from './common'

/**
 * Host Application Management contract (plan.md §2).
 *
 * VALIDATED against `https://test-api.callschat.com/api/v1` on **2026-10-15**
 * with a `SUPER_ADMIN` token. Every rejection reproduced below is the service's
 * own wording, and the whole write contract was mapped without a single
 * successful write — validation runs before the lookup on these routes, so a
 * malformed body against a nonexistent id answers `400`, not `404`.
 *
 * ⚠️ **No application, no host, and no `200`-success body has ever been
 * observed.** Every list is empty and every counter is zero on the live
 * service (plan.md §2.1), so the row shapes below come from the **doc**, not
 * from the wire. That is why they are written as permissively as they are —
 * see the note on `hostApplicationSchema`.
 *
 * ⚠️ This file **replaces an invented contract** that stood in `types/clubs.ts`
 * and had never been checked against anything (plan.md §4.1). Its status enum
 * was `SUBMITTED` where the service says `PENDING`, and it described eight
 * fields the service does not send. The removal note there lists the full
 * divergence.
 */

/* -------------------------------------------------------------------------
 * Enums
 * ---------------------------------------------------------------------- */

/**
 * ⚠️ **Case-SENSITIVE, unlike every other enum this panel talks to.**
 *
 * `?status=pending` is rejected with
 * `400 querystring/status Invalid enum value. Expected 'PENDING' | 'APPROVED'
 * | 'REJECTED'` — verified 2026-10-15.
 *
 * The bootstrap module trained the opposite reflex: there `platform` and
 * `appType` each accepted four spellings and the panel narrowed to upper-case
 * by choice. Here the narrowing is not a choice. Anything that lower-cases a
 * status on the way out turns the queue into a 400.
 */
export const hostApplicationStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED'])
export type HostApplicationStatus = z.infer<typeof hostApplicationStatusSchema>

export const HOST_APPLICATION_STATUSES = hostApplicationStatusSchema.options

/**
 * ⚠️ **Not validated by the server** — `?niche=GARBAGE` answers `200`
 * (verified 2026-10-15), while `status` in the same querystring is enum-checked.
 *
 * So a typo here does not fail; it silently returns the wrong set, which is
 * worse than a rejection. The panel offers these five as a closed select and
 * never lets an operator type one, because the server will not catch it.
 *
 * ⚠️ The five values are **doc-derived and unconfirmed** (plan.md O3). No
 * record exists to read a real `niche` from, so a sixth value in the data would
 * arrive as an unknown — which is why the row schema below accepts any string.
 */
export const hostNicheSchema = z.enum([
  'TECH',
  'MUSIC',
  'TALK',
  'BUSINESS',
  'ENTERTAINMENT',
])
export type HostNiche = z.infer<typeof hostNicheSchema>

export const HOST_NICHES = hostNicheSchema.options

/** `GET /admin/live/hosts?status=…` and the write enum are the same three. */
export const liveHostStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'BANNED'])
export type LiveHostStatus = z.infer<typeof liveHostStatusSchema>

export const LIVE_HOST_STATUSES = liveHostStatusSchema.options

/* -------------------------------------------------------------------------
 * The applicant, as nested on every row
 * ---------------------------------------------------------------------- */

/**
 * ⚠️ Every field optional, including the profile itself.
 *
 * The doc shows `user.profile.{displayName,username,avatarUrl}` fully
 * populated. Nothing has ever been seen on the wire, and an applicant who has
 * not set a display name is an ordinary state on any consumer platform — so a
 * required `displayName` here would blank the whole queue for one incomplete
 * account. The UI falls back to the username, then the id.
 */
export const hostApplicantSchema = z.object({
  id: idSchema.optional(),
  email: z.string().nullable().optional(),
  profile: z
    .object({
      displayName: z.string().nullable().optional(),
      username: z.string().nullable().optional(),
      avatarUrl: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
})
export type HostApplicant = z.infer<typeof hostApplicantSchema>

/* -------------------------------------------------------------------------
 * Host application
 * ---------------------------------------------------------------------- */

/**
 * One row of `GET /admin/live/host-applications`.
 *
 * ⚠️ **Deliberately permissive: only `id` is required.**
 *
 * This is the same call the announcements contract made, for the same reason
 * and with better evidence. Not one field below has been observed — the live
 * table is empty (plan.md §2.1, O1) — so every shape here is a reading of
 * prose. A strict schema against an unobserved payload does not catch a
 * backend mistake; it blanks the operator's screen on the first real row and
 * reports a Zod error they cannot act on.
 *
 * The enums accept `.or(z.string())` for the same reason: `niche` is not
 * server-validated at all (see `hostNicheSchema`), so an unknown value is a
 * thing the service will happily store and hand back.
 */
export const hostApplicationSchema = z.object({
  id: idSchema,
  userId: idSchema.optional(),

  niche: hostNicheSchema.or(z.string()).nullable().optional(),
  expectedHostingHoursPerWeek: z.number().nullable().optional(),
  motivation: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),

  status: hostApplicationStatusSchema.or(z.string()).nullable().optional(),

  /**
   * ⚠️ **Fetched by the browser, not merely linked.** The detail drawer renders
   * this in a `<video>`/`<audio>` element (doc §3 Screen 3), which makes it the
   * first URL in this module the browser loads rather than navigates to.
   *
   * Carried as a plain string, never `z.url()`. Every comparable URL field on
   * this backend is unvalidated server-side — the bootstrap `storeUrl` accepted
   * and publicly served `javascript:alert(1)` — and rejecting a poisoned value
   * at the contract boundary would blank the entire application over one field.
   * It is accepted here and defused at render, exactly as
   * `features/feedback/attachments.ts` handles an attachment URL.
   */
  introMediaUrl: z.string().nullable().optional(),

  /** Free-form record; the doc shows `{ youtube: "..." }` and nothing more. */
  socialLinks: z.record(z.string(), z.string()).nullable().optional(),

  /**
   * The applicant's answers to the onboarding questions.
   *
   * ⚠️ **Undocumented — found on a live record on 2026-10-15** (O4). The guide
   * asks for a "Q&A Responses (e.g. Equipment, Experience)" card but names no
   * field for it, and neither its response example nor its TypeScript snippet
   * contains one. The real payload calls it `qaResponses` and carries a
   * free-form object whose keys are whatever the mobile form asked.
   *
   * ⚠️ Values are `unknown`, not `string`. Nothing fixes the question set, so a
   * future question could answer with a number, a boolean or a list, and a
   * `z.string()` here would blank the whole application over one of them. The
   * renderer formats what it can and shows the rest as JSON.
   */
  qaResponses: z.record(z.string(), z.unknown()).nullable().optional(),

  rejectionReason: z.string().nullable().optional(),

  createdAt: isoDateTime.or(z.string()).nullable().optional(),
  updatedAt: isoDateTime.or(z.string()).nullable().optional(),
  reviewedAt: isoDateTime.or(z.string()).nullable().optional(),

  user: hostApplicantSchema.nullable().optional(),
})
export type HostApplication = z.infer<typeof hostApplicationSchema>

export const hostApplicationListSchema = paginatedSchema(hostApplicationSchema)
export const hostApplicationDetailSchema = envelopeSchema(hostApplicationSchema)

/* -------------------------------------------------------------------------
 * Live host
 * ---------------------------------------------------------------------- */

/** One row of `GET /admin/live/hosts`. Permissive for the same reason. */
export const liveHostSchema = z.object({
  id: idSchema,
  userId: idSchema.optional(),
  status: liveHostStatusSchema.or(z.string()).nullable().optional(),

  badgeLevel: z.number().nullable().optional(),
  level: z.number().nullable().optional(),
  xp: z.number().nullable().optional(),
  /** ⚠️ A float on the wire (`5.313609166666667`) — never coerce to an integer. */
  totalLiveHours: z.number().nullable().optional(),
  totalLiveSessions: z.number().nullable().optional(),
  peakViewers: z.number().nullable().optional(),
  followersCount: z.number().nullable().optional(),

  /* ----------------------------------------------------------------- *
   * Creator Studio — measured on a live record 2026-10-27, phase W6.
   * ----------------------------------------------------------------- */

  /**
   * ⚠️ **`withdrawableDiamonds` is NOT the host's spending balance**, and the
   * two must never be added together or shown unlabelled beside each other.
   *
   * The whole dual-balance architecture exists to stop promotional diamonds
   * being cashed out: `Wallet.diamondBalance` is spending money that can never
   * become fiat, and `LiveHostProfile.withdrawableDiamonds` is gift revenue
   * that can. A column that blurs them teaches an operator the opposite of the
   * rule the backend enforces — and `FinancePanel` already got this right for
   * available-vs-locked, in a module that cannot even see these numbers.
   */
  withdrawableDiamonds: z.number().nullable().optional(),
  /**
   * ⚠️ **Readable and not actionable.** No admin payout endpoint exists
   * (plan.md O3) — `/admin/wallet/withdrawals` and `/admin/withdrawals` are
   * both `ROUTE_NOT_FOUND` — so the panel can report what is in flight and can
   * do nothing about it. Anything rendering this says so.
   */
  pendingWithdrawal: z.number().nullable().optional(),
  /** Lifetime gift revenue, before the platform's share. */
  totalDiamondsEarned: z.number().nullable().optional(),
  totalGiftsReceived: z.number().nullable().optional(),
  /** The host's share of a gift, as a whole percent (`70` on every live row). */
  revenueSharePercent: z.number().nullable().optional(),

  /** ⚠️ Live *now*. A suspension ends an active broadcast (doc §5.2). */
  isLive: z.boolean().nullable().optional(),
  currentLiveRoomId: z.string().nullable().optional(),
  lastLiveAt: isoDateTime.or(z.string()).nullable().optional(),

  approvedAt: isoDateTime.or(z.string()).nullable().optional(),
  suspendedAt: isoDateTime.or(z.string()).nullable().optional(),
  /**
   * ⚠️ **`suspendedReason`, not `suspensionReason`.** Measured on a live
   * record (2026-10-15); the guide never names the field. The invented
   * spelling read `undefined` forever, so the roster's Reason column showed
   * `—` for every suspended host and every mock agreed with the mistake.
   */
  suspendedReason: z.string().nullable().optional(),
  /** Who suspended them — audit data the guide never documents. */
  suspendedById: idSchema.or(z.string()).nullable().optional(),

  user: hostApplicantSchema.nullable().optional(),
})
export type LiveHost = z.infer<typeof liveHostSchema>

export const liveHostListSchema = paginatedSchema(liveHostSchema)

/* -------------------------------------------------------------------------
 * Stats
 * ---------------------------------------------------------------------- */

/**
 * `GET /admin/live/host-applications/stats`.
 *
 * ⚠️ The one shape here that **has** been observed — all six keys present, all
 * six zero (verified 2026-10-15). Required rather than optional because of
 * that: this is measured, not read off prose.
 */
export const hostApplicationStatsSchema = envelopeSchema(
  z.object({
    totalApplications: z.number(),
    pendingCount: z.number(),
    approvedCount: z.number(),
    rejectedCount: z.number(),
    activeHostsCount: z.number(),
    suspendedHostsCount: z.number(),
  }),
)
export type HostApplicationStats = z.infer<typeof hostApplicationStatsSchema>['data']

/* -------------------------------------------------------------------------
 * Writes
 * ---------------------------------------------------------------------- */

export const reviewActionSchema = z.enum(['APPROVE', 'REJECT'])
export type ReviewAction = z.infer<typeof reviewActionSchema>

/** The server's floor, verified: a 4-character reason is rejected. */
export const MIN_REJECTION_REASON = 5

/** The server's floor for suspending **or banning**, verified. */
export const MIN_HOST_STATUS_REASON = 5

/** Queue bounds, verified: `limit=101` and `limit=0` are both `400`. */
export const MAX_LIST_LIMIT = 100
export const DEFAULT_LIST_LIMIT = 20

/**
 * `POST /admin/live/host-applications/:id/review`.
 *
 * ⚠️ `rejectionReason` is required when and only when rejecting — the server
 * states it as `body/rejectionReason A rejection reason of at least 5
 * characters is required when rejecting an application`. Modelled as a
 * discriminated union so the compiler refuses the body the server would.
 */
export type ReviewPayload =
  | { readonly action: 'APPROVE' }
  | { readonly action: 'REJECT'; readonly rejectionReason: string }

/**
 * `PATCH /admin/live/hosts/:userId/status`.
 *
 * ⚠️ **`reason` is required for `BANNED` as well as `SUSPENDED`**, which the
 * doc never says — §5.2 attaches it to suspension and §5.3 shows reactivation
 * without one. Verified: `{"status":"BANNED"}` alone is a `400` on the same
 * rule. `ACTIVE` needs no reason.
 */
export type HostStatusPayload =
  | { readonly status: 'ACTIVE'; readonly reason?: string }
  | { readonly status: 'SUSPENDED' | 'BANNED'; readonly reason: string }
