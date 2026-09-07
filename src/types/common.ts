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
 * The OTHER list envelope: `{ success, data: { items: [...], meta: {...} } }`.
 *
 * Rows nest under `data.items` and the page info under `data.meta` — the same
 * four fields `pagination` carries, one level deeper and under a different
 * key. {@link paginatedSchema} does not fit and must not be forced onto it.
 *
 * This is not a quirk of one route. `GET /admin/settings/database/backups`
 * shipped it first (system_settings_plan.md §2.5) and
 * `GET /admin/feedbacks` shipped it again (feedback_management_plan.md §2.1),
 * so it is promoted here rather than re-declared per feature. Which envelope a
 * given route uses is a fact about that route, verified live; there is no rule
 * to derive it from.
 */
export function itemsEnvelopeSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    success: z.literal(true),
    data: z.object({
      items: z.array(item),
      meta: paginationSchema,
    }),
  })
}

/** The `data` payload of an {@link itemsEnvelopeSchema} response. */
export interface ItemsPage<TItem> {
  readonly items: readonly TItem[]
  readonly meta: Pagination
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
  /**
   * Verified live 2026-09-06 on `/admin/feedbacks/*`.
   *
   * The backend raises this — with status 400 — for a request whose *shape* is
   * valid but whose *meaning* is not: an illegal status transition, or
   * assigning a ticket to a suspended staff member. It is distinct from
   * `FST_ERR_VALIDATION`, which is Zod refusing the body before the handler
   * runs, and it carries no `body/…` prefixes, so `parseFieldErrors` correctly
   * yields nothing and the message surfaces at form level.
   */
  'BAD_REQUEST',
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
 * Array members arrive with a **slash-separated index** rather than bracket
 * notation — `"body/allowedFileTypes/1 Expected string, received number"` —
 * which is normalised here to `allowedFileTypes[1]` so a form can match it
 * against the path React Hook Form uses. Without that, the whole parse bailed
 * and every field mapping in the message was lost (system_settings_plan.md §3.2).
 *
 * Segments are split on a comma **only where the next one begins with a
 * location prefix**. A plain `split(', ')` tore apart the two commonest
 * messages this API produces — `"Expected string, received number"` and
 * `"Expected 'A' | 'B', received 'X'"` — leaving a fragment that matched
 * nothing, which forced the whole parse to abort. The lookahead keeps such a
 * message whole and still separates genuinely distinct field failures.
 *
 * It is still best-effort: a field message that itself contained the literal
 * text `", body/…"` would split wrongly. Callers must therefore keep the raw
 * message as the form-level fallback rather than relying on this alone.
 *
 * Two shapes deliberately yield `[]`, meaning "no field mapping, show the raw
 * message": the root-level `"body/ Expected object, received null"`, which
 * names no field, and any `BAD_REQUEST` cross-field message that carries no
 * `body/` prefix at all.
 */
const FIELD_LOCATION = /(?:body|querystring|params|headers)\//

export function parseFieldErrors(message: string): readonly FieldError[] {
  // Only attempt a split when every segment looks like "<location>/<field> <text>".
  const segments = message.split(new RegExp(`,\\s+(?=${FIELD_LOCATION.source})`))
  const parsed: FieldError[] = []

  for (const segment of segments) {
    const match =
      /^(?:body|querystring|params|headers)\/([\w.[\]]+(?:\/\d+)*)\s+(.*)$/.exec(
        segment.trim(),
      )
    if (!match?.[1] || !match[2]) return []
    // "allowedFileTypes/1" -> "allowedFileTypes[1]"
    parsed.push({ field: match[1].replace(/\/(\d+)/g, '[$1]'), message: match[2] })
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
