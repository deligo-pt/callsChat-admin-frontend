import { apiClient } from '@/api/client'
import type { ListParams, Paginated } from '@/types/common'
import { staffListResponseSchema, type StaffMember } from '@/types/staff'

/**
 * The staff list, promoted out of `features/staff/api.ts`
 * (feedback_management_plan.md §4.5).
 *
 * It moved for exactly the same reason `fetchSettings` lives here: **two
 * features need it and a feature may not import a sibling feature.**
 * `eslint.config.js` enforces that, and the alternative — a second copy of the
 * call inside `features/feedback/` — would give the staff directory and the
 * feedback assignment control separate cache entries that could disagree about
 * who works here.
 *
 * `features/staff/api.ts` re-exports this unchanged, so the staff module is
 * untouched by the move and every existing import still resolves.
 *
 * ⚠️ This route is `verifySuperAdmin`-guarded and there is **no
 * "assignable staff" endpoint** (§3.11). Today that costs nothing, because
 * only a Super Admin can reach the feedback module at all (§3.1). The moment
 * backend ask #1 lands, an `ADMIN` holding `FEEDBACK_MANAGEMENT` will open the
 * assignment control and get a `403` from *this* call rather than a list of
 * colleagues — which is why `useAssignableStaff` renders that failure inline
 * instead of letting it break the ticket page.
 */

export interface StaffListParams extends ListParams {
  readonly page?: number | undefined
  readonly limit?: number | undefined
  /** `ADMIN` · `MODERATOR` · `ALL`. */
  readonly role?: string | undefined
  /**
   * `ACTIVE` · `SUSPENDED` · `BANNED` · `ALL`.
   *
   * ⚠️ `INACTIVE` is **not** accepted — deleted rows cannot be filtered
   * server-side in either direction (staff_management_plan.md §3.4).
   */
  readonly status?: string | undefined
  /** Undocumented but real: matches display name, username and email. */
  readonly search?: string | undefined
}

/**
 * `GET /admin/staff`.
 *
 * ⚠️ Returns soft-deleted accounts. `DELETE /admin/staff/:id` sets `deletedAt`
 * and the doc claims the row is then "immediately hidden from staff listings";
 * it is not — the `deletedAt` filter is missing from this query, while every
 * mutation *does* filter on it. Callers filter them out client-side.
 */
export function fetchStaffList(
  params: StaffListParams,
  signal?: AbortSignal,
): Promise<Paginated<StaffMember>> {
  return apiClient.get<Paginated<StaffMember>>('/admin/staff', {
    params,
    schema: staffListResponseSchema,
    resource: 'staff',
    ...(signal ? { signal } : {}),
  })
}
