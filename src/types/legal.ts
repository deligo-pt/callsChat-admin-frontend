import { z } from 'zod'

import { idSchema, isoDateTime, paginationSchema } from '@/types/common'

/**
 * Legal & policy documents — `/admin/legal/documents/*` (plan.md §1, LG0).
 *
 * Measured on staging 2026-11-08 with throwaway drafts (created, edited and
 * deleted). Where the backend guide and the server disagree, these follow the
 * server:
 * - validation is `FST_ERR_VALIDATION` with `body/<field> <reason>` messages;
 * - `status=ALL` is a 400, so "all" means leaving `status` out;
 * - `search` is accepted and ignored;
 * - `PUT` silently ignores `version` and `documentType`;
 * - `subtitle: null` and `contact: null` are rejected — they cannot be cleared.
 *
 * ⚠️ Publish was **not** measured (it is irreversible). Its response is read
 * loosely and the caller refetches instead of trusting it (plan.md O1).
 */

export const LEGAL_DOCUMENT_TYPES = [
  'PRIVACY_POLICY',
  'TERMS_OF_SERVICE',
  'COOKIE_POLICY',
  'COMMUNITY_GUIDELINES',
] as const
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number]

export const LEGAL_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
export type LegalStatus = (typeof LEGAL_STATUSES)[number]

/** Canonical public slug per type (the backend derives it; mirrored for links). */
export const LEGAL_SLUGS: Readonly<Record<LegalDocumentType, string>> = {
  PRIVACY_POLICY: 'privacy-policy',
  TERMS_OF_SERVICE: 'terms-of-service',
  COOKIE_POLICY: 'cookie-policy',
  COMMUNITY_GUIDELINES: 'community-guidelines',
}

/** `limit` above 50 is a 400 (measured); the default is 20. */
export const MAX_LEGAL_LIMIT = 50

/** Server rule, from its 400 message. */
export const LEGAL_CONTENT_MIN = 10

/**
 * SemVer as the server accepts it — pre-release tags such as `0.0.1-test`
 * pass (measured), so this is the full SemVer 2.0 grammar, not `x.y.z` only.
 */
export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

export function isLegalDocumentType(value: unknown): value is LegalDocumentType {
  return (
    typeof value === 'string' &&
    (LEGAL_DOCUMENT_TYPES as readonly string[]).includes(value)
  )
}

export function isLegalStatus(value: unknown): value is LegalStatus {
  return (
    typeof value === 'string' && (LEGAL_STATUSES as readonly string[]).includes(value)
  )
}

/* ------------------------------------------------------------------ *
 * Records
 * ------------------------------------------------------------------ */

export const legalSectionSchema = z.object({
  /**
   * ⚠️ Not unique: two identical headings produce the same id (measured,
   * plan.md O5). Never use it alone as a React key.
   */
  id: z.string(),
  heading: z.string(),
  /** Paragraphs, split on blank lines. Raw Markdown and inline HTML survive. */
  body: z.array(z.string()),
})
export type LegalSection = z.infer<typeof legalSectionSchema>

export const legalContactEmailSchema = z.object({
  label: z.string(),
  address: z.string(),
})

export const legalContactSchema = z.object({
  org: z.string(),
  location: z.string().nullable().optional(),
  emails: z.array(legalContactEmailSchema),
  website: z.string().nullable().optional(),
})
export type LegalContact = z.infer<typeof legalContactSchema>

export const legalDocumentSchema = z.object({
  id: idSchema,
  documentType: z.enum(LEGAL_DOCUMENT_TYPES),
  slug: z.string(),
  version: z.string(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  effectiveDate: isoDateTime,
  /** ⚠️ On create the server copies `subtitle` here when one is sent (O5). */
  intro: z.string().nullable().optional(),
  contentMarkdown: z.string(),
  sections: z.array(legalSectionSchema).default([]),
  contact: legalContactSchema.nullable().optional(),
  consent: z.string().nullable().optional(),
  changelog: z.string().nullable().optional(),
  requiresReconsent: z.boolean(),
  status: z.enum(LEGAL_STATUSES),
  publishedAt: isoDateTime.nullable().optional(),
  publishedBy: z.string().nullable().optional(),
  createdByAdminId: z.string().nullable().optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type LegalDocument = z.infer<typeof legalDocumentSchema>

/* ------------------------------------------------------------------ *
 * Envelopes
 * ------------------------------------------------------------------ */

/**
 * ⚠️ Rows carry the **full** document — Markdown and sections included
 * (measured). Fine at a few dozen rows; do not page it like a light list.
 */
export const legalListSchema = z.object({
  success: z.literal(true),
  data: z.array(legalDocumentSchema),
  pagination: paginationSchema,
})

export const legalDocumentEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: legalDocumentSchema,
})

/** Publish answer, from the guide only (O1) — read loosely, then refetch. */
export const legalPublishEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z
    .object({
      id: idSchema,
      status: z.string().optional(),
      publishedAt: z.string().nullable().optional(),
      publishedBy: z.string().nullable().optional(),
    })
    .loose(),
})

export const legalDeleteEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.object({ id: idSchema }).loose().optional(),
})

/* ------------------------------------------------------------------ *
 * Request bodies
 * ------------------------------------------------------------------ */

export interface LegalContactInput {
  readonly org: string
  readonly location?: string
  readonly emails: readonly { readonly label: string; readonly address: string }[]
  readonly website?: string
}

export interface LegalDocumentCreate {
  readonly documentType: LegalDocumentType
  readonly version: string
  readonly title: string
  readonly subtitle?: string
  /** ISO 8601. */
  readonly effectiveDate: string
  readonly contentMarkdown: string
  readonly contact?: LegalContactInput
  readonly consent?: string
  readonly changelog?: string
  readonly requiresReconsent?: boolean
}

/**
 * `PUT` body. `version` and `documentType` are deliberately absent: the
 * server ignores them with a 200 (measured), so sending them would only
 * pretend to change something.
 *
 * ⚠️ `subtitle` and `contact` cannot be `null` (400). `consent` and
 * `changelog` clear with `""`.
 */
export type LegalDocumentUpdate = Partial<
  Omit<LegalDocumentCreate, 'documentType' | 'version'>
>

/** Optional overrides applied at publish time. */
export interface LegalPublishInput {
  readonly effectiveDate?: string
  readonly requiresReconsent?: boolean
  readonly changelog?: string
}
