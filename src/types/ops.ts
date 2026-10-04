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
 *
 * ⚠️ **Deleted on 2026-10-04, and the deletion is the point** (plan.md §3.1).
 *
 * `announcementSchema` and its two enums lived here from before the
 * announcements API existed, written from `doc/Notifications and
 * Communication.md`. When the real endpoints shipped, not one field matched:
 * the status enum had seven values against the real three, the audience enum
 * four against three, `body` was really `content`, and `channel`, `version`,
 * `audienceDescription`, `createdByName`, `scheduledAt`, `expiresAt` and an
 * entire `delivery{estimatedRecipients,queued,sentToProvider,delivered,failed}`
 * block described nothing that exists.
 *
 * It went out with its two consumers — 24 invented rows in `mocks/seed.ts` and
 * a `listHandler`/`detailHandler` pair in `mocks/handlers/resources.ts` that
 * mocked a detail route the service does not have. The real contract is
 * `types/announcement.ts`, built from measured validation rejections.
 * ---------------------------------------------------------------------- */

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
