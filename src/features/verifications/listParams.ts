import {
  DEFAULT_VERIFICATION_STATUS_FILTER,
  VERIFICATION_LIST_MAX_LIMIT,
  VERIFICATION_STATUS_VALUES,
  VERIFICATION_TARGET_TYPE_VALUES,
  type VerificationStatusFilter,
  type VerificationTargetTypeFilter,
} from '@/types/verification'

/**
 * The verification-queue query (plan.md §2.5).
 *
 * Two things set this apart from every other list in the panel, and both come
 * from §3 rather than from taste.
 *
 * 1. **`status` is never absent.** Omitting it does not mean "everything": the
 *    service filters to the pending applications and returned 3 of 5 live rows
 *    (§3.8). So `ALL` is a real value that is *sent*, not the absence of a
 *    parameter — the opposite of the feedback queue, where clearing a filter
 *    means deleting the key.
 * 2. **There is no sort.** The endpoint accepts no `sortBy`, so no column
 *    carries a control. A header that reorders nothing is indistinguishable
 *    from an already-sorted list, which is the lesson the staff directory
 *    learned the hard way.
 *
 * There is no date filter either: the route takes none. Offering one that
 * silently did nothing would repeat the feedback module's §3.7 trap by choice.
 */

/**
 * Filter keys the URL may carry.
 *
 * `status` is here despite never being absent from the *request*, because it
 * can be absent from the *URL* — a bare `/verifications` means the default.
 */
export const FILTER_KEYS = ['search', 'status', 'targetType'] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

/** `querystring/limit Number must be less than or equal to 100`, verified. */
export const MAX_LIMIT = VERIFICATION_LIST_MAX_LIMIT

/**
 * The status the queue opens on.
 *
 * `PENDING`, not `ALL`: the work of this screen is the applications nobody has
 * looked at yet, and somebody is waiting behind each one. Not `PENDING_REVIEW`
 * either — see §3.2, every live row holds `PENDING`.
 */
export const DEFAULT_STATUS = DEFAULT_VERIFICATION_STATUS_FILTER

const STATUS_FILTER_VALUES: readonly string[] = [...VERIFICATION_STATUS_VALUES, 'ALL']
const TARGET_TYPE_FILTER_VALUES: readonly string[] = [
  ...VERIFICATION_TARGET_TYPE_VALUES,
  'ALL',
]

/**
 * Is this a status the API will accept?
 *
 * Both enums are validated strictly server-side — an unknown value is a 400
 * listing the legal ones, not a silently ignored parameter — so a pasted or
 * hand-edited URL carrying garbage would take the whole page down. Bad values
 * are dropped here and the page renders on the default instead.
 */
export function isStatusFilter(value: string): value is VerificationStatusFilter {
  return STATUS_FILTER_VALUES.includes(value)
}

export function isTargetTypeFilter(
  value: string,
): value is VerificationTargetTypeFilter {
  return TARGET_TYPE_FILTER_VALUES.includes(value)
}

/**
 * Does this view narrow anything?
 *
 * ⚠️ `ALL` is the **only** unfiltered status, so the default `PENDING` counts
 * as an active filter. That is not pedantry: it is what makes the empty state
 * say *"No applications match this view"* rather than *"No applications yet"*
 * on a first load that is, in fact, hiding two approved rows.
 */
export function isNarrowedStatus(status: VerificationStatusFilter): boolean {
  return status !== 'ALL'
}
