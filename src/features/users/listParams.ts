import type { SortOrder } from '@/types/common'

/**
 * The user-directory query.
 *
 * ⚠️ Every key here is a filter **verified to actually work** against the live
 * API (plan.md §10.4). That verification mattered: the API returns 200 for
 * unknown query parameters instead of rejecting them, so four filters the
 * Phase 3 spec calls for — registration date range, restriction type, Host
 * flag, and `q` — look functional but silently return unfiltered results.
 *
 * They are therefore deliberately absent rather than wired up to a control
 * that would lie to the operator. `UNSUPPORTED_FILTERS` documents them, the
 * UI explains the gap, and 3A′ #2 tracks the fix.
 */
export interface UserListParams {
  readonly page: number
  readonly limit: number
  readonly sortBy: string
  readonly sortOrder: SortOrder
  readonly search?: string | undefined
  readonly status?: string | undefined
  readonly role?: string | undefined
  readonly accountType?: string | undefined
  readonly hasRestrictions?: string | undefined
  readonly [key: string]: string | number | boolean | undefined
}

/**
 * Filters the Phase 3 spec requires that the backend does not implement.
 *
 * Kept as data so the UI can render one honest, self-updating notice instead
 * of a hard-coded sentence that drifts as the backend catches up. Delete an
 * entry the day its endpoint support lands.
 */
export const UNSUPPORTED_FILTERS: readonly { label: string; note: string }[] = [
  {
    label: 'Registration date range',
    note: 'the API ignores every date parameter it accepts',
  },
  { label: 'Restriction type', note: 'not implemented server-side' },
  { label: 'Host', note: 'returns no results for either value' },
]

/** Server default is `createdAt` descending — newest accounts first. */
export const DEFAULT_SORT_BY = 'createdAt'
export const DEFAULT_SORT_ORDER: SortOrder = 'desc'

/**
 * The API's own `sortBy` allowlist, taken verbatim from its rejection message
 * for an unknown field. Unlike the filter parameters, `sortBy` IS validated —
 * an unknown value returns 400 rather than being ignored — so this list is
 * authoritative and a drift would surface immediately instead of silently.
 */
export const SORTABLE_FIELDS: readonly string[] = [
  'createdAt',
  'displayName',
  'status',
  'lastActiveAt',
]
