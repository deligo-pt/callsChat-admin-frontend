import type { z } from 'zod'

import { apiClient } from '@/api/client'
import type { Pagination } from '@/types/common'
import {
  isLegalDocumentType,
  isLegalStatus,
  legalDeleteEnvelopeSchema,
  legalDocumentEnvelopeSchema,
  legalListSchema,
  legalPublishEnvelopeSchema,
  MAX_LEGAL_LIMIT,
  type LegalDocument,
  type LegalDocumentCreate,
  type LegalDocumentUpdate,
  type LegalPublishInput,
} from '@/types/legal'

/**
 * Legal & policy CMS — admin side (plan.md LG0).
 *
 * Every query value is checked on the way out: an unknown `documentType` or
 * `status`, `status=ALL`, `page=0` or `limit` over 50 is a 400 for the whole
 * request (measured 2026-11-08). `search` is not sent — the server ignores it.
 */

const BASE = '/admin/legal/documents'
const one = (id: string) => `${BASE}/${encodeURIComponent(id)}`

export interface LegalQuery {
  readonly documentType?: string | undefined
  /** Anything that is not a real status (including "ALL") is left out. */
  readonly status?: string | undefined
  readonly page?: number | undefined
  readonly limit?: number | undefined
}

export function legalParams(query: LegalQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  if (isLegalDocumentType(query.documentType))
    params['documentType'] = query.documentType
  if (isLegalStatus(query.status)) params['status'] = query.status
  if (query.page && Number.isInteger(query.page) && query.page > 1)
    params['page'] = query.page
  if (query.limit && Number.isInteger(query.limit) && query.limit > 0) {
    params['limit'] = Math.min(query.limit, MAX_LEGAL_LIMIT)
  }
  return params
}

export interface LegalPage {
  readonly data: readonly LegalDocument[]
  readonly pagination: Pagination
}

export async function fetchLegalDocuments(
  query: LegalQuery,
  signal?: AbortSignal,
): Promise<LegalPage> {
  const response = await apiClient.get<z.infer<typeof legalListSchema>>(BASE, {
    params: legalParams(query),
    schema: legalListSchema,
    resource: 'legal-documents',
    ...(signal ? { signal } : {}),
  })
  return { data: response.data, pagination: response.pagination }
}

/**
 * Every document matching the filter, all pages (at 50 per call). There are
 * four types and a handful of versions each, so this stays one or two calls.
 */
export async function fetchAllLegalDocuments(
  query: Omit<LegalQuery, 'page' | 'limit'>,
  signal?: AbortSignal,
): Promise<LegalDocument[]> {
  const rows: LegalDocument[] = []
  for (let page = 1; page <= 20; page += 1) {
    const result = await fetchLegalDocuments(
      { ...query, page, limit: MAX_LEGAL_LIMIT },
      signal,
    )
    rows.push(...result.data)
    if (result.data.length === 0 || page >= result.pagination.totalPages) break
  }
  return rows
}

/** Unknown id: `404 NOT_FOUND "Legal document not found"`. */
export async function fetchLegalDocument(
  id: string,
  signal?: AbortSignal,
): Promise<LegalDocument> {
  const response = await apiClient.get<z.infer<typeof legalDocumentEnvelopeSchema>>(
    one(id),
    {
      schema: legalDocumentEnvelopeSchema,
      resource: 'legal-document',
      ...(signal ? { signal } : {}),
    },
  )
  return response.data
}

/** `201` with the full draft. Same type + version: `409 CONFLICT`. */
export async function createLegalDocument(
  payload: LegalDocumentCreate,
): Promise<LegalDocument> {
  const response = await apiClient.post<z.infer<typeof legalDocumentEnvelopeSchema>>(
    BASE,
    {
      body: { ...payload },
      schema: legalDocumentEnvelopeSchema,
      resource: 'legal-create',
    },
  )
  return response.data
}

/** Drafts only; a published or archived document answers 400 (guide). */
export async function updateLegalDocument(
  id: string,
  payload: LegalDocumentUpdate,
): Promise<LegalDocument> {
  const response = await apiClient.put<z.infer<typeof legalDocumentEnvelopeSchema>>(
    one(id),
    {
      body: { ...payload },
      schema: legalDocumentEnvelopeSchema,
      resource: 'legal-update',
    },
  )
  return response.data
}

/**
 * ⚠️ Irreversible: archives the active version of the type and makes this one
 * public. Sent with `{}` when there are no overrides. Returns the message only —
 * callers refetch, because this response shape is unmeasured (O1).
 */
export async function publishLegalDocument(
  id: string,
  payload: LegalPublishInput = {},
): Promise<string> {
  const response = await apiClient.post<z.infer<typeof legalPublishEnvelopeSchema>>(
    `${one(id)}/publish`,
    {
      body: { ...payload },
      schema: legalPublishEnvelopeSchema,
      resource: 'legal-publish',
    },
  )
  return response.message ?? ''
}

/** Drafts only. */
export async function deleteLegalDocument(id: string): Promise<string> {
  const response = await apiClient.delete<z.infer<typeof legalDeleteEnvelopeSchema>>(
    one(id),
    { schema: legalDeleteEnvelopeSchema, resource: 'legal-delete' },
  )
  return response.message ?? ''
}
