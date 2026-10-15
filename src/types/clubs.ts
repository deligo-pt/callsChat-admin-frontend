import { z } from 'zod'

import { diamondAmount, idSchema, isoDateTime } from './common'

/** plan.md §9 — open decision: exact names confirmed with product (§13). */
export const clubStatusSchema = z.enum(['SCHEDULED', 'ACTIVE', 'ENDED', 'DISABLED'])
export type ClubStatus = z.infer<typeof clubStatusSchema>

export const clubVisibilitySchema = z.enum(['PUBLIC', 'UNLISTED', 'HIDDEN'])
export type ClubVisibility = z.infer<typeof clubVisibilitySchema>

export const clubMemberRoleSchema = z.enum(['HOST', 'MODERATOR', 'PARTICIPANT'])
export type ClubMemberRole = z.infer<typeof clubMemberRoleSchema>

export const socialClubSummarySchema = z.object({
  id: idSchema,
  title: z.string(),
  category: z.string().nullable(),
  hostId: idSchema,
  hostName: z.string(),
  status: clubStatusSchema,
  visibility: clubVisibilitySchema,
  discoverable: z.boolean(),
  participantCount: z.int().nonnegative(),
  openReportCount: z.int().nonnegative(),
  createdAt: isoDateTime,
  startedAt: isoDateTime.nullable(),
  endedAt: isoDateTime.nullable(),
})
export type SocialClubSummary = z.infer<typeof socialClubSummarySchema>

export const clubMembershipSchema = z.object({
  id: idSchema,
  userId: idSchema,
  displayName: z.string(),
  role: clubMemberRoleSchema,
  joinedAt: isoDateTime,
  leftAt: isoDateTime.nullable(),
})
export type ClubMembership = z.infer<typeof clubMembershipSchema>

export const socialClubDetailSchema = socialClubSummarySchema.extend({
  description: z.string().nullable(),
  members: z.array(clubMembershipSchema),
  /**
   * Read-only. plan.md Social Club Management: finance in this module links to
   * the ledger and offers no balance-edit control.
   */
  giftSummary: z.object({
    giftCount: z.int().nonnegative(),
    diamondsGifted: diamondAmount,
  }),
  /** Session length in seconds — never media, never content. */
  durationSeconds: z.int().nonnegative().nullable(),
})
export type SocialClubDetail = z.infer<typeof socialClubDetailSchema>

/* -------------------------------------------------------------------------
 * Hosts — REMOVED 2026-10-15 (plan.md §4.1, phase H1)
 *
 * ⚠️ `hostApplicationSchema`, `hostApplicationStatusSchema` and
 * `hostProfileSchema` stood here, and **none of them had ever been checked
 * against the API they claimed to describe.** The live contract is in
 * `types/hosts.ts`, measured against
 * `https://test-api.callschat.com/api/v1` on 2026-10-15.
 *
 * Almost nothing survived the comparison:
 *
 *   - status was `SUBMITTED`; the service says **`PENDING`**;
 *   - the shape was `maskedPhone`, `countryCode`, `introduction`,
 *     `submittedAt`, `reviewedAt`, `reviewerName`, `decisionReason`,
 *     `applicantStatus` — the service sends `niche`,
 *     `expectedHostingHoursPerWeek`, `motivation`, `bio`, `introMediaUrl`,
 *     `socialLinks`, `createdAt` and a nested `user.profile`;
 *   - `hostProfileSchema` carried `approved`, `clubCount`, `openReportCount`
 *     and an `earnings` object; the service sends `badgeLevel`,
 *     `totalLiveHours`, `totalDiamondsEarned`, `followersCount`;
 *   - the mock served `/admin/host-applications`; the route is
 *     **`/admin/live/host-applications`**.
 *
 * Deleted rather than adapted. A UI built on it would have passed every test it
 * had and failed on its first live request — which is exactly what the
 * equivalent fiction in `types/ops.ts` did to the announcements build before it
 * was found.
 * ---------------------------------------------------------------------- */
