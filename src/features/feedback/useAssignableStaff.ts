import { useQuery } from '@tanstack/react-query'

import { fetchStaffList } from '@/api/staff'
import { queryKeys } from '@/api/queryKeys'
import { STAFF_LIST_MAX_LIMIT, type StaffMember } from '@/types/staff'

/**
 * Who a ticket can be assigned to (feedback_management_plan.md §3.11).
 *
 * **Its own hook from day one, and that is the whole point.** There is no
 * "assignable staff" endpoint: the only source of candidates is
 * `GET /admin/staff`, which is `verifySuperAdmin`-guarded. Today that costs
 * nothing, because §3.1 means only a Super Admin can reach this module at all.
 * The moment backend ask #1 lands and `FEEDBACK_MANAGEMENT` becomes grantable,
 * an `ADMIN` opening the assignment control will get a `403` from the staff
 * endpoint instead of a list of colleagues — and the swap to a proper endpoint
 * needs to be one file, not a search through the ticket page.
 *
 * Two filters are applied here rather than at the call site, because both are
 * contract facts rather than presentation choices:
 *
 * - **`ACTIVE` only.** `PATCH /:id/assign` answers `400` for a suspended or
 *   banned staff member (§2.3). Offering one would be offering a failure.
 * - **Soft-deleted rows dropped.** `GET /admin/staff` returns them — the
 *   `deletedAt` filter is missing from that query — while every mutation
 *   filters on it (staff_management_plan.md §3.4). A deleted colleague in this
 *   list would 404 on selection.
 *
 * The status filter is sent *and* re-applied client-side. Not belt-and-braces:
 * the server filter is what keeps the page size honest, and the client filter
 * is what catches `INACTIVE`, which that enum cannot express in either
 * direction.
 */

/** One page is enough: this is a staff table, not a user directory. */
const CANDIDATE_LIMIT = STAFF_LIST_MAX_LIMIT

export function useAssignableStaff() {
  return useQuery({
    queryKey: queryKeys.staff.list({ assignable: true, limit: CANDIDATE_LIMIT }),
    queryFn: async ({ signal }) => {
      const page = await fetchStaffList(
        { limit: CANDIDATE_LIMIT, status: 'ACTIVE' },
        signal,
      )
      return page.data.filter(isAssignable)
    },
    /*
     * ⚠️ `retry: false`. The expected failure here is a `403` — a permanent
     * answer about who the operator is, not a transient one. Retrying it three
     * times only delays the inline message the control renders instead.
     */
    retry: false,
    /*
     * A minute is deliberate, and it is the one place in this module with a
     * non-zero `staleTime`. Everything about a *ticket* is refetched on sight
     * because colleagues work the queue concurrently; the roster of who works
     * here changes on the order of weeks, and refetching it every time a
     * combobox opens would spend a request to learn nothing.
     */
    staleTime: 60_000,
  })
}

/**
 * Exported so the test can assert the rule rather than infer it from a
 * rendered list.
 */
export function isAssignable(member: StaffMember): boolean {
  return member.status === 'ACTIVE'
}
