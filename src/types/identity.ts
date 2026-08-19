import { z } from 'zod'

import { diamondAmount, idSchema, isoDateTime } from './common'

/* -------------------------------------------------------------------------
 * Consumer users
 * ---------------------------------------------------------------------- */

/** plan.md §9: only three account statuses exist in MVP. */
export const accountStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'BANNED'])
export type AccountStatus = z.infer<typeof accountStatusSchema>

/**
 * Capabilities that can be independently restricted. A restriction is NOT an
 * account status — the two are kept structurally separate everywhere
 * (plan.md User Management).
 */
export const capabilitySchema = z.enum([
  'MESSAGING',
  'VOICE_CALL',
  'VIDEO_CALL',
  'CLUB_PARTICIPATION',
  'CLUB_CREATION',
  'GIFTING',
  'DIAMOND_PURCHASE',
  'HOSTING',
])
export type Capability = z.infer<typeof capabilitySchema>

export const capabilityRestrictionSchema = z.object({
  id: idSchema,
  capability: capabilitySchema,
  reason: z.string(),
  createdBy: z.string(),
  startsAt: isoDateTime,
  /** Null means indefinite. Temporary restrictions expire server-side. */
  endsAt: isoDateTime.nullable(),
  active: z.boolean(),
})
export type CapabilityRestriction = z.infer<typeof capabilityRestrictionSchema>

export const userSummarySchema = z.object({
  id: idSchema,
  displayName: z.string(),
  /** Already masked by the backend for roles without reveal permission. */
  maskedPhone: z.string(),
  status: accountStatusSchema,
  isHost: z.boolean(),
  activeRestrictionCount: z.int().nonnegative(),
  registeredAt: isoDateTime,
  lastActiveAt: isoDateTime.nullable(),
  countryCode: z.string().nullable(),
})
export type UserSummary = z.infer<typeof userSummarySchema>

export const userDetailSchema = userSummarySchema.extend({
  maskedEmail: z.string().nullable(),
  restrictions: z.array(capabilityRestrictionSchema),
  /**
   * Read-only finance summary. plan.md §3.2: available and locked are separate
   * figures and there is no mutation path from this module.
   */
  wallet: z
    .object({
      availableDiamonds: diamondAmount,
      lockedDiamonds: diamondAmount,
    })
    .nullable(),
  hostApplicationStatus: z.enum(['NONE', 'SUBMITTED', 'APPROVED', 'REJECTED']),
  reportCount: z.int().nonnegative(),
})
export type UserDetail = z.infer<typeof userDetailSchema>

export const userSessionSchema = z.object({
  id: idSchema,
  deviceLabel: z.string(),
  /** Coarse location only — no precise device fingerprinting (plan.md §RBAC). */
  approximateLocation: z.string().nullable(),
  createdAt: isoDateTime,
  lastSeenAt: isoDateTime,
  current: z.boolean(),
})
export type UserSession = z.infer<typeof userSessionSchema>

/* -------------------------------------------------------------------------
 * Admin identity
 * ---------------------------------------------------------------------- */

export const adminRoleSchema = z.enum(['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'MODERATOR'])
export type AdminRole = z.infer<typeof adminRoleSchema>

export const ADMIN_ROLE_LABELS: Readonly<Record<AdminRole, string>> = {
  SUPER_ADMIN: 'Super Admin',
  OPERATIONS_ADMIN: 'Operations Admin',
  MODERATOR: 'Moderator',
}

/** Response of `GET /admin/me` — the session bootstrap (plan.md §2.5). */
export const currentAdminSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.email(),
  role: adminRoleSchema,
  /** Effective permission set. The browser treats this as UX only. */
  permissions: z.array(z.string()),
  lastSignInAt: isoDateTime.nullable(),
})
export type CurrentAdmin = z.infer<typeof currentAdminSchema>

export const adminUserSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.email(),
  role: adminRoleSchema,
  active: z.boolean(),
  createdAt: isoDateTime,
  lastSignInAt: isoDateTime.nullable(),
})
export type AdminUser = z.infer<typeof adminUserSchema>

export const roleSchema = z.object({
  key: adminRoleSchema,
  label: z.string(),
  description: z.string(),
  permissions: z.array(z.string()),
})
export type Role = z.infer<typeof roleSchema>
