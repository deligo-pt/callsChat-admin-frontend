import { apiClient } from '@/api/client'
import {
  staffAcknowledgementSchema,
  staffMemberResponseSchema,
  type CreateStaffPayload,
  type ModulePermission,
  type StaffMember,
  type StaffRole,
  type UpdateStaffStatusPayload,
} from '@/types/staff'
import type { z } from 'zod'

/**
 * Staff & Access Control API (staff_management_plan.md §2.1).
 *
 * All eight routes sit behind `[fastify.authenticate, verifySuperAdmin]`. An
 * `ADMIN` or `MODERATOR` receives `403 "Access Denied: Requires SUPER_ADMIN
 * privileges"` from every one of them — a different message from the
 * module-permission 403 raised elsewhere, and rendered differently
 * (staff_management_plan.md §5.7).
 *
 * Three rules hold across this file:
 *
 * 1. **A body is mandatory on every PATCH.** These are Fastify + Zod routes,
 *    so a bodyless request arrives as `request.body === null` and is rejected
 *    with `400 body/ Expected object, received null`. This is the sixth route
 *    family on this backend with that trap.
 * 2. **Every response is contract-validated.** This module's payload *is* the
 *    panel's access control; a silently-changed `adminPermissions` shape must
 *    surface as an error, never as an empty grid that then saves the emptiness
 *    back.
 * 3. **No mutation response may seed the cache.** They echo pre-revocation
 *    session counts (staff_management_plan.md §3.7). Callers invalidate.
 */

/* -------------------------------------------------------------------------
 * Reads
 * ---------------------------------------------------------------------- */

/*
 * `StaffListParams` and `fetchStaffList` now live in `api/staff.ts` and are
 * re-exported here unchanged.
 *
 * They moved because `features/feedback/` needs the staff list to populate its
 * assignment control, and a feature may not import a sibling feature
 * (`eslint.config.js`; feedback_management_plan.md §4.5). Nothing about the
 * call changed, and every existing import of it still resolves through this
 * module.
 */
export { fetchStaffList, type StaffListParams } from '@/api/staff'

/**
 * `GET /admin/staff/:id`.
 *
 * Returns exactly the same shape as a list row — there is no richer detail
 * payload, no sessions array and no status history. A Super Admin's id answers
 * `404`: they are invisible to this module rather than merely protected within
 * it. A soft-deleted id answers `200` (see above).
 */
export function fetchStaffMember(
  id: string,
  signal?: AbortSignal,
): Promise<StaffMember> {
  return apiClient
    .get<z.infer<typeof staffMemberResponseSchema>>(`/admin/staff/${id}`, {
      schema: staffMemberResponseSchema,
      resource: 'staff-member',
      ...(signal ? { signal } : {}),
    })
    .then((response) => response.data)
}

/* -------------------------------------------------------------------------
 * Writes
 * ---------------------------------------------------------------------- */

/**
 * `POST /admin/staff` → `201`.
 *
 * `phone` and `permissions` are omitted rather than sent empty. The API does
 * not validate phone format at all — `"nonsense"` is accepted — so sending
 * `""` would store an empty string as somebody's phone number rather than
 * recording that they have none.
 *
 * An empty permission array *is* sent when explicitly chosen: an account with
 * no access is a valid, deliberate outcome (denied by default, plan.md §8),
 * not an omission.
 */
export function createStaffMember(payload: CreateStaffPayload): Promise<StaffMember> {
  const body: Record<string, unknown> = {
    email: payload.email,
    password: payload.password,
    displayName: payload.displayName,
    role: payload.role,
  }
  if (payload.permissions) body['permissions'] = [...payload.permissions]
  if (payload.phone && payload.phone.trim() !== '') body['phone'] = payload.phone.trim()

  return apiClient
    .post<z.infer<typeof staffMemberResponseSchema>>('/admin/staff', {
      body,
      schema: staffMemberResponseSchema,
      resource: 'staff-create',
    })
    .then((response) => response.data)
}

/**
 * `PATCH /admin/staff/:id/permissions`.
 *
 * ⚠️ **This replaces the whole set — it does not merge.** Verified: an account
 * holding `["USER_VIEW"]` sent `["DASHBOARD_VIEW","USER_MODERATE"]` came back
 * holding exactly those two, with `USER_VIEW` gone.
 *
 * So `permissions` must always be the operator's **complete** intended set,
 * read off the whole grid. Passing only the boxes that changed silently
 * revokes everything else — the same replace-not-merge trap as
 * `deployment/app-versions` (system_settings_plan.md §3.3).
 */
export function updateStaffPermissions(
  id: string,
  permissions: readonly ModulePermission[],
): Promise<StaffMember> {
  return apiClient
    .patch<z.infer<typeof staffMemberResponseSchema>>(
      `/admin/staff/${id}/permissions`,
      {
        body: { permissions: [...permissions] },
        schema: staffMemberResponseSchema,
        resource: 'staff-permissions',
      },
    )
    .then((response) => response.data)
}

/**
 * `PATCH /admin/staff/:id/status`.
 *
 * Suspending or banning terminates every session for that account across every
 * device, immediately — the next request they make answers `401 "All active
 * sessions have been revoked. Please log in again."`, and they cannot sign
 * back in. Reactivating restores the ability to sign in; it does **not**
 * restore the old sessions.
 *
 * `reason` is optional to the server and mandatory to the panel
 * (staff_management_plan.md §3.6). It is also write-only: no endpoint reads it
 * back, and the record carries no `statusReason` field.
 *
 * ⚠️ The returned record's `activeSessionsCount` and `lastActiveAt` are the
 * values from *before* revocation. Callers invalidate and refetch.
 */
export function updateStaffStatus(
  id: string,
  payload: UpdateStaffStatusPayload,
): Promise<StaffMember> {
  const body: Record<string, unknown> = { status: payload.status }
  if (payload.reason && payload.reason.trim() !== '') {
    body['reason'] = payload.reason.trim()
  }

  return apiClient
    .patch<z.infer<typeof staffMemberResponseSchema>>(`/admin/staff/${id}/status`, {
      body,
      schema: staffMemberResponseSchema,
      resource: 'staff-status',
    })
    .then((response) => response.data)
}

/**
 * `PATCH /admin/staff/:id/role`.
 *
 * Promote or demote between `ADMIN` and `MODERATOR`. Verified: **permissions
 * are unchanged** by a role change — the probe account kept both of its keys
 * across a promotion. Role and module permissions are independent axes on this
 * backend, and the confirm copy has to say so.
 *
 * This endpoint accepts no `reason` field.
 */
export function updateStaffRole(id: string, role: StaffRole): Promise<StaffMember> {
  return apiClient
    .patch<z.infer<typeof staffMemberResponseSchema>>(`/admin/staff/${id}/role`, {
      body: { role },
      schema: staffMemberResponseSchema,
      resource: 'staff-role',
    })
    .then((response) => response.data)
}

/**
 * `PATCH /admin/staff/:id/reset-password`.
 *
 * Sets the password outright and terminates every session. There is no invite
 * email, no reset link, no temporary-password flag and no forced change on
 * next login — the Super Admin is the only delivery channel, and the UI says
 * so plainly (staff_management_plan.md §3.5).
 *
 * Returns **no record**: `{ success, message }` only. The one endpoint in this
 * module with a bare envelope.
 *
 * The server's whole rule is length ≥ 8. The panel sends something far
 * stronger; `STAFF_PASSWORD_MIN_LENGTH` records the floor, not the policy.
 */
export function resetStaffPassword(id: string, newPassword: string): Promise<void> {
  return apiClient
    .patch<z.infer<typeof staffAcknowledgementSchema>>(
      `/admin/staff/${id}/reset-password`,
      {
        body: { newPassword },
        schema: staffAcknowledgementSchema,
        resource: 'staff-reset-password',
      },
    )
    .then(() => undefined)
}

/**
 * `DELETE /admin/staff/:id`.
 *
 * Soft delete: sets `deletedAt`, flips `status` to `INACTIVE`, purges sessions
 * and blocks sign-in (`401 "Invalid credentials. No admin account found."`).
 *
 * ⚠️ **One-way door.** There is no un-delete route, and `PATCH /:id/status` on
 * a deleted account answers `404` — so it cannot be reactivated back into
 * existence either. The row also stays in the directory (§3.4), which is the
 * one thing the confirm dialog must set expectations about.
 *
 * The Postman collection documents this as a `PATCH` to a bare
 * `/admin/staff/:id`; that route does not exist and answers `ROUTE_NOT_FOUND`.
 * `DELETE` is correct, verified live.
 */
export function deleteStaffMember(id: string): Promise<void> {
  return apiClient
    .delete<z.infer<typeof staffAcknowledgementSchema>>(`/admin/staff/${id}`, {
      schema: staffAcknowledgementSchema,
      resource: 'staff-delete',
    })
    .then(() => undefined)
}
