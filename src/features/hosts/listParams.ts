import {
  HOST_APPLICATION_STATUSES,
  HOST_NICHES,
  MAX_LIST_LIMIT,
  type HostApplicationStatus,
  type HostNiche,
} from '@/types/hosts'

/**
 * The host-applications query (plan.md §2.2, phase H4).
 *
 * Three facts about this endpoint shape the whole file, and each was measured
 * rather than assumed:
 *
 * 1. **`status` is case-SENSITIVE.** `?status=pending` answers
 *    `400 querystring/status Invalid enum value`. The bootstrap module's enums
 *    accept four spellings each and taught the opposite reflex; nothing here
 *    may lower-case a status on its way out.
 * 2. **`niche` is not validated at all.** `?niche=GARBAGE` answers `200` and
 *    returns the wrong set rather than an error (plan.md §3.2). The panel
 *    therefore offers a closed select — the server will not catch a typo, so
 *    the control has to.
 * 3. **There is no sort.** The query schema takes none, and this backend
 *    silently drops unknown parameters rather than rejecting them, so a sort
 *    control would appear to work and reorder nothing. No column carries one.
 *
 * ⚠️ Whether an omitted `status` returns every status is **unverified**
 * (plan.md O1): the live table holds zero rows, so "absent filter means no
 * filter" is read off the query schema rather than off behaviour. If the
 * service turns out to narrow silently the way `/admin/verifications` does,
 * `ANY` becomes a value that must be *sent*, and this file is where that
 * change lands.
 */

/**
 * Filter keys the URL may carry.
 *
 * `page` and `limit` are deliberately absent: "Clear all" resets the filters,
 * not the operator's page size, which is a display preference they set once.
 */
export const FILTER_KEYS = [
  'search',
  'status',
  'niche',
  'startDate',
  'endDate',
] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

/** `querystring/limit Number must be less than or equal to 100`, verified. */
export const MAX_LIMIT = MAX_LIST_LIMIT

/**
 * The sentinel for "no filter on this facet".
 *
 * ⚠️ `'__ANY__'`, not `'ALL'`. The announcements module used `'ALL'` until it
 * collided with a real enum value and made one facet both visually broken and
 * functionally unreachable. Neither enum here contains this string, and nothing
 * should ever choose a sentinel that could.
 */
export const ANY = '__ANY__' as const

export type StatusFilter = HostApplicationStatus | typeof ANY
export type NicheFilter = HostNiche | typeof ANY

export function isStatusFilter(value: string): value is StatusFilter {
  return (
    value === ANY || (HOST_APPLICATION_STATUSES as readonly string[]).includes(value)
  )
}

export function isNicheFilter(value: string): value is NicheFilter {
  return value === ANY || (HOST_NICHES as readonly string[]).includes(value)
}

/**
 * `YYYY-MM-DD`, which the service accepts (`2026-10-13` → 200) and which it
 * rejects when unparseable (`13-10-2026` → `400 Invalid datetime`).
 *
 * ⚠️ Validated here rather than forwarded, for the same reason as the enums: a
 * hand-edited URL must not be able to 400 the whole page. A value that fails
 * this is dropped, and the queue renders unfiltered rather than broken.
 */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return !Number.isNaN(Date.parse(value))
}
