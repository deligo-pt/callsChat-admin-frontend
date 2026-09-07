import { z } from 'zod'

import { diamondAmount, idSchema, isoDateTime } from './common'

/* -------------------------------------------------------------------------
 * Consumer users
 *
 * VERIFIED against `GET /admin/users` and `GET /admin/users/:id` on
 * 2026-08-25 (plan.md §10.3 / §10.4). Enum members below are the exact values
 * the API validates against — they came out of its own rejection messages.
 * ---------------------------------------------------------------------- */

/**
 * plan.md §10.4. Note this is FIVE states, not the three originally assumed:
 * `INACTIVE` and `PENDING_VERIFICATION` are real and common — on the live data
 * set 21 of 22 accounts sit in `PENDING_VERIFICATION`.
 *
 * `ALL` is accepted by the API as a filter value but is not a state a user can
 * be in, so it is deliberately excluded here and handled by the filter layer.
 */
export const accountStatusSchema = z.enum([
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'BANNED',
  'PENDING_VERIFICATION',
  /*
   * A deletion grace period, absent from the docs and the Postman collection.
   * It surfaced only when a real account entered it — the 22 accounts the enum
   * was originally verified against happened to include none.
   */
  'SCHEDULED_FOR_DELETION',
])
export type AccountStatus = z.infer<typeof accountStatusSchema>

/**
 * A status as it arrives on the wire.
 *
 * The enum above is what the UI *knows*; this is what it *accepts*. The two
 * differ because a status is a display-only label, and validating it strictly
 * meant one unrecognised value blanked the entire user directory — including
 * the twenty-odd rows that parsed perfectly. `SCHEDULED_FOR_DELETION` did
 * exactly that in production.
 *
 * `resolveStatus()` already renders an unknown value as a neutral badge with a
 * humanised label, so the presentation layer never needed the guarantee that
 * the schema was enforcing.
 *
 * This deliberately does NOT extend to identifiers, money or permissions,
 * where an unrecognised value must still fail loudly rather than be rendered.
 *
 * `(string & {})` keeps editor autocomplete for the known values while still
 * admitting any string — a plain `| string` would collapse the union.
 */
export const accountStatusValueSchema = z.union([accountStatusSchema, z.string()])
export type AccountStatusValue = AccountStatus | (string & {})

/** Statuses an admin can *set* via `POST /admin/users/:id/status` (plan.md §10.3). */
export const settableAccountStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'BANNED'])
export type SettableAccountStatus = z.infer<typeof settableAccountStatusSchema>

/**
 * Capabilities that can be independently restricted. A restriction is NOT an
 * account status — the two are kept structurally separate everywhere
 * (plan.md Phase 3, "Rules enforced").
 *
 * Verified list. `HOSTING` — assumed in the earlier draft — does not exist,
 * and the club capabilities are prefixed `SOCIAL_CLUB_`, not `CLUB_`.
 */
export const capabilitySchema = z.enum([
  'MESSAGING',
  'VOICE_CALL',
  'VIDEO_CALL',
  'SOCIAL_CLUB_PARTICIPATION',
  'SOCIAL_CLUB_CREATION',
  'GIFTING',
  'DIAMOND_PURCHASE',
])
export type Capability = z.infer<typeof capabilitySchema>

export const CAPABILITY_VALUES = capabilitySchema.options

/** Reason categories accepted by `POST /admin/users/:id/suspend`. */
export const suspensionReasonSchema = z.enum([
  'SPAM',
  'HARASSMENT',
  'FAKE_ACCOUNT',
  'POLICY_VIOLATION',
  'OTHER',
])
export type SuspensionReason = z.infer<typeof suspensionReasonSchema>

export const accountTypeSchema = z.enum(['PERSONAL', 'BUSINESS'])
export type AccountType = z.infer<typeof accountTypeSchema>

/** Platform role. Distinct from the admin-panel role model in plan.md §8. */
export const userRoleSchema = z.enum(['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'])
export type UserRole = z.infer<typeof userRoleSchema>

/**
 * A row from `GET /admin/users`.
 *
 * `activeRestrictions` arrives as an array on the list endpoint (the detail
 * endpoint returns a count instead, under a different key) — the shapes are
 * genuinely different, so they are modelled separately rather than forced
 * into one type.
 */
export const userSummarySchema = z.object({
  id: idSchema,
  displayName: z.string(),
  username: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** Unmasked; the backend decides disclosure. Render through `MaskedValue`. */
  email: z.string().nullable(),
  phone: z.string().nullable(),
  phoneMasked: z.string().nullable(),
  role: userRoleSchema,
  status: accountStatusValueSchema,
  accountType: accountTypeSchema,
  isHost: z.boolean(),
  activeRestrictions: z.array(capabilitySchema.or(z.string())),
  createdAt: isoDateTime,
  lastActiveAt: isoDateTime.nullable(),
})
export type UserSummary = z.infer<typeof userSummarySchema>

/* -------------------------------------------------------------------------
 * User detail — the six-tab payload (Phase 3B consumes these)
 * ---------------------------------------------------------------------- */

export const capabilityRestrictionSchema = z.object({
  id: idSchema,
  capability: capabilitySchema.or(z.string()),
  reason: z.string(),
  createdAt: isoDateTime,
  expiresAt: isoDateTime.nullable(),
  /** Present on history entries only. */
  liftedAt: isoDateTime.nullish(),
  createdBy: z.string().nullish(),
})
export type CapabilityRestriction = z.infer<typeof capabilityRestrictionSchema>

/**
 * A session row.
 *
 * ⚠️ Two endpoints return sessions with DIFFERENT shapes, confirmed against
 * live data:
 *
 *   - `GET /admin/users/:id` → `sessionsAndDevices.sessions[]` omits `userId`
 *     and `revokedAt` entirely, even on a revoked session (`isRevoked: true`).
 *   - `GET /admin/users/:id/sessions` → includes both.
 *
 * `nullish()` on those two fields is what lets one schema serve both, rather
 * than maintaining near-identical types that would drift. Consumers must treat
 * a missing `revokedAt` as unknown, not as "not revoked" — `isRevoked` is the
 * authoritative flag. Worth asking the backend to make these consistent.
 */
export const userSessionSchema = z.object({
  id: idSchema,
  userId: idSchema.nullish(),
  platform: z.string().nullable(),
  deviceName: z.string().nullable(),
  deviceId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  isRevoked: z.boolean(),
  revokedAt: isoDateTime.nullish(),
  expiresAt: isoDateTime.nullable(),
  lastActiveAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
})
export type UserSession = z.infer<typeof userSessionSchema>

/**
 * A registered push/device token.
 *
 * Shape confirmed from live data: `{ id, deviceType, createdAt }`. Extra keys
 * are tolerated because this is the only sample available.
 */
export const deviceTokenSchema = z.object({
  id: idSchema,
  deviceType: z.string().nullish(),
  createdAt: isoDateTime.nullish(),
})
export type DeviceToken = z.infer<typeof deviceTokenSchema>

/**
 * Audit / restriction / suspension entries.
 *
 * ⚠️ Every one of these arrays is EMPTY for all 22 accounts on the live API, so
 * their item shape is genuinely unknown — nothing has ever been suspended,
 * restricted, or audited yet. Rather than invent fields, these schemas accept
 * any object and the UI renders only the keys it actually finds, falling back
 * to an explicit "shape not yet confirmed" note.
 *
 * Replace these with strict schemas as soon as the backend produces one real
 * record; until then a strict schema would fail on first contact with data.
 */
export const looseRecordSchema = z.looseObject({})
export type LooseRecord = z.infer<typeof looseRecordSchema>

export const userIdentitySchema = z.object({
  id: idSchema,
  displayName: z.string(),
  username: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  phone: z.string().nullable(),
  phoneMasked: z.string().nullable(),
  email: z.string().nullable(),
  role: userRoleSchema,
  status: accountStatusValueSchema,
  accountType: accountTypeSchema,
  isHost: z.boolean(),
  activeRestrictionsCount: z.int().nonnegative(),
  createdAt: isoDateTime,
  lastActiveAt: isoDateTime.nullable(),
})
export type UserIdentity = z.infer<typeof userIdentitySchema>

/**
 * `GET /admin/users/:id`, grouped exactly as the API returns it.
 *
 * plan.md §10.3: these groups map 1:1 onto the Phase 3B tabs, so the detail
 * screen binds straight to them with no client-side reshaping.
 */
export const userDetailSchema = z.object({
  identity: userIdentitySchema,

  overview: z.object({
    bio: z.string().nullable(),
    gender: z.string().nullable(),
    dateOfBirth: isoDateTime.nullable(),
    country: z.string().nullable(),
    timezone: z.string().nullable(),
    language: z.string().nullable(),
    isOnline: z.boolean(),
    lastSeenAt: isoDateTime.nullable(),
    emailVerified: z.boolean(),
    phoneVerified: z.boolean(),
    isProfileSetupComplete: z.boolean(),
    businessDetails: z.unknown().nullable(),
    businessProfile: z.unknown().nullable(),
    socialStats: z.object({
      totalContacts: z.int().nonnegative(),
      totalGroups: z.int().nonnegative(),
      totalCommunities: z.int().nonnegative(),
      totalCallsInitiated: z.int().nonnegative(),
      totalCallsReceived: z.int().nonnegative(),
    }),
  }),

  accessAndRestrictions: z.object({
    currentStatus: accountStatusValueSchema,
    /*
     * Loose on purpose — see `looseRecordSchema`. No live record exists to
     * verify `capabilityRestrictionSchema` against, and a strict schema that
     * has never seen real data is a guess that fails at the worst moment.
     */
    activeRestrictions: z.array(looseRecordSchema),
    restrictionHistory: z.array(looseRecordSchema),
    suspensionHistory: z.array(looseRecordSchema),
  }),

  sessionsAndDevices: z.object({
    totalActiveSessions: z.int().nonnegative(),
    sessions: z.array(userSessionSchema),
    deviceTokens: z.array(deviceTokenSchema),
  }),

  /**
   * Counts only — there is no reports endpoint yet (plan.md §10.4). Phase 3B
   * renders these with an explicit "detail arrives in Phase 6" state rather
   * than pretending a drill-down exists.
   */
  safety: z.object({
    blocksSentCount: z.int().nonnegative(),
    blocksReceivedCount: z.int().nonnegative(),
    reportsSubmittedCount: z.int().nonnegative(),
    reportsAgainstCount: z.int().nonnegative(),
    suspensionsCount: z.int().nonnegative(),
  }),

  /** Read-only. plan.md §3.2: no mutation path exists from this module. */
  finance: z.object({
    availableDiamonds: diamondAmount,
    lockedDiamonds: diamondAmount,
    totalPurchased: diamondAmount,
    totalGiftsSent: diamondAmount,
    totalGiftsReceived: diamondAmount,
  }),

  auditHistory: z.object({
    recentActivityLogs: z.array(looseRecordSchema),
  }),
})
export type UserDetail = z.infer<typeof userDetailSchema>

/* -------------------------------------------------------------------------
 * Admin identity
 * ---------------------------------------------------------------------- */

/**
 * plan.md §10.1 — the platform role enum, verified. This replaces the
 * previously assumed `OPERATIONS_ADMIN`, which does not exist; the real
 * mid-tier role is `ADMIN`.
 */
export const adminRoleSchema = z.enum(['SUPER_ADMIN', 'ADMIN', 'MODERATOR'])
export type AdminRole = z.infer<typeof adminRoleSchema>

export const ADMIN_ROLE_LABELS: Readonly<Record<AdminRole, string>> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  MODERATOR: 'Moderator',
}

/**
 * Response of `GET /admin/auth/me` — the session bootstrap.
 *
 * ⚠️ The live API returns **no `permissions[]`** today (plan.md §10.1 / 3A′ #1),
 * so the panel derives an effective set from `role` via the interim map in
 * `auth/permissions.ts` — a documented deviation from
 * `doc/RBAC, Security, and Privacy.md:52`.
 *
 * The field is declared optional here on purpose: the moment the backend
 * starts sending it, `AuthProvider` uses it and the role map stops being
 * consulted, with no further change. Building the client to accept the correct
 * shape ahead of time is what makes that a zero-effort switch rather than a
 * migration.
 */
export const currentAdminSchema = z.object({
  id: idSchema,
  email: z.string(),
  phone: z.string().nullish(),
  phoneMasked: z.string().nullish(),
  role: adminRoleSchema,
  /*
   * Tolerant for a sharper reason than the others: this is the signed-in
   * admin's own record. A status the enum did not know would fail
   * `/admin/auth/me` and lock the operator out of the console over a badge.
   */
  status: accountStatusValueSchema,
  accountType: accountTypeSchema.optional(),
  profile: z
    .object({
      displayName: z.string().nullable(),
      username: z.string().nullable(),
      avatarUrl: z.string().nullable(),
    })
    .optional(),
  createdAt: isoDateTime.optional(),
  isProfileSetupComplete: z.boolean().optional(),
  /** Effective permission set. Absent today — see the note above. */
  permissions: z.array(z.string()).optional(),
})
export type CurrentAdmin = z.infer<typeof currentAdminSchema>

/** Display name for an admin, falling back through the shapes the API allows. */
export function adminDisplayName(admin: CurrentAdmin): string {
  return admin.profile?.displayName ?? admin.profile?.username ?? admin.email
}

/** `POST /admin/auth/login` response. */
export const loginResponseSchema = z.object({
  user: currentAdminSchema,
  tokens: z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresIn: z.string(),
  }),
})
export type LoginResponse = z.infer<typeof loginResponseSchema>

/*
 * `adminUserSchema` and `roleSchema` were removed on 2026-09-03.
 *
 * Both were speculative placeholders for plan.md §10B, written before the
 * endpoints existed and never referenced. When the real API shipped they were
 * wrong in two different ways:
 *
 * - `adminUserSchema` was missing `username`, `phone`, `adminPermissions` and
 *   `activeSessionsCount` — four of the nine fields a staff record actually
 *   carries, including the one the whole module exists to edit. The verified
 *   shape is `staffMemberSchema` in `types/staff.ts`.
 * - `roleSchema` modelled a role with its own permission list. No such object
 *   exists: the backend has two fixed staff roles, and permissions are granted
 *   per account as a flat array of eight module keys, independent of role.
 *
 * A schema nobody imports is not harmless — it is a description of the API
 * that nothing keeps honest, and the next person to need one would have
 * started from it.
 */
