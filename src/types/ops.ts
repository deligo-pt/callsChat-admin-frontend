import { z } from 'zod'

import { idSchema, isoDateTime } from './common'

/**
 * Append-only audit event (plan.md §RBAC "Audit Event Contract").
 *
 * Never contains secrets, full payment instruments, private messages or media.
 * The before/after snapshot is redacted server-side.
 */
export const auditChangeSchema = z.object({
  field: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
})

export const auditLogSchema = z.object({
  id: idSchema,
  actorId: idSchema,
  actorName: z.string(),
  actorRole: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: idSchema,
  targetLabel: z.string(),
  reason: z.string().nullable(),
  changes: z.array(auditChangeSchema),
  correlationId: z.string(),
  sourceIp: z.string().nullable(),
  occurredAt: isoDateTime,
})
export type AuditLog = z.infer<typeof auditLogSchema>
export type AuditChangeRecord = z.infer<typeof auditChangeSchema>

/* -------------------------------------------------------------------------
 * Announcements / notifications
 * ---------------------------------------------------------------------- */

export const announcementStatusSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'QUEUED',
  'SENT_TO_PROVIDER',
  'DELIVERED',
  'FAILED',
  'EXPIRED',
])
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>

/**
 * plan.md Notifications: targeting may use audience, explicit IDs, role or
 * simple status/locale filters — never conversation content or inferred
 * sensitive attributes.
 */
export const announcementAudienceSchema = z.enum([
  'ALL_USERS',
  'HOSTS_ONLY',
  'EXPLICIT_IDS',
  'BY_STATUS',
])
export type AnnouncementAudience = z.infer<typeof announcementAudienceSchema>

export const announcementSchema = z.object({
  id: idSchema,
  title: z.string(),
  body: z.string(),
  channel: z.enum(['PUSH', 'IN_APP_BANNER']),
  audience: announcementAudienceSchema,
  audienceDescription: z.string(),
  status: announcementStatusSchema,
  deepLink: z.string().nullable(),
  createdByName: z.string(),
  version: z.int().nonnegative(),
  scheduledAt: isoDateTime.nullable(),
  publishedAt: isoDateTime.nullable(),
  expiresAt: isoDateTime.nullable(),
  /**
   * Delivery is best-effort. plan.md Notifications: these states are labelled
   * honestly — "sent to provider" never means "read by user".
   */
  delivery: z.object({
    estimatedRecipients: z.int().nonnegative(),
    queued: z.int().nonnegative(),
    sentToProvider: z.int().nonnegative(),
    delivered: z.int().nonnegative(),
    failed: z.int().nonnegative(),
  }),
})
export type Announcement = z.infer<typeof announcementSchema>

/* -------------------------------------------------------------------------
 * System configuration
 * ---------------------------------------------------------------------- */

export const configurationEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  valueType: z.enum(['INTEGER', 'BOOLEAN', 'STRING']),
  value: z.union([z.string(), z.number(), z.boolean()]),
  /** Human-readable validation contract, e.g. "1,000 – 1,000,000 Diamonds". */
  constraint: z.string(),
  updatedByName: z.string().nullable(),
  effectiveFrom: isoDateTime,
  version: z.int().nonnegative(),
})
export type ConfigurationEntry = z.infer<typeof configurationEntrySchema>

/* -------------------------------------------------------------------------
 * Global search
 * ---------------------------------------------------------------------- */

export const searchResultSchema = z.object({
  id: idSchema,
  type: z.enum(['USER', 'SOCIAL_CLUB', 'PAYMENT', 'WITHDRAWAL', 'HOST_APPLICATION']),
  label: z.string(),
  /** Masked secondary line — never a raw phone or email. */
  sublabel: z.string(),
  href: z.string(),
})
export type SearchResult = z.infer<typeof searchResultSchema>
