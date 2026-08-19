import { z } from 'zod'

/**
 * Shared API envelope contracts (plan.md §10).
 *
 * PROPOSED, not confirmed. These mirror the baseline agreed in the docs and
 * are the single place a contract change lands — see plan.md §13 for the
 * open items the backend team still needs to confirm.
 */

/** UTC ISO-8601 timestamp, e.g. "2026-08-19T05:22:11Z". */
export const isoDateTime = z.iso.datetime({ offset: true }).or(z.iso.datetime())

/** Opaque backend identifier. */
export const idSchema = z.string().min(1)

/** Integer quantity in the smallest defined unit — never a float (plan.md §3.3). */
export const minorUnits = z.int()

/** Whole Diamonds. Fractional Diamonds do not exist. */
export const diamondAmount = z.int().nonnegative()

/** ISO 4217 currency code. */
export const currencyCode = z.string().length(3)

export const paginationMetaSchema = z.object({
  page: z.int().positive(),
  pageSize: z.int().positive(),
  total: z.int().nonnegative(),
  totalPages: z.int().nonnegative(),
})

export type PaginationMeta = z.infer<typeof paginationMetaSchema>

/** `{ data: [...], meta: {...} }` — the envelope every list endpoint returns. */
export function paginatedSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    data: z.array(item),
    meta: paginationMetaSchema,
  })
}

export interface Paginated<TItem> {
  readonly data: readonly TItem[]
  readonly meta: PaginationMeta
}

/** Stable error classes returned by the backend (plan.md §10). */
export const errorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE_TRANSITION',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
])

export type ErrorCode = z.infer<typeof errorCodeSchema>

export const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
})

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema.or(z.string()),
    message: z.string(),
    details: z.array(fieldErrorSchema).optional(),
    correlationId: z.string().optional(),
  }),
})

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>
export type FieldError = z.infer<typeof fieldErrorSchema>

/** Query parameters every list endpoint accepts. */
export interface ListParams {
  readonly page?: number
  readonly pageSize?: number
  readonly sort?: string
  readonly direction?: 'asc' | 'desc'
  readonly search?: string
  readonly [key: string]: string | number | boolean | undefined
}
