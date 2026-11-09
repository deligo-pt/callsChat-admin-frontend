import { z } from 'zod'

import {
  LEGAL_CONTENT_MIN,
  LEGAL_DOCUMENT_TYPES,
  SEMVER_PATTERN,
  type LegalDocument,
  type LegalDocumentCreate,
  type LegalDocumentType,
  type LegalDocumentUpdate,
} from '@/types/legal'

import { TYPE_LABELS } from './labels'

/**
 * The draft editor's form (plan.md §3.2, LG3).
 *
 * Rules mirror the server's 400s (measured 2026-11-08), so they are met
 * before a round trip. The effective date is a calendar day, sent as UTC
 * midnight.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emailSchema = z.object({
  label: z.string().trim().min(1, 'Add a label, e.g. "Support".'),
  address: z.string().trim().regex(EMAIL, 'Enter a valid email address.'),
})

export const legalFormSchema = z
  .object({
    documentType: z.enum(LEGAL_DOCUMENT_TYPES),
    version: z
      .string()
      .trim()
      .regex(SEMVER_PATTERN, 'Use a version like 1.0.0, 1.1.0 or 2.0.0.'),
    title: z.string().trim().min(1, 'Add a title.').max(200),
    subtitle: z.string().max(200),
    effectiveDate: z.string().regex(DAY, 'Pick the date this version takes effect.'),
    contentMarkdown: z
      .string()
      .refine(
        (value) => value.trim().length >= LEGAL_CONTENT_MIN,
        `Write at least ${LEGAL_CONTENT_MIN} characters.`,
      ),
    requiresReconsent: z.boolean(),
    changelog: z.string().max(2000),
    consent: z.string().max(1000),
    hasContact: z.boolean(),
    contact: z.object({
      org: z.string(),
      location: z.string(),
      website: z.string(),
      emails: z.array(emailSchema),
    }),
  })
  .superRefine((values, ctx) => {
    if (!values.hasContact) return
    if (!values.contact.org.trim())
      ctx.addIssue({
        code: 'custom',
        path: ['contact', 'org'],
        message: 'Add the organisation name.',
      })
    if (values.contact.emails.length === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['contact', 'emails'],
        message: 'Add at least one email address.',
      })
  })

export type LegalFormValues = z.infer<typeof legalFormSchema>

/** Fields a server `body/<field>` message can be pinned to. */
export const LEGAL_FORM_FIELDS = [
  'documentType',
  'version',
  'title',
  'subtitle',
  'effectiveDate',
  'contentMarkdown',
  'requiresReconsent',
  'changelog',
  'consent',
] as const

export const DEFAULT_CONTACT: LegalFormValues['contact'] = {
  org: 'CallsChat LLC',
  location: 'United States',
  website: 'callschat.com',
  emails: [{ label: 'Support', address: 'support@callschat.com' }],
}

export function templateMarkdown(type: LegalDocumentType): string {
  /* No "# Title" line: the server drops it, and the preview would warn about it. */
  return `A short introduction to the ${TYPE_LABELS[type]}. Text before the first "## " heading becomes the intro.

## 1. First section
Write the first paragraph here.

Leave a blank line to start a new paragraph.

## 2. Second section
Each "## " heading starts a new section in the table of contents.
`
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function emptyFormValues(
  type: LegalDocumentType,
  version: string,
): LegalFormValues {
  return {
    documentType: type,
    version,
    title: TYPE_LABELS[type],
    subtitle: 'CallsChat LLC • United States',
    effectiveDate: today(),
    contentMarkdown: templateMarkdown(type),
    requiresReconsent: false,
    changelog: '',
    consent: '',
    hasContact: true,
    contact: DEFAULT_CONTACT,
  }
}

/** A form filled from a stored document — to edit it, or to copy it forward. */
export function formValuesFrom(
  doc: LegalDocument,
  overrides: Partial<LegalFormValues> = {},
): LegalFormValues {
  return {
    documentType: doc.documentType,
    version: doc.version,
    title: doc.title,
    subtitle: doc.subtitle ?? '',
    effectiveDate: doc.effectiveDate.slice(0, 10),
    contentMarkdown: doc.contentMarkdown,
    requiresReconsent: doc.requiresReconsent,
    changelog: doc.changelog ?? '',
    consent: doc.consent ?? '',
    hasContact: Boolean(doc.contact),
    contact: doc.contact
      ? {
          org: doc.contact.org,
          location: doc.contact.location ?? '',
          website: doc.contact.website ?? '',
          emails: doc.contact.emails.map(({ label, address }) => ({ label, address })),
        }
      : DEFAULT_CONTACT,
    ...overrides,
  }
}

export function toIsoDay(day: string): string {
  return `${day}T00:00:00.000Z`
}

function contactPayload(values: LegalFormValues) {
  const { org, location, website, emails } = values.contact
  return {
    org: org.trim(),
    ...(location.trim() ? { location: location.trim() } : {}),
    emails: emails.map((email) => ({
      label: email.label.trim(),
      address: email.address.trim(),
    })),
    ...(website.trim() ? { website: website.trim() } : {}),
  }
}

export function toCreatePayload(values: LegalFormValues): LegalDocumentCreate {
  const subtitle = values.subtitle.trim()
  const consent = values.consent.trim()
  const changelog = values.changelog.trim()
  return {
    documentType: values.documentType,
    version: values.version.trim(),
    title: values.title.trim(),
    ...(subtitle ? { subtitle } : {}),
    effectiveDate: toIsoDay(values.effectiveDate),
    contentMarkdown: values.contentMarkdown,
    ...(values.hasContact ? { contact: contactPayload(values) } : {}),
    ...(consent ? { consent } : {}),
    ...(changelog ? { changelog } : {}),
    requiresReconsent: values.requiresReconsent,
  }
}

/**
 * `PUT` body. `version` and `documentType` are never sent (the server ignores
 * them). ⚠️ `subtitle` and `contact` cannot be cleared — `null` is a 400 — so
 * an emptied subtitle or a removed contact is simply not sent; the form
 * prevents both and says why (plan.md O4). `consent` and `changelog` clear
 * with `""`, which the server accepts.
 */
export function toUpdatePayload(values: LegalFormValues): LegalDocumentUpdate {
  const subtitle = values.subtitle.trim()
  return {
    title: values.title.trim(),
    ...(subtitle ? { subtitle } : {}),
    effectiveDate: toIsoDay(values.effectiveDate),
    contentMarkdown: values.contentMarkdown,
    ...(values.hasContact ? { contact: contactPayload(values) } : {}),
    consent: values.consent.trim(),
    changelog: values.changelog.trim(),
    requiresReconsent: values.requiresReconsent,
  }
}

/* ------------------------------------------------------------------ *
 * Versions
 * ------------------------------------------------------------------ */

type Parts = [number, number, number]

function parts(version: string): Parts | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

export function compareVersions(a: string, b: string): number {
  const pa = parts(a) ?? [0, 0, 0]
  const pb = parts(b) ?? [0, 0, 0]
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  /* A pre-release sorts before its release: 1.0.0-rc < 1.0.0. */
  return Number(!a.includes('-')) - Number(!b.includes('-'))
}

export type Bump = 'patch' | 'minor' | 'major'

export function bumpVersion(version: string | undefined, bump: Bump): string {
  const current = version ? parts(version) : null
  if (!current) return '1.0.0'
  const [major, minor, patch] = current
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/** The highest version already used for a type, in any status. */
export function latestVersion(
  docs: readonly LegalDocument[],
  type: LegalDocumentType,
): string | undefined {
  return docs
    .filter((doc) => doc.documentType === type)
    .map((doc) => doc.version)
    .sort(compareVersions)
    .at(-1)
}

/** The next free version, bumping until it is not taken. */
export function nextFreeVersion(
  docs: readonly LegalDocument[],
  type: LegalDocumentType,
  bump: Bump = 'minor',
): string {
  const taken = new Set(
    docs.filter((doc) => doc.documentType === type).map((doc) => doc.version),
  )
  let candidate = bumpVersion(latestVersion(docs, type), bump)
  if (!latestVersion(docs, type)) candidate = '1.0.0'
  while (taken.has(candidate)) candidate = bumpVersion(candidate, 'patch')
  return candidate
}
