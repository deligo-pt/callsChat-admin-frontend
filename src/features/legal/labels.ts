import {
  LEGAL_DOCUMENT_TYPES,
  LEGAL_SLUGS,
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

/** Where the website serves a type (guide §3). */
export function publicUrl(type: LegalDocumentType): string {
  return `https://callschat.com/${LEGAL_SLUGS[type]}`
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

/** The one PUBLISHED version per type (the backend keeps it to one). */
export function activeByType(
  docs: readonly LegalDocument[],
): Partial<Record<LegalDocumentType, LegalDocument>> {
  const active: Partial<Record<LegalDocumentType, LegalDocument>> = {}
  for (const doc of docs) {
    if (doc.status !== 'PUBLISHED') continue
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
