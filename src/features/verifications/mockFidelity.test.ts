import { beforeEach, describe, expect, it } from 'vitest'

import { isAppError } from '@/api/errors'
import {
  fetchVerification,
  fetchVerificationDocument,
  fetchVerifications,
  submitVerificationDecision,
} from '@/api/verifications'
import { clearSession, setSession } from '@/auth/tokenStore'
import { API_URL } from '@/env'
import {
  mockVerificationDocumentViews,
  resetMockVerifications,
} from '@/mocks/handlers/verifications'
import { VERIFICATION_VIEWABLE_PDF_TYPE } from '@/types/verification'

/**
 * Does the mock actually behave like the live service?
 *
 * One `describe` per trap in plan.md §3, driven through the **real**
 * `api/verifications.ts` rather than by reaching into the handler. Without this
 * file, "the mock reproduces the traps" is a claim in a comment; with it, the
 * claim fails a test when it stops being true.
 *
 * Every expectation here was observed against the live API on **2026-09-29**.
 */

const APPROVED_IDENTITY = 'cmulfjl62000201r33hha40xi'
const PENDING_BUSINESS = 'cmu04s71l003701oi3wvzvbdp'

beforeEach(() => {
  resetMockVerifications()
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the queue default is not "everything" (§3.8)', () => {
  it('returns only the pending applications when `status` is omitted', async () => {
    /*
     * ⚠️ The query TYPE makes `status` required, so the cast is the only way to
     * reach this path — and that is the point: a regression has to go out of its
     * way to get here. Live, omitting it returned 3 of 5 rows.
     */
    const page = await fetchVerifications({} as never)

    expect(page.total).toBe(3)
    expect(page.requests.every((row) => row.status === 'PENDING')).toBe(true)
  })

  it('returns all five only when `ALL` is asked for explicitly', async () => {
    expect((await fetchVerifications({ status: 'ALL' })).total).toBe(5)
  })
})

describe('`PENDING` and `PENDING_REVIEW` are aliases (§3.2)', () => {
  it('returns the same rows for both', async () => {
    const pending = await fetchVerifications({ status: 'PENDING' })
    const pendingReview = await fetchVerifications({ status: 'PENDING_REVIEW' })

    expect(pending.total).toBe(pendingReview.total)
    expect(pending.requests.map((row) => row.id)).toEqual(
      pendingReview.requests.map((row) => row.id),
    )
  })

  it('serves rows holding the undocumented `PENDING` value', async () => {
    const page = await fetchVerifications({ status: 'PENDING' })

    /* The doc documents `PENDING_REVIEW` and omits this. The data disagrees. */
    expect(page.requests[0]?.status).toBe('PENDING')
  })

  it('rejects a status outside the six, listing all of them', async () => {
    await expect(fetchVerifications({ status: 'ARCHIVED' as never })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message.includes('querystring/status') &&
        error.message.includes("'PENDING' | 'PENDING_REVIEW'") &&
        error.message.includes("'REVOKED'"),
    )
  })
})

describe('pagination echoes rather than clamps (§3.9)', () => {
  it('answers 200 with the page echoed and no rows', async () => {
    const page = await fetchVerifications({ status: 'ALL', page: 99 })

    expect(page.page).toBe(99)
    expect(page.totalPages).toBe(1)
    expect(page.requests).toEqual([])
    /*
     * ⚠️ `total` still reports 5. An empty state chosen from `totalPages` or
     * `total` would claim there is a page to show; only `requests.length` is
     * the truth.
     */
    expect(page.total).toBe(5)
  })

  it('rejects a limit above 100, in the server’s own words', async () => {
    await expect(fetchVerifications({ status: 'ALL', limit: 200 })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message.includes('Number must be less than or equal to 100'),
    )
  })
})

describe('nobody is named on a business application (§3.4)', () => {
  it('returns an applicant object with every field null', async () => {
    const detail = await fetchVerification(PENDING_BUSINESS)

    /* Present, so `!applicant` does not catch it. */
    expect(detail.applicant).not.toBeNull()
    expect(detail.applicant?.displayName).toBeNull()
    expect(detail.applicant?.email).toBeNull()
    expect(detail.applicant?.phone).toBeNull()
    /* Populated and meaningless — the field that makes the shell look filled. */
    expect(detail.applicant?.accountType).toBe('PERSONAL')
  })

  it('puts the name on `business` instead', async () => {
    expect((await fetchVerification(PENDING_BUSINESS)).business?.companyName).toBe(
      'DeliGo',
    )
  })

  it('matches a company name on search', async () => {
    const page = await fetchVerifications({ status: 'ALL', search: 'deligo' })

    expect(page.requests).toHaveLength(1)
    expect(page.requests[0]?.business?.companyName).toBe('DeliGo')
  })
})

describe('an application can have nothing to review (§3.5)', () => {
  it('serves zero documents and zero audit rows', async () => {
    const detail = await fetchVerification(PENDING_BUSINESS)

    expect(detail.documents).toEqual([])
    /* Not even a `SUBMITTED` row — verified on a live application. */
    expect(detail.auditLogs).toEqual([])
  })

  it('reports `documentCount: 0` on the queue row', async () => {
    const page = await fetchVerifications({ status: 'PENDING' })

    expect(page.requests.every((row) => row.documentCount === 0)).toBe(true)
  })

  it('omits `documentCount` from the detail, which the list carries', async () => {
    /* Two routes, two projections — count the array on the detail instead. */
    expect((await fetchVerification(PENDING_BUSINESS)).documentCount).toBeUndefined()
    expect(
      (await fetchVerifications({ status: 'PENDING' })).requests[0]?.documentCount,
    ).toBe(0)
  })
})

describe('the audit trail carries admin IP addresses (§3.7)', () => {
  it('returns `ipAddress` and `userAgent` on an admin action', async () => {
    const detail = await fetchVerification(APPROVED_IDENTITY)
    const approval = detail.auditLogs?.find((row) => row.action === 'APPROVED')

    expect(approval?.ipAddress).toBe('113.11.34.102')
    expect(approval?.userAgent).toBeTruthy()
  })

  it('records them on the applicant’s own submission too', async () => {
    /*
     * ⚠️ Corrected 2026-09-29 against a captured live payload: the `SUBMITTED`
     * row carries an IP and a user agent as well, so the trail holds the
     * **applicant's** network address, not only staff ones.
     *
     * That widens §3.7 rather than softening it — the disclosure is hiding a
     * member of the public's IP as well as a colleague's.
     */
    const detail = await fetchVerification(APPROVED_IDENTITY)
    const submitted = detail.auditLogs?.find((row) => row.action === 'SUBMITTED')

    expect(submitted?.ipAddress).toBeTruthy()
    expect(submitted?.metadata?.['documentCount']).toBe(1)
  })

  it('returns audit rows newest first', async () => {
    /* The opposite of a reply stream — and the timeline must not re-sort. */
    const detail = await fetchVerification(APPROVED_IDENTITY)
    const times = (detail.auditLogs ?? []).map((row) => Date.parse(row.createdAt))

    expect(times).toEqual([...times].sort((a, b) => b - a))
  })
})

describe('the document stream (§2.6, §3.3)', () => {
  it('returns real decrypted bytes with the vault’s content type', async () => {
    const document = await fetchVerificationDocument(APPROVED_IDENTITY, 0)

    expect(document.contentType).toBe(VERIFICATION_VIEWABLE_PDF_TYPE)
    expect(await document.blob.text()).toContain('%PDF')
  })

  it('hands back a Blob and never an object URL', async () => {
    /*
     * ⚠️ `URL.createObjectURL` pins the blob to the document until revoked, and
     * only the component that mounts the viewer knows when that is. An API layer
     * that created one would have no way to revoke it (plan.md §3.3).
     */
    const document = await fetchVerificationDocument(APPROVED_IDENTITY, 0)

    /*
     * Duck-typed rather than `toBeInstanceOf(Blob)`. Under vitest the response
     * body comes from undici's realm, so its `Blob` is a different constructor
     * from jsdom's global one and the instance check fails on a value that is a
     * perfectly good Blob. What this test cares about is that it is binary and
     * NOT a string URL, which the shape establishes.
     */
    expect(typeof document.blob.arrayBuffer).toBe('function')
    expect(typeof document.blob).not.toBe('string')
    expect(document).not.toHaveProperty('url')
    expect(document).not.toHaveProperty('objectUrl')
  })

  it('does NOT hand back a file name, because the browser cannot read one', async () => {
    /*
     * ⚠️ This assertion is inverted from V0's, and the inversion is the point.
     * V0 parsed `Content-Disposition` into a `fileName`, hedged as "when CORS
     * exposes it". A preflight against the live route on 2026-09-30 showed the
     * full exposure list:
     *
     *     access-control-expose-headers: X-Request-ID
     *
     * `Content-Disposition` is not CORS-safelisted and is not on that list, and
     * the panel is cross-origin from the API, so the header is unreadable in a
     * browser and the parsed name was **always null in production**.
     *
     * It resolved here, though, because MSW serves the header and no test
     * enforces CORS. That is precisely the trap: a field populated in every test
     * and null in every browser would have titled the viewer, passed the suite,
     * and shipped a blank heading over a stranger's passport. So the field is
     * gone, the viewer titles itself from the manifest, and this test stands
     * guard over the deletion.
     */
    const document = await fetchVerificationDocument(APPROVED_IDENTITY, 0)

    expect(document).not.toHaveProperty('fileName')
    expect(Object.keys(document).sort()).toEqual(['blob', 'contentType'])
  })

  it('still serves the header, so the mock stays faithful to the wire', async () => {
    /*
     * The vault really does send it (§2.6) — the mock must keep doing so. What
     * changed is who may read it: a same-origin deployment or a future
     * `expose-headers` fix would make it readable again, and the mock should not
     * quietly stop representing the response.
     */
    const response = await fetch(
      `${API_URL}/admin/verifications/${APPROVED_IDENTITY}/document/0`,
      { headers: { Authorization: 'Bearer test-token' } },
    )

    expect(response.headers.get('Content-Disposition')).toBe(
      'inline; filename="_Weil_ Full.pdf"',
    )
  })

  it('writes one audit row per fetch, and only on a fetch', async () => {
    /*
     * ⚠️ The most important assertion in this file. Every call to this route
     * records the acting admin's id, IP and user agent against a stranger's
     * identity document, so two calls are two claims that a human looked.
     */
    expect(mockVerificationDocumentViews()).toEqual([])

    await fetchVerification(APPROVED_IDENTITY)
    /* Reading the manifest is not looking at the document. */
    expect(mockVerificationDocumentViews()).toEqual([])

    await fetchVerificationDocument(APPROVED_IDENTITY, 0)
    expect(mockVerificationDocumentViews()).toEqual([
      { id: APPROVED_IDENTITY, docIndex: 0 },
    ])
  })

  it('refuses an anonymous request with a 401', async () => {
    clearSession()

    await expect(fetchVerificationDocument(APPROVED_IDENTITY, 0)).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.status === 401,
    )

    /* And it did not count as a view. */
    expect(mockVerificationDocumentViews()).toEqual([])
  })

  it('distinguishes a bad index from an unknown application', async () => {
    /* Two different 404 messages, both verified — the panel shows different copy. */
    await expect(fetchVerificationDocument(APPROVED_IDENTITY, 7)).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message === 'Document manifest at index not found',
    )

    await expect(fetchVerificationDocument('nope', 0)).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message === 'Verification request not found',
    )
  })

  it('does not exist for an application with no documents', async () => {
    await expect(fetchVerificationDocument(PENDING_BUSINESS, 0)).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message === 'Document manifest at index not found',
    )
  })
})

describe('a rejection can carry no reason (§3.6)', () => {
  it('accepts a REJECT with no `rejectionReason`', async () => {
    /*
     * ⚠️ Returns 200 live. The payload type requires both fields, so the cast is
     * the only route here — and that is the guard. The applicant would otherwise
     * be refused and handed nothing to act on.
     */
    const result = await submitVerificationDecision(PENDING_BUSINESS, {
      action: 'REJECT',
      rejectionCode: 'BLURRY_DOCUMENT',
    } as never)

    expect(result.status).toBe('REJECTED')
    expect((await fetchVerification(PENDING_BUSINESS)).rejectionReason).toBeNull()
  })

  it('accepts a REJECT with no `rejectionCode`', async () => {
    const result = await submitVerificationDecision(PENDING_BUSINESS, {
      action: 'REJECT',
      rejectionReason: 'too blurry to read',
    } as never)

    expect(result.status).toBe('REJECTED')
    expect((await fetchVerification(PENDING_BUSINESS)).rejectionCode).toBeNull()
  })

  it('rejects a `rejectionCode` outside the six', async () => {
    await expect(
      submitVerificationDecision(PENDING_BUSINESS, {
        action: 'REJECT',
        rejectionCode: 'TOO_UGLY' as never,
        rejectionReason: 'a genuine sentence',
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('body/rejectionCode'),
    )
  })
})

describe('`APPROVED` is not terminal (§3.1)', () => {
  it('rejects an already-approved application, and returns 200', async () => {
    /*
     * ⚠️ `verification_doc.md` calls `APPROVED` a "Terminal state (Immutable)".
     * It is not. This was discovered by doing it to a real applicant's record —
     * plan.md §8 O5 — and the mock preserves it so the confirm dialog in V4 has
     * something to guard.
     */
    expect((await fetchVerification(APPROVED_IDENTITY)).status).toBe('APPROVED')

    const result = await submitVerificationDecision(APPROVED_IDENTITY, {
      action: 'REJECT',
      rejectionCode: 'NAME_MISMATCH',
      rejectionReason: 'The name does not match the profile on the account.',
    })

    expect(result.status).toBe('REJECTED')
  })

  it('loses the original `reviewedAt` when it does', async () => {
    /*
     * The other half of what went wrong live: the first decision's timestamp is
     * overwritten, not kept beside the new one. Only the audit trail remembers.
     */
    const before = await fetchVerification(APPROVED_IDENTITY)
    await submitVerificationDecision(APPROVED_IDENTITY, { action: 'APPROVE' })
    const after = await fetchVerification(APPROVED_IDENTITY)

    expect(after.reviewedAt).not.toBe(before.reviewedAt)
  })

  it('appends to the audit trail rather than replacing it', async () => {
    const before = await fetchVerification(APPROVED_IDENTITY)
    await submitVerificationDecision(APPROVED_IDENTITY, { action: 'APPROVE' })
    const after = await fetchVerification(APPROVED_IDENTITY)

    expect(after.auditLogs?.length).toBe((before.auditLogs?.length ?? 0) + 1)
    expect(after.auditLogs?.at(-1)?.ipAddress).toBeTruthy()
  })
})

describe('decision validation, in the server’s own words', () => {
  it('rejects a body with no `action`', async () => {
    await expect(
      submitVerificationDecision(PENDING_BUSINESS, {} as never),
    ).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.message === 'body/action Required',
    )
  })

  it('rejects a lowercase action', async () => {
    await expect(
      submitVerificationDecision(PENDING_BUSINESS, { action: 'approve' } as never),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message.includes("Expected 'APPROVE' | 'REJECT', received 'approve'"),
    )
  })

  it('404s on an unknown application', async () => {
    await expect(
      submitVerificationDecision('nope', { action: 'APPROVE' }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message === 'Verification request not found',
    )
  })
})

describe('the decision response cannot paint a screen', () => {
  it('carries three keys and nothing renderable', async () => {
    const result = await submitVerificationDecision(APPROVED_IDENTITY, {
      action: 'APPROVE',
      adminNotes: 'Re-checked against the registry.',
    })

    expect(Object.keys(result).sort()).toEqual(['id', 'reviewedAt', 'status'])
    expect(result).not.toHaveProperty('documents')
    expect(result).not.toHaveProperty('applicant')
  })

  it('stores `adminNotes` even though the response does not echo it', async () => {
    /* The write worked; only a refetch shows it. */
    await submitVerificationDecision(APPROVED_IDENTITY, {
      action: 'APPROVE',
      adminNotes: 'Re-checked against the registry.',
    })

    expect((await fetchVerification(APPROVED_IDENTITY)).adminNotes).toBe(
      'Re-checked against the registry.',
    )
  })
})
