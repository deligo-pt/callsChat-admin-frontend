import { describe, expect, it } from 'vitest'

import {
  ConflictError,
  ForbiddenError,
  IdempotencyConflictError,
  InternalError,
  InvalidStateTransitionError,
  isAppError,
  isClientError,
  NotFoundError,
  RateLimitedError,
  toAppError,
  UnauthorizedError,
  ValidationError,
} from './errors'

function envelope(code: string, message = 'boom', extra: object = {}) {
  return { error: { code, message, correlationId: 'corr_abc123', ...extra } }
}

describe('toAppError', () => {
  it('maps each error code to its typed class', () => {
    expect(toAppError(400, envelope('VALIDATION_ERROR'))).toBeInstanceOf(
      ValidationError,
    )
    expect(toAppError(401, envelope('UNAUTHORIZED'))).toBeInstanceOf(UnauthorizedError)
    expect(toAppError(403, envelope('FORBIDDEN'))).toBeInstanceOf(ForbiddenError)
    expect(toAppError(404, envelope('NOT_FOUND'))).toBeInstanceOf(NotFoundError)
    expect(toAppError(409, envelope('CONFLICT'))).toBeInstanceOf(ConflictError)
    expect(toAppError(429, envelope('RATE_LIMITED'))).toBeInstanceOf(RateLimitedError)
  })

  it('prefers the declared code over the HTTP status', () => {
    // All three are 409 — only the code distinguishes them, and the UI
    // responds differently to each.
    expect(toAppError(409, envelope('INVALID_STATE_TRANSITION'))).toBeInstanceOf(
      InvalidStateTransitionError,
    )
    expect(toAppError(409, envelope('IDEMPOTENCY_CONFLICT'))).toBeInstanceOf(
      IdempotencyConflictError,
    )
    expect(toAppError(409, envelope('CONFLICT'))).toBeInstanceOf(ConflictError)
  })

  it('carries the correlation ID so support can trace the failure', () => {
    expect(toAppError(500, envelope('INTERNAL_ERROR')).correlationId).toBe(
      'corr_abc123',
    )
  })

  it('falls back to the header correlation ID when the body omits one', () => {
    const error = toAppError(
      500,
      { error: { code: 'INTERNAL_ERROR', message: 'x' } },
      'corr_header',
    )
    expect(error.correlationId).toBe('corr_header')
  })

  it('carries field errors for validation failures', () => {
    const error = toAppError(
      400,
      envelope('VALIDATION_ERROR', 'invalid', {
        details: [{ field: 'reason', message: 'required' }],
      }),
    )
    expect(error.fieldErrors).toEqual([{ field: 'reason', message: 'required' }])
  })

  it('falls back to the HTTP status when no code is present', () => {
    expect(toAppError(403, undefined)).toBeInstanceOf(ForbiddenError)
    expect(toAppError(404, {})).toBeInstanceOf(NotFoundError)
  })

  it('falls back to InternalError for an unrecognised status', () => {
    expect(toAppError(503, undefined)).toBeInstanceOf(InternalError)
  })

  it('never leaks record data through a 403 message', () => {
    // plan.md §3.4: the forbidden message must be generic.
    const error = toAppError(403, undefined)
    expect(error.message).not.toMatch(/usr_|wdr_|clb_/)
  })
})

describe('error predicates', () => {
  it('identifies app errors', () => {
    expect(isAppError(toAppError(404, undefined))).toBe(true)
    expect(isAppError(new Error('plain'))).toBe(false)
  })

  it('treats 4xx as client errors so they are never retried', () => {
    expect(isClientError(new ForbiddenError())).toBe(true)
    expect(isClientError(new NotFoundError())).toBe(true)
    expect(isClientError(new InternalError())).toBe(false)
  })
})
