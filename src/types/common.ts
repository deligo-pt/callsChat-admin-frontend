import { z } from 'zod'

/**
 * Shared API envelope contracts (plan.md §10).
 *
 * VERIFIED against the live API on 2026-08-25 — these are measured shapes, not
 * proposals. The earlier proposal was wrong in three ways and this file is
 * where the correction lands:
 *
 *   - `pagination`, not `meta`
 *   - `limit`, not `pageSize`
 *   - no `details[]` and no `correlationId` on errors
 *
 * Domains that are still unbuilt server-side (clubs, hosts, moderation,
 * finance — plan.md §10.5) reuse this envelope on the assumption that the
 * backend is internally consistent. That assumption is the remaining risk.
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

/**
 * Verified list envelope:
 * `{ success: true, data: [...], pagination: { page, limit, total, totalPages } }`
 */
export const paginationSchema = z.object({
  page: z.int().positive(),
  limit: z.int().positive(),
  total: z.int().nonnegative(),
  totalPages: z.int().nonnegative(),
})

export type Pagination = z.infer<typeof paginationSchema>

export function paginatedSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    success: z.literal(true),
    data: z.array(item),
    pagination: paginationSchema,
  })
}

export interface Paginated<TItem> {
  readonly success: true
  readonly data: readonly TItem[]
  readonly pagination: Pagination
}

/** Single-record envelope: `{ success: true, data: {...} }`. */
export function envelopeSchema<TData extends z.ZodType>(data: TData) {
  return z.object({ success: z.literal(true), data })
}

/**
 * The API caps `limit` at 100 — `limit=200` is rejected with a 400. Requesting
 * more than this is a client bug, so the constant lives beside the contract
 * rather than being rediscovered in a feature.
 */
export const MAX_PAGE_SIZE = 100

/**
 * Error classes.
 *
 * `FST_ERR_VALIDATION` is Fastify's schema-rejection code and is what the live
 * API actually returns for a bad body or query param. The remaining codes are
 * either verified (`UNAUTHORIZED`, `NOT_FOUND`) or retained for domains not yet
 * built — see `toAppError` for how an unknown code degrades.
 */
export const errorCodeSchema = z.enum([
  'FST_ERR_VALIDATION',
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

/**
 * Verified error envelope. There is no `details[]` array and no
 * `correlationId` — field-level errors arrive concatenated into `message`,
 * e.g. `"body/capability Required, body/reason Required"`. `parseFieldErrors`
 * recovers what it can; see plan.md §10.2.
 */
export const errorEnvelopeSchema = z.object({
  success: z.literal(false).optional(),
  error: z.object({
    code: errorCodeSchema.or(z.string()),
    message: z.string(),
    details: z.array(fieldErrorSchema).optional(),
    correlationId: z.string().optional(),
  }),
})

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>
export type FieldError = z.infer<typeof fieldErrorSchema>

/**
 * Recover field names from a Fastify validation message.
 *
 * `"body/capability Required, body/reason Required"` becomes
 * `[{ field: 'capability', message: 'Required' }, …]`.
 *
 * This is best-effort by necessity: a message containing a comma inside an
 * enum list (`"Expected 'A' | 'B', received 'X'"`) would split wrongly, so the
 * caller must always keep the raw message as the form-level fallback rather
 * than relying on this alone.
 */
export function parseFieldErrors(message: string): readonly FieldError[] {
  // Only attempt a split when every segment looks like "<location>/<field> <text>".
  const segments = message.split(', ')
  const parsed: FieldError[] = []

  for (const segment of segments) {
    const match = /^(?:body|querystring|params|headers)\/([\w.[\]]+)\s+(.*)$/.exec(
      segment.trim(),
    )
    if (!match?.[1] || !match[2]) return []
    parsed.push({ field: match[1], message: match[2] })
  }

  return parsed
}

/** Sort direction accepted by the API (`sortOrder`). */
export type SortOrder = 'asc' | 'desc'

/**
 * Query parameters list endpoints accept.
 *
 * Names match the wire format exactly (`limit`, `sortBy`, `sortOrder`) so no
 * translation layer can drift. Note that the API **silently ignores unknown
 * query parameters** rather than rejecting them (plan.md §10.4) — a 200 is
 * never proof that a filter was applied.
 */
export interface ListParams {
  /*
   * `| undefined` is explicit because `exactOptionalPropertyTypes` is on: a
   * cleared filter is naturally expressed as `search: undefined`, and without
   * this the only way to represent "no filter" would be to rebuild the object
   * without the key.
   */
  readonly page?: number | undefined
  readonly limit?: number | undefined
  readonly sortBy?: string | undefined
  readonly sortOrder?: SortOrder | undefined
  readonly search?: string | undefined
  readonly [key: string]: string | number | boolean | undefined
}
