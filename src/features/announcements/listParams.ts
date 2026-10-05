import {
  ANNOUNCEMENT_AUDIENCE_VALUES,
  ANNOUNCEMENT_PRIORITY_VALUES,
  ANNOUNCEMENT_STATUS_VALUES,
  type AnnouncementAudience,
  type AnnouncementPriority,
  type AnnouncementStatus,
} from '@/types/announcement'
import { MAX_PAGE_SIZE } from '@/types/common'

/**
 * The announcements-queue query (plan.md §2.3, phase B2).
 *
 * Three things set this apart from the verification queue it is modelled on,
 * and each one is a fact about the endpoint rather than a preference.
 *
 * 1. **There is no sort.** `sortBy` is absent from the query schema, and this
 *    API *silently drops* unknown query parameters rather than rejecting them
 *    — so a sort control would appear to work and reorder nothing (O4). No
 *    column carries one, and the page states its order once instead.
 * 2. **`ALL` means "send nothing".** The opposite of the verification queue,
 *    where `ALL` is a real value that must be transmitted because omitting
 *    `status` there silently narrows to the pending rows. Here an omitted
 *    filter is an absent filter, so clearing one deletes the key — the
 *    ordinary behaviour, restored.
 * 3. **There is no date filter**, because the route takes none. Offering one
 *    that silently did nothing would repeat a trap this codebase has already
 *    walked into twice.
 *
 * ⚠️ Point 2 is **unverified on a non-empty table** (O14). The live
 * announcements table holds zero rows, so "omitting `status` returns every
 * status" is read off the query schema — which declares no default — and not
 * off observed behaviour. If the service turns out to narrow silently the way
 * `/admin/verifications` does, `DEFAULT_STATUS` becomes a value that must be
 * sent, exactly as it is there, and this file is where that change lands.
 */

/**
 * Filter keys the URL may carry.
 *
 * `page` and `limit` are deliberately **not** here: "Clear all" resets the
 * filters, not the operator's page size, which is a display preference they set
 * once and expect to persist.
 */
export const FILTER_KEYS = [
  'search',
  'status',
  'priority',
  'targetAudience',
  'pinned',
] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

/** `querystring/limit Number must be less than or equal to 100`, verified. */
export const MAX_LIMIT = MAX_PAGE_SIZE

/**
 * The sentinel for "no filter on this facet".
 *
 * Shared by all four selects so one constant governs every "is this narrowed?"
 * check. It is **never sent to the API** and never written to the URL — a facet
 * at `ANY` has its key deleted — so the exact string is internal.
 *
 * ⚠️ **It was `'ALL'` until 2026-10-05, and that collided with a real enum
 * value.** `announcementAudienceSchema` has a member called `ALL` (meaning
 * "every account mode"), so the Audience select rendered **two `SelectItem`s
 * with `value="ALL"`** — "Any audience" and "Everyone". Radix mirrors every
 * matching item's children into the trigger, so the closed control read
 * *"Any audienceEveryone"*, clipped mid-word.
 *
 * The cosmetic bug was the visible half. The functional half was worse:
 * choosing "Everyone" set the facet to `ALL`, which this file defines as *no
 * filter* — so `targetAudience=ALL` could never be sent, and announcements
 * addressed to everyone could not be filtered for at all.
 *
 * The sentinel is now a string no backend enum can contain. `status` and
 * `priority` never collided; Audience was the only broken facet.
 */
export const ANY = '__ANY__' as const

/**
 * What the queue opens on: **everything**.
 *
 * Unlike the verification queue, which opens on `PENDING` because somebody is
 * waiting behind each pending row, an announcements queue has no waiting party
 * and no inbox semantics. The question an operator arrives with is *"what have
 * we published, and what is still a draft?"* — which is a question about the
 * whole table. Opening on a filtered subset would hide published history behind
 * a control nobody knew was set.
 */
export const DEFAULT_STATUS = ANY

/** A filter value is either a real enum member or the `ALL` sentinel. */
export type StatusFilter = AnnouncementStatus | typeof ANY
export type PriorityFilter = AnnouncementPriority | typeof ANY
export type AudienceFilter = AnnouncementAudience | typeof ANY

/**
 * Pinned is a tri-state, not a checkbox.
 *
 * A checkbox can express "pinned only" and "no filter" but not "unpinned
 * only", and the service accepts `isPinned=false` as a real narrowing — so a
 * checkbox would hide a filter the API offers. `ALL` here means the key is
 * omitted entirely.
 */
export const PINNED_FILTER_VALUES = [ANY, 'true', 'false'] as const
export type PinnedFilter = (typeof PINNED_FILTER_VALUES)[number]

const STATUS_FILTER_VALUES: readonly string[] = [...ANNOUNCEMENT_STATUS_VALUES, ANY]
const PRIORITY_FILTER_VALUES: readonly string[] = [...ANNOUNCEMENT_PRIORITY_VALUES, ANY]
const AUDIENCE_FILTER_VALUES: readonly string[] = [...ANNOUNCEMENT_AUDIENCE_VALUES, ANY]

/**
 * Is this a value the API will accept?
 *
 * ⚠️ All four facets are validated **strictly** server-side — an unknown value
 * is a 400 listing the legal ones, not a silently ignored parameter — so a
 * pasted or hand-edited URL carrying garbage would take the whole page down
 * rather than being ignored. Bad values are dropped here and the page renders
 * on the default instead.
 *
 * Note the asymmetry with the row schema, which tolerates unknown enum values
 * on purpose: reading a value the backend invented must not blank the queue,
 * but *sending* one is always a 400.
 */
export function isStatusFilter(value: string): value is StatusFilter {
  return STATUS_FILTER_VALUES.includes(value)
}

export function isPriorityFilter(value: string): value is PriorityFilter {
  return PRIORITY_FILTER_VALUES.includes(value)
}

export function isAudienceFilter(value: string): value is AudienceFilter {
  return AUDIENCE_FILTER_VALUES.includes(value)
}

export function isPinnedFilter(value: string): value is PinnedFilter {
  return (PINNED_FILTER_VALUES as readonly string[]).includes(value)
}
