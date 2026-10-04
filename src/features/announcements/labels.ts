import type { AnnouncementAudience } from '@/types/announcement'

/**
 * Operator-facing names for the announcements module.
 *
 * Status and priority are **not** here: they are badges, and every badge label
 * in the panel comes from `lib/status.ts` so one file owns every state name and
 * colour. Only the vocabularies that render as plain text live here.
 */

/**
 * Who an announcement goes to.
 *
 * ⚠️ The raw enum is unusable on screen. `ALL`, `PERSONAL` and `BUSINESS` are
 * values from a column called `targetAudience`, and read on their own they are
 * ambiguous in the worst direction — an operator scanning a list cannot tell
 * whether `PERSONAL` means "personal accounts" or "a personal message", and
 * guessing wrong means broadcasting to the wrong half of the userbase.
 *
 * `broadcast.md` §3.1 is what settles the meaning: filtering is by the
 * recipient's **account mode**, where a `PERSONAL` user receives `ALL` +
 * `PERSONAL` and a `BUSINESS` user receives `ALL` + `BUSINESS`. So `ALL` is not
 * a third audience beside the other two — it is both of them at once, and the
 * label says so.
 */
export const AUDIENCE_LABELS: Readonly<Record<AnnouncementAudience, string>> = {
  ALL: 'Everyone',
  PERSONAL: 'Personal accounts',
  BUSINESS: 'Business accounts',
}

/** Shorter forms, for a table cell where the column header already says "Audience". */
export const AUDIENCE_SHORT_LABELS: Readonly<Record<AnnouncementAudience, string>> = {
  ALL: 'Everyone',
  PERSONAL: 'Personal',
  BUSINESS: 'Business',
}

/**
 * Humanise a value the backend may have added since this was written.
 *
 * The row schema tolerates unknown enum values on purpose (O5 / `types/announcement.ts`),
 * so every label lookup needs a fallback that degrades to something readable
 * rather than printing `SOME_NEW_VALUE` at an operator.
 */
export function humaniseEnum(value: string): string {
  const lower = value.replace(/_/g, ' ').toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export function audienceLabel(value: string | null | undefined, short = false): string {
  if (!value) return 'Unspecified'
  const map = short ? AUDIENCE_SHORT_LABELS : AUDIENCE_LABELS
  return map[value as AnnouncementAudience] ?? humaniseEnum(value)
}
