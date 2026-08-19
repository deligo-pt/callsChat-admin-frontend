import { z } from 'zod'

import { idSchema, isoDateTime } from './common'

export const reportCategorySchema = z.enum([
  'HARASSMENT',
  'SPAM',
  'IMPERSONATION',
  'FRAUD',
  'EXPLICIT_CONTENT',
  'UNDERAGE',
  'SELF_HARM',
  'OTHER',
])
export type ReportCategory = z.infer<typeof reportCategorySchema>

export const reportTargetTypeSchema = z.enum(['USER', 'SOCIAL_CLUB'])
export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>

/**
 * A report.
 *
 * plan.md Moderation & Safety: this carries evidence METADATA only. No message
 * text, no call audio or video, no recordings — not as a field, not as a
 * nullable field, not behind a permission.
 */
export const reportSchema = z.object({
  id: idSchema,
  targetType: reportTargetTypeSchema,
  targetId: idSchema,
  targetName: z.string(),
  reporterId: idSchema.nullable(),
  reporterName: z.string().nullable(),
  category: reportCategorySchema,
  /** Reporter's own words describing the complaint. Not conversation content. */
  note: z.string().nullable(),
  sourceClubId: idSchema.nullable(),
  createdAt: isoDateTime,
})
export type Report = z.infer<typeof reportSchema>

export const caseStatusSchema = z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED'])
export type CaseStatus = z.infer<typeof caseStatusSchema>

export const casePrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
export type CasePriority = z.infer<typeof casePrioritySchema>

export const caseResolutionSchema = z.enum([
  'NO_ACTION',
  'RESTRICTION_APPLIED',
  'SUSPENDED',
  'BANNED',
  'CLUB_DISABLED',
  'CLUB_HIDDEN',
  'ESCALATED',
])
export type CaseResolution = z.infer<typeof caseResolutionSchema>

export const moderationCaseSummarySchema = z.object({
  id: idSchema,
  reference: z.string(),
  targetType: reportTargetTypeSchema,
  targetId: idSchema,
  targetName: z.string(),
  category: reportCategorySchema,
  status: caseStatusSchema,
  priority: casePrioritySchema,
  assigneeName: z.string().nullable(),
  reportCount: z.int().positive(),
  escalated: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type ModerationCaseSummary = z.infer<typeof moderationCaseSummarySchema>

export const moderationCaseDetailSchema = moderationCaseSummarySchema.extend({
  reports: z.array(reportSchema),
  internalNotes: z.array(
    z.object({
      id: idSchema,
      authorName: z.string(),
      body: z.string(),
      createdAt: isoDateTime,
    }),
  ),
  resolution: caseResolutionSchema.nullable(),
  decisionNote: z.string().nullable(),
  /**
   * plan.md Moderation: the case links to the action the domain service
   * actually applied. It never claims an action that was rejected.
   */
  appliedActionId: idSchema.nullable(),
  resolvedAt: isoDateTime.nullable(),
})
export type ModerationCaseDetail = z.infer<typeof moderationCaseDetailSchema>
