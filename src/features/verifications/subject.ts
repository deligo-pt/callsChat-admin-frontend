import type { Verification } from '@/types/verification'

/**
 * Who — or what — an application is about (plan.md §3.4).
 *
 * One question, two sources, chosen by `targetType`. On a `USER_IDENTITY` row
 * the subject is the person; on a `BUSINESS_ENTITY` row it is the company, and
 * **every field of `applicant` comes back `null`** while `accountType` stays
 * populated and means nothing.
 *
 * A plain module rather than part of `cells.tsx`, because a file that exports
 * both a component and a function breaks Fast Refresh
 * (`react-refresh/only-export-components`) — and because the rule is worth
 * testing on its own.
 */

export interface VerificationSubject {
  /** The display name, or `null` when the service returned nothing usable. */
  readonly name: string | null
  /** A second line — email, category — or `null`. Never a repeat of `name`. */
  readonly secondary: string | null
  /** Which of the two shapes the name came from. Drives the icon, not a tone. */
  readonly kind: 'person' | 'company'
}

/**
 * What the queue shows when the service names nobody.
 *
 * ⚠️ Deliberately **not** an empty cell or an em dash. Three live business
 * applications carry an applicant object whose every field is null, and a blank
 * there reads as a rendering bug — which sends an operator looking for a
 * problem in the panel instead of reporting one in the API. Naming the gap is
 * the whole mitigation.
 */
export const SUBJECT_UNKNOWN_LABEL = 'Applicant not returned'

/** First non-empty string, or `null`. Trims, because the values are free text. */
function firstPresent(
  ...values: readonly (string | null | undefined)[]
): string | null {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return null
}

/**
 * Resolve the subject of an application.
 *
 * ⚠️ The `applicant` object is **present and full of nulls** on business rows,
 * so a `record.applicant ? … : …` check is not enough — every field has to be
 * fallen through. That is the bug this function exists to make impossible.
 */
export function resolveSubject(record: Verification): VerificationSubject {
  if (record.targetType === 'BUSINESS_ENTITY') {
    const name = firstPresent(record.business?.companyName)
    return {
      name,
      /*
       * The category, and only when there is a name above it. A lone category
       * under "Applicant not returned" would read as the company's identity.
       */
      secondary: name ? firstPresent(record.business?.category) : null,
      kind: 'company',
    }
  }

  const applicant = record.applicant
  const name = firstPresent(
    applicant?.displayName,
    applicant?.username,
    applicant?.email,
  )

  /*
   * The email is the second line only when it is not already the first. A row
   * whose only identifying value is an address shows it once.
   */
  const email = firstPresent(applicant?.email)

  return {
    name,
    secondary: email && email !== name ? email : null,
    kind: 'person',
  }
}
