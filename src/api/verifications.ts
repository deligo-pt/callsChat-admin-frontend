import type { z } from 'zod'

import { apiClient } from '@/api/client'
import { NetworkError, toAppError } from '@/api/errors'
import { getAccessToken } from '@/auth/tokenStore'
import { API_URL } from '@/env'
import { newCorrelationId } from '@/lib/idempotency'
import {
  verificationDecisionResponseSchema,
  verificationDetailResponseSchema,
  verificationListResponseSchema,
  type Verification,
  type VerificationDecisionPayload,
  type VerificationDecisionResult,
  type VerificationListQuery,
} from '@/types/verification'

/**
 * Verification & Compliance API — identity (KYC) and business (KYB) review
 * (plan.md §2.1).
 *
 * In `api/` rather than `features/verifications/api.ts` because the document
 * stream needs its own request path beside `apiClient` — it returns binary, and
 * `request()` parses every response as JSON — and because `eslint.config.js`
 * forbids a layout or a sibling feature from importing `features/*`.
 *
 * ⚠️ **Every call in this file touches a stranger's government identity
 * documents.** Four rules hold across it, and none of them is stylistic:
 *
 * 1. **`status` is always sent on the list route.** Omitting it silently
 *    filters to the pending applications — 3 of 5 live rows (plan.md §3.8).
 *    The query type makes it a required key.
 * 2. **The document path is built here, from ids.** The manifest's `previewUrl`
 *    is never used as a fetch target, so no server-supplied string can point a
 *    credentialed request somewhere else.
 * 3. **{@link fetchVerificationDocument} returns a `Blob`, never an object
 *    URL.** Whoever creates the URL must revoke it, and only the component that
 *    mounts the viewer knows when that is (plan.md §3.3).
 * 4. **Nothing here prefetches.** Every call to the document route writes an
 *    audit row naming the acting admin and their IP address, so a speculative
 *    fetch would forge a record of a human opening someone's passport. Callers
 *    fetch on an explicit action and nowhere else.
 */

/**
 * `GET /admin/verifications`.
 *
 * Returns the `{ success, data: { total, page, limit, totalPages, requests } }`
 * envelope — the third distinct list shape on this backend (plan.md §2.2).
 *
 * ⚠️ `page` is **echoed, not clamped**: `?page=99` against a single-page result
 * answers 200 with `page: 99` and `requests: []`. Callers choose the empty
 * state from `requests.length`, never from `totalPages`.
 */
export function fetchVerifications(
  query: VerificationListQuery,
  signal?: AbortSignal,
): Promise<{
  readonly requests: readonly Verification[]
  readonly total: number
  readonly page: number
  readonly limit: number
  readonly totalPages: number
}> {
  return apiClient
    .get<z.infer<typeof verificationListResponseSchema>>('/admin/verifications', {
      params: {
        ...(query.page !== undefined ? { page: query.page } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        /* Never conditional — see rule 1 above. */
        status: query.status,
        ...(query.targetType !== undefined ? { targetType: query.targetType } : {}),
        ...(query.search ? { search: query.search } : {}),
      },
      schema: verificationListResponseSchema,
      resource: 'verifications',
      ...(signal ? { signal } : {}),
    })
    .then((response) => response.data)
}

/**
 * `GET /admin/verifications/:id`.
 *
 * Adds the decision fields, the document manifest and the audit trail to the
 * list shape. All three can be empty or null on a real, live application
 * (plan.md §3.5, §3.6).
 *
 * `404 "Verification request not found"` for an unknown id, verified.
 */
export function fetchVerification(
  id: string,
  signal?: AbortSignal,
): Promise<Verification> {
  return apiClient
    .get<z.infer<typeof verificationDetailResponseSchema>>(
      `/admin/verifications/${encodeURIComponent(id)}`,
      {
        schema: verificationDetailResponseSchema,
        resource: 'verification',
        ...(signal ? { signal } : {}),
      },
    )
    .then((response) => response.data)
}

/**
 * `PATCH /admin/verifications/:id/decision`.
 *
 * ⚠️ **This is not an idempotent write and it is not one-way.** `APPROVED` is
 * documented *"Terminal state (Immutable)"* and is nothing of the kind: a
 * `REJECT` against an approved application returns 200 and rejects it
 * (plan.md §3.1). Callers confirm every decision, and name the existing one
 * when there is one.
 *
 * ⚠️ The response is validated down to `{ id, status, reviewedAt }` and must
 * **never** seed a cache or paint a screen. A decision changes the application,
 * its audit trail and the applicant's account together; only
 * {@link fetchVerification} shows the result.
 */
export function submitVerificationDecision(
  id: string,
  payload: VerificationDecisionPayload,
): Promise<VerificationDecisionResult> {
  return apiClient
    .patch<z.infer<typeof verificationDecisionResponseSchema>>(
      `/admin/verifications/${encodeURIComponent(id)}/decision`,
      {
        /*
         * Spread as given. Nothing is added to the body behind the caller's
         * back — in particular the panel never sends a `rejectionCode` it
         * inferred, because that string is what the applicant is shown.
         */
        body: { ...payload },
        schema: verificationDecisionResponseSchema,
        resource: 'verification-decision',
      },
    )
    .then((response) => response.data)
}

/** A decrypted document, in memory. */
export interface VerificationDocumentBlob {
  /**
   * The decrypted bytes.
   *
   * ⚠️ Deliberately a `Blob` and **not** an object URL. `URL.createObjectURL`
   * pins the blob to the document until it is revoked, and only the component
   * that mounts the viewer knows when that is — so the URL is created and
   * revoked there, in one place, under one lifecycle (plan.md §3.3).
   */
  readonly blob: Blob
  /**
   * From the response, not from the manifest. Picks the renderer.
   *
   * Readable cross-origin because `Content-Type` is a CORS-safelisted response
   * header. `Content-Disposition` is **not** — see below.
   */
  readonly contentType: string
}

/*
 * ⚠️ **There is deliberately no `fileName` here, and the reason is worth
 * keeping.** V0 returned one, parsed from `Content-Disposition`, hedged with
 * "when CORS exposes it". A preflight against the live route on 2026-09-30
 * settled it:
 *
 *     access-control-expose-headers: X-Request-ID
 *
 * That is the whole list. `Content-Disposition` is not CORS-safelisted and is
 * not exposed, and the panel is cross-origin from the API
 * (`admin.callschat.com` → `api.callschat.com`), so in a browser that header is
 * unreadable and the parsed name was **always `null` in production**.
 *
 * Under MSW it would have resolved, because the mock serves the header and no
 * test enforces CORS. A field that is populated in every test and null in every
 * browser is worse than no field: the viewer would have titled itself from it,
 * looked right in the suite, and shipped with a blank heading over a stranger's
 * passport.
 *
 * The manifest's `originalName` is the source of truth for the name, it arrives
 * with the record the operator is already looking at, and it costs no extra
 * request. Backend ask #6 asks for the header to be exposed anyway, since the
 * response is the only authority on what the bytes actually are.
 */

/**
 * `GET /admin/verifications/:id/document/:docIndex` — the decrypted stream.
 *
 * ⚠️ **Calling this is an audited act.** The backend writes a
 * `VIEWED_DOCUMENT` row with the acting admin's id, IP address and user agent
 * on every request. It must therefore be called only in response to a person
 * deciding to look: no prefetch, no hover, no warm-up on mount. A speculative
 * call fabricates evidence that a human opened someone's identity document.
 *
 * ⚠️ **No `download` anchor, ever.** `downloadFile` in `api/client.ts` exists
 * for the CSV export and is the wrong tool here: it writes the bytes to the
 * operator's disk, outside every guarantee the KYC vault makes (plan.md §1.2).
 * This function hands back a `Blob` and nothing else.
 *
 * The path is built from `id` and `docIndex` rather than taken from the
 * manifest's `previewUrl`, so a server-supplied string can never redirect a
 * request that carries a bearer token.
 *
 * Verified live 2026-09-29: `200` with `Content-Type: application/pdf`,
 * `Content-Disposition: inline`, `Cache-Control: private, no-cache, no-store,
 * must-revalidate` and `X-Content-Type-Options: nosniff`; `401` with no token;
 * `404 "Document manifest at index not found"` for a bad index; and
 * `404 "Verification request not found"` for an unknown id.
 */
export async function fetchVerificationDocument(
  id: string,
  docIndex: number,
  signal?: AbortSignal,
): Promise<VerificationDocumentBlob> {
  const correlationId = newCorrelationId()
  const path = `/admin/verifications/${encodeURIComponent(id)}/document/${String(docIndex)}`

  const headers: Record<string, string> = { 'X-Request-ID': correlationId }
  const accessToken = getAccessToken()
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'GET',
      headers,
      /* The bearer header is the credential; cookies are not issued here. */
      credentials: 'omit',
      /*
       * `no-store`, matching what the server already asks for. A decrypted
       * national ID must not sit in the HTTP cache after the tab is closed.
       */
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    })
  } catch (error) {
    const aborted =
      signal?.aborted === true ||
      (error instanceof Error && error.name === 'AbortError')
    if (aborted) throw error
    throw new NetworkError()
  }

  if (!response.ok) {
    /* The error path IS JSON even though the success path is binary. */
    let parsed: unknown
    try {
      parsed = JSON.parse(await response.text())
    } catch {
      parsed = undefined
    }

    const appError = toAppError(response.status, parsed, correlationId)
    /*
     * Logged without the id. A verification request id identifies one
     * applicant's KYC file, and console output is the least controlled surface
     * in the app — `api/client.ts` logs the path because its paths are generic.
     */
    console.error(
      `[api] GET /admin/verifications/:id/document/:docIndex failed with ${String(response.status)} (correlationId: ${correlationId})`,
    )
    /*
     * Deliberately NOT calling the panel's 401 handler or attempting the
     * refresh-and-replay that `request()` does. A replay would write a second
     * `VIEWED_DOCUMENT` audit row for one human action, and an expired token on
     * this route is better surfaced as "open it again" than papered over. The
     * next ordinary API call renews the session.
     */
    throw appError
  }

  /*
   * `Content-Type` only. `Content-Disposition` is deliberately not read — it is
   * not exposed cross-origin, verified by preflight 2026-09-30 (see the note on
   * {@link VerificationDocumentBlob}).
   */
  const contentType = response.headers.get('Content-Type') ?? 'application/octet-stream'

  return { blob: await response.blob(), contentType }
}
