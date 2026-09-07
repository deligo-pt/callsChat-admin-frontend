import { z } from 'zod'

import { idSchema, isoDateTime, paginatedSchema } from './common'

/**
 * Staff & Access Control contract (staff_management_plan.md §2).
 *
 * VERIFIED against `https://api.callschat.com/api/v1` on 2026-09-03 with a
 * `SUPER_ADMIN` token. Every enum below came out of the API's own rejection
 * messages, not out of the doc — where the two disagreed, the live service won
 * (staff_management_plan.md §2.9).
 */

/* -------------------------------------------------------------------------
 * Enums
 * ---------------------------------------------------------------------- */

/**
 * The two roles this module manages.
 *
 * `SUPER_ADMIN` is deliberately absent. `POST /admin/staff` rejects it —
 * `body/role Invalid enum value. Expected 'ADMIN' | 'MODERATOR', received
 * 'SUPER_ADMIN'` — and a Super Admin is invisible to every read here
 * (`GET /admin/staff/:id` on one answers 404). The panel cannot mint, see, or
 * touch a Super Admin, and this type says so.
 */
export const staffRoleSchema = z.enum(['ADMIN', 'MODERATOR'])
export type StaffRole = z.infer<typeof staffRoleSchema>

export const STAFF_ROLE_VALUES = staffRoleSchema.options

/**
 * A staff account's lifecycle state.
 *
 * ⚠️ `INACTIVE` **means deleted**, not dormant (staff_management_plan.md §3.4).
 * `DELETE /admin/staff/:id` sets `deletedAt` and `status = 'INACTIVE'`, and
 * despite the doc's claim the row stays visible in `GET /admin/staff`. Every
 * mutation against it then answers 404. The `staff` domain in `lib/status.ts`
 * labels it "Deleted" for exactly this reason — reusing the consumer-user map,
 * which renders it as a neutral "Inactive", would describe a state the account
 * is not in.
 */
export const staffStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'INACTIVE'])
export type StaffStatus = z.infer<typeof staffStatusSchema>

/**
 * Statuses `PATCH /admin/staff/:id/status` will *set*.
 *
 * `INACTIVE` is not settable — it is reached only through `DELETE`, and there
 * is no route back out. Verified: the endpoint rejects anything else with
 * `body/status Invalid enum value. Expected 'ACTIVE' | 'SUSPENDED' | 'BANNED'`.
 */
export const settableStaffStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'BANNED'])
export type SettableStaffStatus = z.infer<typeof settableStaffStatusSchema>

export const SETTABLE_STAFF_STATUS_VALUES = settableStaffStatusSchema.options

/**
 * The eight module permission keys the backend grants.
 *
 * **Strict on purpose.** `types/identity.ts` deliberately tolerates an
 * unrecognised consumer-user *status*, because a status is a display-only
 * label and one unknown value once blanked the entire user directory. That
 * reasoning explicitly stops at permissions: an unrecognised permission key
 * must fail loudly rather than be rendered, because silently dropping one from
 * the grid would make a Super Admin believe they had revoked access they had
 * not (staff_management_plan.md §8 R5).
 */
export const modulePermissionSchema = z.enum([
  'DASHBOARD_VIEW',
  'USER_VIEW',
  'USER_MODERATE',
  'BUSINESS_VERIFY',
  'SYSTEM_SETTINGS_EDIT',
  'DEPLOYMENT_EDIT',
  'DATABASE_BACKUP',
  'SMS_GATEWAY_EDIT',
])
export type ModulePermission = z.infer<typeof modulePermissionSchema>

export const MODULE_PERMISSION_VALUES = modulePermissionSchema.options

/* -------------------------------------------------------------------------
 * The staff record
 * ---------------------------------------------------------------------- */

/**
 * One staff member, as returned by endpoints 1–6 (staff_management_plan.md
 * §2.2).
 *
 * There is **no richer detail shape**: `GET /admin/staff/:id` returns exactly
 * what a list row returns — no sessions array, no moderation history, no
 * status reason. So this one schema serves the directory, the detail page and
 * every mutation response, and the detail page must not promise fields that
 * do not exist.
 */
export const staffMemberSchema = z.object({
  id: idSchema,
  displayName: z.string(),
  /** Server-generated `staff_<local-part>_<4 random>`. Not settable, not editable. */
  username: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  role: staffRoleSchema,
  status: staffStatusSchema,
  adminPermissions: z.array(modulePermissionSchema),
  /**
   * ⚠️ Stale by one revocation on a mutation response
   * (staff_management_plan.md §3.7). Suspending an account returns the count
   * from *before* its sessions were destroyed — the live value arrives only on
   * a refetch. Never seed the cache from a mutation response.
   */
  activeSessionsCount: z.int().nonnegative(),
  createdAt: isoDateTime,
  lastActiveAt: isoDateTime.nullable(),
})
export type StaffMember = z.infer<typeof staffMemberSchema>

/* -------------------------------------------------------------------------
 * Response envelopes
 * ---------------------------------------------------------------------- */

/** `GET /admin/staff` — the project-standard `{ success, data[], pagination }`. */
export const staffListResponseSchema = paginatedSchema(staffMemberSchema)

/**
 * The five endpoints that answer with a full record.
 *
 * `message` is present on the four mutations and absent on `GET /:id`, so it
 * is optional here rather than modelled twice.
 *
 * The written doc shows trimmed payloads for `/permissions` and `/role`; live,
 * both return the whole record (staff_management_plan.md §2.9).
 */
export const staffMemberResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: staffMemberSchema,
})

/**
 * `PATCH /:id/reset-password` and `DELETE /:id` — the two endpoints with **no
 * `data`**. Modelled separately so a caller cannot read a record off a
 * response that never carries one.
 */
export const staffAcknowledgementSchema = z.object({
  success: z.literal(true),
  message: z.string(),
})

/* -------------------------------------------------------------------------
 * Request shapes
 * ---------------------------------------------------------------------- */

/**
 * Filters accepted by `GET /admin/staff`.
 *
 * `ALL` is a filter value, not a state a record can be in, so it lives here
 * rather than widening the enums above — the same split `types/identity.ts`
 * makes for consumer users.
 *
 * ⚠️ Note what is **missing**: `INACTIVE`. The status filter accepts
 * `ACTIVE | SUSPENDED | BANNED | ALL` and nothing else, so deleted rows can be
 * neither excluded nor isolated server-side. That is why the directory carries
 * a client-side "Hide deleted" toggle (staff_management_plan.md §3.4 / §5.3).
 */
export const staffRoleFilterSchema = z.enum(['ADMIN', 'MODERATOR', 'ALL'])
export type StaffRoleFilter = z.infer<typeof staffRoleFilterSchema>

export const staffStatusFilterSchema = z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'ALL'])
export type StaffStatusFilter = z.infer<typeof staffStatusFilterSchema>

/** `POST /admin/staff` (staff_management_plan.md §2.3). */
export interface CreateStaffPayload {
  readonly email: string
  readonly password: string
  readonly displayName: string
  readonly role: StaffRole
  /** Omitted entirely when empty — see `api.ts`. `[]` is also valid. */
  readonly permissions?: readonly ModulePermission[]
  /** Optional. ⚠️ The API does not validate the format — `"nonsense"` passes. */
  readonly phone?: string
}

/** `PATCH /admin/staff/:id/status`. */
export interface UpdateStaffStatusPayload {
  readonly status: SettableStaffStatus
  /**
   * Optional **server-side** — `{"status":"BANNED"}` alone returns 200.
   * `plan.md` §10B requires one, so the client enforces it
   * (staff_management_plan.md §3.6). It is write-only: nothing reads it back.
   */
  readonly reason?: string
}

/* -------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */

/**
 * The server's entire password rule: length ≥ 8. No case, digit or symbol
 * requirement — `"password"` is accepted.
 *
 * The panel deliberately holds a stricter line via
 * `features/auth/passwordPolicy.ts` (8 + upper + lower + digit), exactly as it
 * does for the operator's own password. This constant records what the server
 * will *tolerate*, not what the panel will *send*.
 */
export const STAFF_PASSWORD_MIN_LENGTH = 8

/** `querystring/limit Number must be less than or equal to 100`. */
export const STAFF_LIST_MAX_LIMIT = 100

/** `querystring/page Number must be greater than or equal to 1`. */
export const STAFF_LIST_MIN_PAGE = 1
