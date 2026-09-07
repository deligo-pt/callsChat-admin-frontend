import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { queryKeys } from '@/api/queryKeys'

import {
  createStaffMember,
  deleteStaffMember,
  fetchStaffMember,
  fetchStaffList,
  resetStaffPassword,
  updateStaffPermissions,
  updateStaffRole,
  updateStaffStatus,
} from './api'
import type { StaffQueryParams } from './listParams'
import type {
  ModulePermission,
  StaffRole,
  UpdateStaffStatusPayload,
} from '@/types/staff'

/**
 * The staff directory query.
 *
 * `keepPreviousData` keeps the current page on screen while the next one
 * loads. Without it, paging or changing a filter blanks the table to a
 * skeleton, which reads as a broken page rather than a loading one.
 *
 * ⚠️ No `staleTime`. Every mutation in this module revokes sessions, and
 * `activeSessionsCount` is the field an operator is most likely to be checking
 * — a cached value here is a wrong answer to "is this person still signed in?"
 * (staff_management_plan.md §3.7).
 */
export function useStaffListQuery(params: StaffQueryParams) {
  return useQuery({
    queryKey: queryKeys.staff.list(params),
    queryFn: ({ signal }) => fetchStaffList(params, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
}

/**
 * Provision a staff member — `POST /admin/staff`.
 *
 * `retry: false`, because this is not idempotent: a retried create that
 * actually succeeded the first time would provision a second colleague, and
 * the API has no idempotency key on this route.
 *
 * The new record is **not** seeded into the detail cache from the response.
 * Every read in this module goes back to the server (§3.7), and a create is no
 * different: the row the directory shows must be the row the server holds,
 * including the `username` it generated and the permissions it actually
 * recorded.
 */
export function useCreateStaffMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createStaffMember,
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.staff.all })
    },
  })
}

/**
 * One staff member — `GET /admin/staff/:id`.
 *
 * Same `staleTime: 0` as the list, for the same reason: `activeSessionsCount`
 * is the field an operator checks after a suspension, and a cached value there
 * is a wrong answer to "is this person still signed in?" (§3.7).
 *
 * ⚠️ A soft-deleted record answers **200**, not 404 — the backend does not
 * filter `deletedAt` from its reads (§3.4). The page has to recognise that
 * state itself; the query cannot.
 */
export function useStaffMemberQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.staff.detail(id),
    queryFn: ({ signal }) => fetchStaffMember(id, signal),
    staleTime: 0,
    retry: false,
  })
}

/**
 * Replace a staff member's permission set — `PATCH /:id/permissions`.
 *
 * The caller passes the **complete** intended set, never a delta (§3.3).
 *
 * Invalidates rather than seeding from the response, so the grid re-reads what
 * the server actually recorded. That is not paranoia about this endpoint in
 * particular — it is the module-wide rule (§3.7), and the one place it was
 * relaxed is the place a stale count would appear.
 */
export function useUpdatePermissionsMutation(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (permissions: readonly ModulePermission[]) =>
      updateStaffPermissions(id, permissions),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.staff.all })
    },
  })
}

/* -------------------------------------------------------------------------
 * Lifecycle (A4)
 *
 * All four share one shape, and it is the shape §3.7 demands: `retry: false`,
 * and `invalidateQueries` on the staff root with **nothing seeded from the
 * response**.
 *
 * That is not boilerplate caution. Three of these revoke every session the
 * account holds, and the record they return carries the `activeSessionsCount`
 * from *before* the revocation. Seeding the cache from it would leave the
 * directory showing live sessions on an account whose sessions were just
 * destroyed — precisely the fact the operator is checking.
 * ---------------------------------------------------------------------- */

function useStaffLifecycleMutation<TInput>(
  id: string,
  mutationFn: (input: TInput) => Promise<unknown>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.staff.all })
    },
    // `id` is not read here; it is in the deps so a remounted page gets a fresh
    // mutation rather than one still holding the previous member's state.
    mutationKey: [...queryKeys.staff.detail(id), 'lifecycle'],
  })
}

/** Suspend, ban or reactivate — `PATCH /:id/status`. */
export function useStaffStatusMutation(id: string) {
  return useStaffLifecycleMutation(id, (payload: UpdateStaffStatusPayload) =>
    updateStaffStatus(id, payload),
  )
}

/** Promote or demote — `PATCH /:id/role`. Permissions are untouched. */
export function useStaffRoleMutation(id: string) {
  return useStaffLifecycleMutation(id, (role: StaffRole) => updateStaffRole(id, role))
}

/** Set a new password and end every session — `PATCH /:id/reset-password`. */
export function useResetStaffPasswordMutation(id: string) {
  return useStaffLifecycleMutation(id, (newPassword: string) =>
    resetStaffPassword(id, newPassword),
  )
}

/** Soft delete — `DELETE /:id`. One-way: there is no un-delete route. */
export function useDeleteStaffMutation(id: string) {
  return useStaffLifecycleMutation(id, () => deleteStaffMember(id))
}
