import { parseFieldErrors, type ErrorCode, type FieldError } from '@/types/common'

/**
 * Typed application errors parsed from the backend error envelope
 * (plan.md §2.2 / §10).
 *
 * Every error carries its correlation ID so an operator can hand support a
 * single traceable reference instead of a screenshot.
 */
export abstract class AppError extends Error {
  abstract readonly code: ErrorCode
  readonly status: number
  readonly correlationId: string | undefined
  readonly fieldErrors: readonly FieldError[]

  protected constructor(
    message: string,
    status: number,
    correlationId?: string,
    fieldErrors: readonly FieldError[] = [],
  ) {
    super(message)
    this.name = new.target.name
    this.status = status
    this.correlationId = correlationId
    this.fieldErrors = fieldErrors
  }
}

export class ValidationError extends AppError {
  override readonly code = 'VALIDATION_ERROR' as const
  constructor(
    message: string,
    correlationId?: string,
    fieldErrors: readonly FieldError[] = [],
  ) {
    super(message, 400, correlationId, fieldErrors)
  }
}

export class UnauthorizedError extends AppError {
  override readonly code = 'UNAUTHORIZED' as const
  constructor(message = 'Your session has expired.', correlationId?: string) {
    super(message, 401, correlationId)
  }
}

export class ForbiddenError extends AppError {
  override readonly code = 'FORBIDDEN' as const
  /** Message is intentionally generic — a 403 must leak nothing (plan.md §3.4). */
  constructor(
    message = 'You do not have permission to do that.',
    correlationId?: string,
  ) {
    super(message, 403, correlationId)
  }
}

export class NotFoundError extends AppError {
  override readonly code = 'NOT_FOUND' as const
  constructor(message = 'Record not found.', correlationId?: string) {
    super(message, 404, correlationId)
  }
}

export class ConflictError extends AppError {
  override readonly code = 'CONFLICT' as const
  constructor(message: string, correlationId?: string) {
    super(message, 409, correlationId)
  }
}

/** The record moved on: the requested transition is not legal from its state. */
export class InvalidStateTransitionError extends AppError {
  override readonly code = 'INVALID_STATE_TRANSITION' as const
  constructor(message: string, correlationId?: string) {
    super(message, 409, correlationId)
  }
}

/** Same idempotency key, different payload — never silently retried. */
export class IdempotencyConflictError extends AppError {
  override readonly code = 'IDEMPOTENCY_CONFLICT' as const
  constructor(message: string, correlationId?: string) {
    super(message, 409, correlationId)
  }
}

export class RateLimitedError extends AppError {
  override readonly code = 'RATE_LIMITED' as const
  constructor(
    message = 'Too many requests. Try again shortly.',
    correlationId?: string,
  ) {
    super(message, 429, correlationId)
  }
}

export class InternalError extends AppError {
  override readonly code = 'INTERNAL_ERROR' as const
  constructor(
    message = 'The request could not be completed.',
    status = 500,
    correlationId?: string,
  ) {
    super(message, status, correlationId)
  }
}

/**
 * A response did not match its Zod contract.
 *
 * plan.md §2.6: a parse failure on a finance response surfaces as an explicit
 * error. Silently wrong money is far worse than a visible failure.
 */
export class ContractViolationError extends AppError {
  override readonly code = 'INTERNAL_ERROR' as const
  readonly issues: readonly string[]

  constructor(resource: string, issues: readonly string[], correlationId?: string) {
    super(
      `The server returned data for "${resource}" that does not match the expected contract. This has been reported and no data was changed.`,
      500,
      correlationId,
    )
    this.issues = issues
  }
}

/** Request failed before a response — offline, DNS, CORS. */
export class NetworkError extends AppError {
  override readonly code = 'INTERNAL_ERROR' as const
  constructor(message = 'Could not reach the server. Check your connection.') {
    super(message, 0)
  }
}

/**
 * Fastify's schema-rejection code. plan.md §10.2: this is what the live API
 * actually returns for a bad body or query parameter, and its field detail is
 * embedded in the message string rather than a `details[]` array.
 */
const FASTIFY_VALIDATION_CODE = 'FST_ERR_VALIDATION'

const ERROR_BY_CODE: Readonly<
  Record<
    string,
    (
      message: string,
      correlationId?: string,
      fields?: readonly FieldError[],
    ) => AppError
  >
> = {
  [FASTIFY_VALIDATION_CODE]: (m, c, f) =>
    new ValidationError(m, c, f && f.length > 0 ? f : parseFieldErrors(m)),
  VALIDATION_ERROR: (m, c, f) => new ValidationError(m, c, f),
  /*
   * `BAD_REQUEST` is what `/admin/feedbacks/*` returns for a request that is
   * well-formed but wrong for the record's current state — an illegal status
   * transition, or an assignment to a suspended colleague
   * (feedback_management_plan.md §2.6).
   *
   * It resolves to a `ValidationError` with no field errors, which is the right
   * surface: the server's message is a whole sentence naming the legal
   * successors, so it belongs at form level rather than pinned to an input.
   * `parseFieldErrors` returns `[]` for it — there is no `body/…` prefix to
   * find — and that is deliberate, not a parse failure.
   *
   * Not `InvalidStateTransitionError`, despite the name fitting: that class
   * hard-codes status 409 and this arrives as 400. An error object that
   * misreports the status it came from is worse than one with a broader name.
   *
   * Mapped by code rather than left to the status fallback so it stays correct
   * if the backend ever pairs the code with a different status.
   */
  BAD_REQUEST: (m, c) => new ValidationError(m, c, parseFieldErrors(m)),
  UNAUTHORIZED: (m, c) => new UnauthorizedError(m, c),
  FORBIDDEN: (m, c) => new ForbiddenError(m, c),
  NOT_FOUND: (m, c) => new NotFoundError(m, c),
  CONFLICT: (m, c) => new ConflictError(m, c),
  INVALID_STATE_TRANSITION: (m, c) => new InvalidStateTransitionError(m, c),
  IDEMPOTENCY_CONFLICT: (m, c) => new IdempotencyConflictError(m, c),
  RATE_LIMITED: (m, c) => new RateLimitedError(m, c),
}

const ERROR_BY_STATUS: Readonly<
  Record<number, (message: string, correlationId?: string) => AppError>
> = {
  400: (m, c) => new ValidationError(m, c, parseFieldErrors(m)),
  401: (m, c) => new UnauthorizedError(m, c),
  403: (m, c) => new ForbiddenError(m, c),
  404: (m, c) => new NotFoundError(m, c),
  409: (m, c) => new ConflictError(m, c),
  429: (m, c) => new RateLimitedError(m, c),
}

/**
 * Map a parsed error envelope (or a bare HTTP status) to a typed error.
 *
 * The declared `code` wins over the HTTP status, because it is more specific:
 * a 409 could be a plain conflict, a state-transition failure, or an
 * idempotency conflict, and the UI responds differently to each.
 */
export function toAppError(
  status: number,
  body: unknown,
  fallbackCorrelationId?: string,
): AppError {
  const envelope =
    typeof body === 'object' && body !== null && 'error' in body
      ? (
          body as {
            error: {
              code?: string
              message?: string
              details?: FieldError[]
              correlationId?: string
            }
          }
        ).error
      : undefined

  const correlationId = envelope?.correlationId ?? fallbackCorrelationId
  const message = envelope?.message ?? 'The request could not be completed.'

  if (envelope?.code) {
    const factory = ERROR_BY_CODE[envelope.code]
    if (factory) return factory(message, correlationId, envelope.details ?? [])
  }

  const byStatus = ERROR_BY_STATUS[status]
  if (byStatus) return byStatus(message, correlationId)

  return new InternalError(message, status, correlationId)
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/** 4xx responses are the caller's problem — retrying them is pointless. */
export function isClientError(error: unknown): boolean {
  return isAppError(error) && error.status >= 400 && error.status < 500
}
