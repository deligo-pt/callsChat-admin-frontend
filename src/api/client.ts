import { getAccessToken } from '@/auth/tokenStore'
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

/**
 * Attempts to renew the session. Resolves true if a new access token is now
 * available. Injected by the auth layer to keep this module free of any
 * dependency on it — `client` must not import `session`, which imports
 * `client`.
 */
type RefreshHandler = () => Promise<boolean>

let onRefresh: RefreshHandler | null = null
/** Paths for which a 401 is the final answer, never a trigger to refresh. */
let isAuthPath: (path: string) => boolean = () => false

export function setRefreshHandler(
  handler: RefreshHandler | null,
  authPathMatcher?: (path: string) => boolean,
): void {
  onRefresh = handler
  isAuthPath = authPathMatcher ?? (() => false)
}

/**
 * The in-flight refresh, shared by every request that 401s while it runs.
 *
 * Without this, a dashboard firing six parallel queries against an expired
 * token would start six refreshes — five of which would present an
 * already-rotated refresh token and fail, logging the operator out mid-session.
 */
let refreshInFlight: Promise<boolean> | null = null

function refreshOnce(): Promise<boolean> {
  refreshInFlight ??= (onRefresh?.() ?? Promise.resolve(false)).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
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
  /** Internal: set on the single post-refresh retry so it cannot recurse. */
  isRetry = false,
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
    /*
     * `X-Request-ID`, NOT `X-Correlation-Id`.
     *
     * The API's CORS policy allows exactly: Content-Type, Authorization,
     * X-Request-ID, x-workspace-id. Sending any other custom header fails the
     * preflight and the browser blocks the request outright — so the name here
     * is a hard constraint, not a preference. It is also on
     * `access-control-expose-headers`, which means we can read the server's
     * value back off the response and hand support a real trace ID.
     */
    'X-Request-ID': correlationId,
  }

  /*
   * plan.md §10.1: bearer auth, verified live. Cookies are not issued by this
   * backend and a Cookie header is ignored, so this is the only credential
   * path. Attached here and nowhere else.
   */
  const accessToken = getAccessToken()
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
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
      /*
       * Deliberately 'omit'. The credential is the bearer header above; asking
       * for cookies as well would gain nothing and would make the request fail
       * outright against a wildcard CORS origin.
       */
      credentials: 'omit',
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

  // Prefer the server's own ID when it sends one — that is what its logs hold.
  const responseCorrelationId = response.headers.get('X-Request-ID') ?? correlationId

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

    /*
     * A 401 on an ordinary request means the access token expired. Try to
     * renew it once and replay the request, so a long-lived tab does not throw
     * the operator back to the sign-in screen mid-task.
     *
     * Excluded: the auth endpoints themselves (a 401 from `login` IS the
     * answer, and refreshing `refresh` would recurse) and any request that is
     * already the retry.
     */
    if (appError instanceof UnauthorizedError && !isRetry && !isAuthPath(path)) {
      const renewed = await refreshOnce()
      if (renewed) {
        return request<TResult>(method, path, options, true)
      }
    }

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
/**
 * Fetch a file and hand it to the browser as a download.
 *
 * `request()` cannot serve this: it parses every response as JSON, and the
 * export endpoint returns `text/csv`. This is deliberately a separate function
 * rather than a `responseType` flag, because a download is not a data fetch —
 * it never feeds React state, has no schema to validate, and must not be
 * cached by the query layer.
 *
 * The bearer token is attached exactly as elsewhere, which is also why a plain
 * `<a href>` will not do: the endpoint requires an Authorization header.
 */
export async function downloadFile(
  path: string,
  options: { params?: RequestOptions['params']; fallbackFilename: string },
): Promise<void> {
  const correlationId = newCorrelationId()
  const headers: Record<string, string> = { 'X-Request-ID': correlationId }

  const accessToken = getAccessToken()
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.params), {
      method: 'GET',
      headers,
      credentials: 'omit',
    })
  } catch {
    throw new NetworkError()
  }

  if (!response.ok) {
    // An error response IS json even though the success path is not.
    let parsed: unknown
    try {
      parsed = await response.json()
    } catch {
      parsed = undefined
    }
    const appError = toAppError(response.status, parsed, correlationId)
    logFailure('GET', path, response.status, correlationId)
    if (appError instanceof UnauthorizedError) onUnauthorized?.()
    throw appError
  }

  /*
   * Prefer the server's filename. `Content-Disposition` is exposed by this
   * API's CORS policy for the export route; when it is not readable the
   * caller's fallback is used rather than producing a file called "download".
   */
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  const filename = match?.[1]?.trim() || options.fallbackFilename

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)

  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    // Without this the blob is retained for the lifetime of the document.
    URL.revokeObjectURL(url)
  }
}

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
