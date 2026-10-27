import {
  MAX_LIST_LIMIT,
  PAYMENT_METHODS,
  TOP_UP_STATUSES,
  type PaymentMethod,
  type TopUpStatus,
} from '@/types/wallet'

/**
 * The top-up queue's query (plan.md §2.4, phase W2).
 *
 * Three measured facts shape this file:
 *
 * 1. **`status` and `method` are validated and case-SENSITIVE.**
 *    `?status=pending` and `?method=bkash` are both `400`. A hand-edited URL
 *    must not be able to 400 the whole page, so an unrecognised value is
 *    dropped here and the queue renders unfiltered rather than broken.
 * 2. **`startDate` and `endDate` are NOT validated** — `?startDate=hello`
 *    answers `200` (plan.md O6). This is the opposite of the host route, which
 *    rejects `13-10-2026` with `Invalid datetime`, and it is worse: a mistyped
 *    date produces a **silently wrong set** instead of an error. The operator
 *    sees a shorter list and nothing tells them why. So the validation that
 *    the server declines to do happens here, and it is the only reason this
 *    module has a date guard at all.
 * 3. **There is no sort.** The query schema takes none and the backend drops
 *    unknown parameters silently, so a sort control would appear to work and
 *    reorder nothing. No column carries one.
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
  'method',
  'startDate',
  'endDate',
] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

/** `querystring/limit Number must be less than or equal to 100`, measured. */
export const MAX_LIMIT = MAX_LIST_LIMIT

/**
 * The sentinel for "no filter on this facet".
 *
 * ⚠️ `'__ANY__'`, and the same string the host module uses. The announcements
 * module used `'ALL'` until it collided with a real enum value and made one
 * facet both visually broken and functionally unreachable. Neither enum here
 * contains this string.
 */
export const ANY = '__ANY__' as const

export type StatusFilter = TopUpStatus | typeof ANY
export type MethodFilter = PaymentMethod | typeof ANY

export function isStatusFilter(value: string): value is StatusFilter {
  return value === ANY || (TOP_UP_STATUSES as readonly string[]).includes(value)
}

export function isMethodFilter(value: string): value is MethodFilter {
  return value === ANY || (PAYMENT_METHODS as readonly string[]).includes(value)
}

/**
 * `YYYY-MM-DD`.
 *
 * ⚠️ **The server accepts anything**, including `hello`, and filters on it.
 * This is the whole guard: a value that fails here never reaches the query
 * string, so a typo shows the unfiltered queue rather than a plausible,
 * shorter, wrong one.
 *
 * `Date.parse` alone is not enough — it accepts `2026-13-45` in some engines
 * and a bare `hello` in none, but it also accepts `2026` and `Oct 27 2026`,
 * neither of which is what the input produces or what the server expects.
 */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return false

  /*
   * ⚠️ `Date.parse('2026-02-31')` is NOT NaN in V8 — it rolls over to March 3.
   * A date that rolls over is a typo, and forwarding it would filter on a day
   * the operator did not choose.
   */
  return new Date(timestamp).toISOString().startsWith(value)
}
