import { z } from 'zod'

import {
  FEEDBACK_LIST_MAX_LIMIT,
  FEEDBACK_PRIORITY_VALUES,
  FEEDBACK_SORT_FIELDS,
  FEEDBACK_STATUS_VALUES,
  FEEDBACK_TYPE_VALUES,
} from '@/types/feedback'
import type { SortOrder } from '@/types/common'

/**
 * The feedback-queue query (feedback_management_plan.md §2.4).
 *
 * Unlike the staff directory, **this endpoint's `sortBy` is real**: it is
 * validated against a four-value allowlist and the rows actually reorder,
 * verified live 2026-09-06 in both directions on `priority` and `createdAt`.
 * So the queue offers sort controls, and `staffColumns`' "no column is
 * sortable" note does not apply here.
 *
 * Two things about this query are hostile and are handled below rather than at
 * the call site:
 *
 * 1. **`fromDate` and `toDate` are not validated server-side.** `?fromDate=
 *    notadate` answers `200` with the filter silently dropped (§3.7) — a `200`
 *    is never proof a filter was applied. Every date is therefore re-validated
 *    here before it can reach the query key, and a value that fails is removed
 *    from the URL rather than sent.
 * 2. **`assignedAdminId` has no "unassigned" value.** `null` is compared as
 *    the literal string and matches nothing (§3.6), so the queue does not
 *    offer that filter at all. An "Unassigned" option that silently returned
 *    an empty page would be worse than its absence.
 */

/**
 * Filter keys the URL may carry, beyond paging, sorting and the date range.
 *
 * Each one is an enum the API validates strictly, so a hand-edited URL that
 * carries garbage would 400 the whole page — hence {@link sanitiseFilters}.
 */
export const FILTER_KEYS = ['search', 'status', 'type', 'priority'] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

/**
 * The date range, kept apart from {@link FILTER_KEYS} on purpose.
 *
 * Two URL parameters, but **one control** and one chip: `DateRangePicker`
 * emits a `{ from, to }` pair, and offering two independently removable chips
 * would let an operator clear half a range through a control that cannot
 * express the result.
 */
export const DATE_KEYS = ['fromDate', 'toDate'] as const
export type DateKey = (typeof DATE_KEYS)[number]

/** Sort field default — most urgent first, which is how an inbox is worked. */
export const DEFAULT_SORT_BY = 'priority'
export const DEFAULT_SORT_ORDER: SortOrder = 'desc'

/** `querystring/limit Number must be less than or equal to 100`. */
export const MAX_LIMIT = FEEDBACK_LIST_MAX_LIMIT

/**
 * A calendar day, `yyyy-MM-dd`.
 *
 * Deliberately day-granular rather than a full timestamp: the picker selects
 * days, the URL stays readable and shareable, and `z.iso.date()` rejects both
 * `2026-13-40` and `yesterday` — the exact value §3.7 says the API would
 * accept and ignore.
 */
export const filterDateSchema = z.iso.date()

/**
 * Is this string safe to send as `fromDate` / `toDate`?
 *
 * The whole mitigation for §3.7 is this function being the only gate between
 * the address bar and the request. It is exported because the test asserts on
 * it directly as well as through the hook.
 */
export function isValidFilterDate(value: string | null | undefined): value is string {
  return filterDateSchema.safeParse(value).success
}

/**
 * The allowlists, as sets, for the URL guard below.
 *
 * Values come from the schema options rather than being retyped, so a backend
 * enum change is a one-place edit and cannot drift between the filter control
 * and the URL guard.
 */
const ALLOWED: Readonly<Record<Exclude<FilterKey, 'search'>, readonly string[]>> = {
  status: FEEDBACK_STATUS_VALUES,
  type: FEEDBACK_TYPE_VALUES,
  priority: FEEDBACK_PRIORITY_VALUES,
}

/**
 * Drop any filter value the API would reject.
 *
 * `status`, `type`, `priority` and `sortBy` are all validated strictly — an
 * unknown value is a `400` listing the legal ones, not a silently ignored
 * parameter. A pasted or hand-edited URL carrying one would therefore take the
 * whole page down with a validation error rather than showing a queue, so a
 * bad value is discarded here and the page renders unfiltered.
 *
 * That is the opposite treatment from the dates above, and for the opposite
 * reason: a bad date is dropped because the API would *accept* it and lie; a
 * bad enum is dropped because the API would *refuse* it and take the page with
 * it.
 */
export function sanitiseFilters(
  raw: Readonly<Partial<Record<FilterKey, string>>>,
): Readonly<Partial<Record<FilterKey, string>>> {
  const result: Partial<Record<FilterKey, string>> = {}

  for (const key of FILTER_KEYS) {
    const value = raw[key]
    if (!value) continue
    if (key === 'search') {
      result.search = value
      continue
    }
    if (ALLOWED[key].includes(value)) result[key] = value
  }

  return result
}

/** The API's `sortBy` allowlist, taken from the schema it is validated against. */
export function isSortableField(field: string): boolean {
  return (FEEDBACK_SORT_FIELDS as readonly string[]).includes(field)
}
