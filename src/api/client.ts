import { API_URL } from '@/env'
import { isFinancialMutation, newCorrelationId } from '@/lib/idempotency'
import { errorEnvelopeSchema } from '@/types/common'
import type { z } from 'zod'

import {
  ContractViolationError,
  NetworkError,
  toAppError,
  UnauthorizedError,
} from './errors'

export interface RequestOptions {
  /** Query parameters. `undefined` and empty-string values are dropped. */
  params?: Record<string, string | number | boolean | undefined | null>
  /** JSON request body. */
  body?: unknown
  /** Cancels the request — used by search/filter changes (plan.md §2.1). */
  signal?: AbortSignal
  /**
   * Required for financial mutations. Generate once per user intent and reuse
   * across retries so a repeat returns the original outcome.
   */
  idempotencyKey?: string
  /**
   * Zod schema for the response. Supplied for high-risk resources (wallet,
   * ledger, payment, withdrawal) so wrong finance data surfaces as an explicit
   * error rather than rendering silently (plan.md §2.6).
   */
  schema?: z.ZodType
  /** Label used in contract-violation messages. */
  resource?: string
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

/** Listener notified on any 401 so the session layer can sign the admin out. */
type UnauthorizedHandler = () => void

let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler
}

function buildUrl(path: string, params: RequestOptions['params']): string {
  const url = new URL(`${API_URL}${path}`, window.location.origin)

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

/**
 * Log a failure without ever leaking credentials.
 *
 * plan.md §2.1: never log auth headers, secrets, private content or full
 * payment payloads. Only the method, path, status and correlation ID.
 */
function logFailure(
  method: Method,
  path: string,
  status: number,
  correlationId: string,
): void {
  console.error(
    `[api] ${method} ${path} failed with ${status} (correlationId: ${correlationId})`,
  )
}

async function request<TResult>(
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<TResult> {
  const correlationId = newCorrelationId()

  /*
   * plan.md §10: financial mutations must be idempotent. Failing loudly here
   * is deliberate — a money-moving request that could be silently duplicated
   * is a defect, not something to paper over at runtime.
   */
  if (isFinancialMutation(method, path) && !options.idempotencyKey) {
    throw new Error(
      `Financial mutation ${method} ${path} requires an idempotencyKey. ` +
        'Generate one with newIdempotencyKey() and reuse it across retries. See plan.md §10.',
    )
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Correlation-Id': correlationId,
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.params), {
      method,
      headers,
      // Session lives in an HttpOnly cookie where the backend supports it.
      credentials: 'include',
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })
  } catch (error) {
    /*
     * A cancellation is not a failure — it means the operator changed a filter
     * and we superseded the request. Runtimes disagree on what an aborted
     * fetch rejects with (DOMException in browsers, a plain Error under
     * undici), so detect it from the signal as well as the error name and
     * normalise to a single AbortError the callers can rely on.
     */
    const aborted =
      options.signal?.aborted === true ||
      (error instanceof Error && error.name === 'AbortError')

    if (aborted) {
      throw error instanceof Error && error.name === 'AbortError'
        ? error
        : new DOMException('The request was aborted.', 'AbortError')
    }

    throw new NetworkError()
  }

  const responseCorrelationId =
    response.headers.get('X-Correlation-Id') ?? correlationId

  if (response.status === 204) {
    return undefined as TResult
  }

  const rawText = await response.text()
  let parsedBody: unknown = undefined

  if (rawText.length > 0) {
    try {
      parsedBody = JSON.parse(rawText)
    } catch {
      parsedBody = undefined
    }
  }

  if (!response.ok) {
    const envelope = errorEnvelopeSchema.safeParse(parsedBody)
    const appError = toAppError(
      response.status,
      envelope.success ? envelope.data : undefined,
      responseCorrelationId,
    )

    logFailure(method, path, response.status, responseCorrelationId)

    if (appError instanceof UnauthorizedError) {
      onUnauthorized?.()
    }

    throw appError
  }

  if (!options.schema) {
    return parsedBody as TResult
  }

  const validated = options.schema.safeParse(parsedBody)
  if (!validated.success) {
    const issues = validated.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    )
    console.error(
      `[api] Contract violation on ${method} ${path} (correlationId: ${responseCorrelationId})`,
      issues,
    )
    throw new ContractViolationError(
      options.resource ?? path,
      issues,
      responseCorrelationId,
    )
  }

  return validated.data as TResult
}

/**
 * The single HTTP client.
 *
 * plan.md §2.1 / §7: every request in the application goes through here, so
 * auth, correlation IDs, idempotency, error parsing and contract validation
 * are applied uniformly and cannot be forgotten by a feature.
 */
export const apiClient = {
  get: <TResult>(path: string, options?: RequestOptions) =>
    request<TResult>('GET', path, options),
  post: <TResult>(path: string, options?: RequestOptions) =>
    request<TResult>('POST', path, options),
  patch: <TResult>(path: string, options?: RequestOptions) =>
    request<TResult>('PATCH', path, options),
  put: <TResult>(path: string, options?: RequestOptions) =>
    request<TResult>('PUT', path, options),
  delete: <TResult>(path: string, options?: RequestOptions) =>
    request<TResult>('DELETE', path, options),
}
