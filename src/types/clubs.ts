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
 * Hosts
 * ---------------------------------------------------------------------- */

export const hostApplicationStatusSchema = z.enum(['SUBMITTED', 'APPROVED', 'REJECTED'])
export type HostApplicationStatus = z.infer<typeof hostApplicationStatusSchema>

/**
 * plan.md Host Management: MVP review is lightweight and manual. No KYC, no
 * identity documents — only what an Operations Admin needs for a basic call.
 */
export const hostApplicationSchema = z.object({
  id: idSchema,
  userId: idSchema,
  displayName: z.string(),
  maskedPhone: z.string(),
  countryCode: z.string().nullable(),
  introduction: z.string(),
  status: hostApplicationStatusSchema,
  submittedAt: isoDateTime,
  reviewedAt: isoDateTime.nullable(),
  reviewerName: z.string().nullable(),
  decisionReason: z.string().nullable(),
  /** Account state at review time — approval must not bypass a ban. */
  applicantStatus: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']),
})
export type HostApplication = z.infer<typeof hostApplicationSchema>

export const hostProfileSchema = z.object({
  id: idSchema,
  userId: idSchema,
  displayName: z.string(),
  approved: z.boolean(),
  approvedAt: isoDateTime.nullable(),
  countryCode: z.string().nullable(),
  clubCount: z.int().nonnegative(),
  openReportCount: z.int().nonnegative(),
  /**
   * Backend-calculated. plan.md §3.3: the frontend never computes withdrawable
   * earnings — it displays what the ledger and payout configuration produced.
   */
  earnings: z.object({
    availableDiamonds: diamondAmount,
    lockedDiamonds: diamondAmount,
    withdrawalThreshold: diamondAmount,
    eligibleForWithdrawal: z.boolean(),
  }),
})
export type HostProfile = z.infer<typeof hostProfileSchema>
