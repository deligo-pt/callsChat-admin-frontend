import { STAFF_LIST_MAX_LIMIT } from '@/types/staff'

/**
 * The staff-directory query.
 *
 * ⚠️ **There is no `sortBy`.** Verified 2026-09-03: `/admin/staff` accepts the
 * parameter and silently ignores it — `?sortBy=bogusfield` returns 200 with
 * the order unchanged, and `?sortBy=displayName&sortOrder=asc` does not
 * reorder anything. `?q=` is ignored the same way; only `search` filters.
 *
 * So no column in this directory is `sortable`. A sort control that reorders
 * nothing is worse than no control: the operator clicks it, the rows do not
 * move, and there is no way to tell that from an already-sorted list. This is
 * the same class of defect `features/users/listParams.ts` documents for the
 * four unsupported user filters, and it gets the same treatment — the control
 * is absent rather than dishonest.
 *
 * Rows arrive `createdAt` descending, newest first. That is a fixed property
 * of the endpoint, not a default the client chose, so the UI states it once
 * rather than pretending to control it.
 */

/** Filter keys the URL may carry, beyond paging. */
export const FILTER_KEYS = ['search', 'role', 'status'] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

/**
 * Hide soft-deleted rows. **Client-side, and on by default.**
 *
 * The server cannot do this: the `status` filter enum is
 * `ACTIVE | SUSPENDED | BANNED | ALL` and rejects `INACTIVE`, so deleted rows
 * can be neither excluded nor isolated (staff_management_plan.md §3.4). Left
 * alone they accumulate in the directory forever, indistinguishable from live
 * accounts except by their badge.
 *
 * It lives in the URL alongside the real filters so a shared link carries it,
 * but it is deliberately **not** in `FILTER_KEYS` — it is not sent to the API,
 * it does not appear as a removable chip, and it must never be counted toward
 * `activeFilterCount`, which drives copy about what the server was asked for.
 */
export const HIDE_DELETED_KEY = 'hideDeleted'

/**
 * Sent to the API. `page` and `limit` are always present; the three filters
 * appear only when set.
 */
export interface StaffQueryParams {
  readonly page: number
  readonly limit: number
  readonly search?: string | undefined
  readonly role?: string | undefined
  readonly status?: string | undefined
  readonly [key: string]: string | number | boolean | undefined
}

/** `querystring/limit Number must be less than or equal to 100`. */
export const MAX_LIMIT = STAFF_LIST_MAX_LIMIT

/**
 * Rows the operator is not currently being shown, and why.
 *
 * Returned rather than logged, because the directory has to *say* how many it
 * hid — a page reporting "6 staff members" while showing four, with no
 * explanation, is the confusing outcome the toggle exists to avoid.
 */
export function partitionDeleted<T extends { status: string }>(
  rows: readonly T[],
  hideDeleted: boolean,
): { readonly visible: readonly T[]; readonly hiddenCount: number } {
  if (!hideDeleted) return { visible: rows, hiddenCount: 0 }

  const visible = rows.filter((row) => row.status !== 'INACTIVE')
  return { visible, hiddenCount: rows.length - visible.length }
}
