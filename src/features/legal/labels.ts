import {
  LEGAL_DOCUMENT_TYPES,
  LEGAL_SLUGS,
  type LegalAppType,
  type LegalDocument,
  type LegalDocumentType,
} from '@/types/legal'

/**
 * Words and small derivations for the legal module (plan.md §3, LG1).
 */

export const TYPE_LABELS: Readonly<Record<LegalDocumentType, string>> = {
  PRIVACY_POLICY: 'Privacy Policy',
  TERMS_OF_SERVICE: 'Terms of Service',
  COOKIE_POLICY: 'Cookie Policy',
  COMMUNITY_GUIDELINES: 'Community Guidelines',
}

export const TYPE_DESCRIPTIONS: Readonly<Record<LegalDocumentType, string>> = {
  PRIVACY_POLICY: 'How user data is collected, used and protected.',
  TERMS_OF_SERVICE: 'The rules for using CallsChat and its accounts.',
  COOKIE_POLICY: 'Cookies and tracking on the website.',
  COMMUNITY_GUIDELINES: 'Conduct and safety rules, including live streams.',
}

/** Display order everywhere: the same as the backend enum. */
export const TYPE_ORDER: readonly LegalDocumentType[] = LEGAL_DOCUMENT_TYPES

export const APP_LABELS: Readonly<Record<LegalAppType, string>> = {
  PERSONAL: 'Personal',
  BUSINESS: 'Business',
}

/**
 * The policy's name, with the app when it is Business: "Privacy Policy" or
 * "Business Privacy Policy". Personal keeps the bare name it always had.
 */
export function seriesLabel(type: LegalDocumentType, app: LegalAppType): string {
  return app === 'BUSINESS' ? `Business ${TYPE_LABELS[type]}` : TYPE_LABELS[type]
}

/**
 * Where the website serves a policy, or `null` when that is not known yet
 * (plan.md decision 5, B4). Personal: `callschat.com/<slug>`. Business: only
 * the privacy policy's address is given (guide §5).
 */
export function publicUrl(type: LegalDocumentType, app: LegalAppType): string | null {
  if (app === 'PERSONAL') return `https://callschat.com/${LEGAL_SLUGS[type]}`
  if (type === 'PRIVACY_POLICY') return 'https://callschat.com/privacy-policy/business'
  return null
}

/** Same policy, same app: the unit versions and publishing work in. */
export function sameSeries(
  doc: Pick<LegalDocument, 'documentType' | 'appType'>,
  type: LegalDocumentType,
  app: LegalAppType,
): boolean {
  return doc.documentType === type && doc.appType === app
}

export function typeLabel(type: string): string {
  return TYPE_LABELS[type as LegalDocumentType] ?? type
}

/** True while the effective date is still ahead (advance notice). */
export function isUpcoming(
  doc: Pick<LegalDocument, 'effectiveDate'>,
  now = Date.now(),
) {
  return Date.parse(doc.effectiveDate) > now
}

/**
 * The one PUBLISHED version per type, for one app (the backend keeps it to one
 * per type and app: publishing archives only within the same app).
 */
export function activeByType(
  docs: readonly LegalDocument[],
  app: LegalAppType,
): Partial<Record<LegalDocumentType, LegalDocument>> {
  const active: Partial<Record<LegalDocumentType, LegalDocument>> = {}
  for (const doc of docs) {
    if (doc.status !== 'PUBLISHED' || doc.appType !== app) continue
    const current = active[doc.documentType]
    if (!current || (doc.publishedAt ?? '') > (current.publishedAt ?? ''))
      active[doc.documentType] = doc
  }
  return active
}

/** Newest first by the time that matters for the row's state. */
export function byRecent(a: LegalDocument, b: LegalDocument): number {
  const at = (doc: LegalDocument) =>
    doc.status === 'DRAFT' ? doc.updatedAt : (doc.publishedAt ?? doc.updatedAt)
  return at(b).localeCompare(at(a))
}
