import { humaniseEnum } from '@/lib/status'
import type { VerificationRejectionCode } from '@/types/verification'

/**
 * Labels for the values `lib/status.ts` deliberately does not own (plan.md
 * §3.10, §5.2).
 *
 * Three vocabularies live here rather than as status domains, for one shared
 * reason: **none of them is a state, so none of them may carry a tone.** A
 * document type, an audit action and a rejection code are categories. Colouring
 * a category tells an operator that one passport outranks another.
 *
 * Every lookup falls through to `humaniseEnum`, so a value the backend adds
 * renders readably instead of blanking the cell it was meant to fill.
 */

/**
 * What kind of document was submitted.
 *
 * ⚠️ **`idType` is free text, not an enum** (§3.10). `verification_doc.md:165`
 * types it `Text` and gives these four as *examples* with per-target defaults,
 * and it is submitted by the applicant's own client — so anything can arrive.
 * The fallback is not defensive programming here; it is the expected path for
 * any value outside this list.
 */
const ID_TYPES: Readonly<Record<string, string>> = {
  NATIONAL_ID: 'National ID',
  PASSPORT: 'Passport',
  DRIVING_LICENSE: 'Driving licence',
  DRIVERS_LICENSE: 'Driving licence',
  TRADE_LICENSE: 'Trade licence',
  CERTIFICATE_OF_INCORPORATION: 'Certificate of incorporation',
}

export function describeIdType(value: string | null | undefined): string | null {
  if (!value) return null
  return ID_TYPES[value] ?? humaniseEnum(value)
}

/**
 * What happened, in the audit trail.
 *
 * ⚠️ `VIEWED_DOCUMENT` is phrased as **"Opened a document"** rather than
 * "Viewed document", because the row is evidence that a named human looked at a
 * stranger's identity papers, and the active voice is what makes that read as
 * an act rather than a system event (§3.7).
 */
const AUDIT_ACTIONS: Readonly<Record<string, string>> = {
  SUBMITTED: 'Application submitted',
  DOCUMENTS_UPDATED: 'Documents replaced',
  RESUBMITTED: 'Resubmitted after rejection',
  VIEWED_DOCUMENT: 'Opened a document',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REVOKED: 'Verification revoked',
}

export function describeAuditAction(value: string): string {
  return AUDIT_ACTIONS[value] ?? humaniseEnum(value)
}

/**
 * The reason the applicant is shown in their own app.
 *
 * These are the six documented codes. The schema widens the *read* side with
 * `.or(z.string())` so an unrecognised code cannot blank the application an
 * operator is trying to read, which is why this falls through too.
 */
const REJECTION_CODES: Readonly<Record<string, string>> = {
  BLURRY_DOCUMENT: 'Blurry or unreadable',
  EXPIRED_DOCUMENT: 'Expired document',
  NAME_MISMATCH: 'Name does not match the profile',
  INVALID_DOCUMENT: 'Not a recognised document',
  INCOMPLETE_DOCUMENT: 'Incomplete — missing pages or sides',
  OTHER: 'Other',
}

export function describeRejectionCode(
  value: VerificationRejectionCode | string | null | undefined,
): string | null {
  if (!value) return null
  return REJECTION_CODES[value] ?? humaniseEnum(value)
}

/**
 * Initials for an avatar placeholder.
 *
 * ⚠️ The panel **never loads `applicant.avatarUrl`**. It is a storage key with
 * no origin — `"avatars/avatar_…jpg"`, captured live — so an `<img src>` would
 * resolve it against the panel's own host and 404 on every application. Two
 * letters that are certainly right beat a broken image that is certainly wrong.
 */
export function initialsFor(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'

  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

/** Human file size for a document manifest row. Binary units, as uploads are. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit] ?? 'GB'}`
}
