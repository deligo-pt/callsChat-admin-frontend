import { describe, expect, it } from 'vitest'

import {
  verificationDecisionResponseSchema,
  verificationDetailResponseSchema,
  verificationListResponseSchema,
  VERIFICATION_REJECTION_CODE_VALUES,
  VERIFICATION_STATUS_VALUES,
} from '@/types/verification'

/**
 * The contract, against payloads captured from the live service on
 * **2026-09-29** (plan.md §2).
 *
 * Every fixture below is a real response body, pasted rather than composed. The
 * feedback module learned that lesson the hard way: a hand-written fixture
 * carried a key the service never sends, and the whole suite went green against
 * a payload that could not exist.
 */

/** `GET /admin/verifications?status=PENDING`, verbatim. */
const LIVE_LIST = {
  success: true,
  data: {
    total: 5,
    page: 1,
    limit: 20,
    totalPages: 1,
    requests: [
      {
        id: 'cmu04s71l003701oi3wvzvbdp',
        targetType: 'BUSINESS_ENTITY',
        userId: null,
        businessId: 'cmu044h68000q01oixu36ov0j',
        workspaceId: null,
        status: 'PENDING',
        idType: null,
        documentCount: 0,
        submittedAt: '2026-09-13T18:11:54.153Z',
        reviewedAt: null,
        /* Every field null, `accountType` populated and meaningless (§3.4). */
        applicant: {
          displayName: null,
          username: null,
          email: null,
          phone: null,
          avatarUrl: null,
          accountType: 'PERSONAL',
        },
        business: {
          id: 'cmu044h68000q01oixu36ov0j',
          companyName: 'DeliGo',
          category: 'Healthcare & Medical',
          isVerified: false,
        },
      },
    ],
  },
}

/** `GET /admin/verifications/:id` on an approved identity check, verbatim. */
const LIVE_DETAIL = {
  success: true,
  data: {
    id: 'cmulfjl62000201r33hha40xi',
    targetType: 'USER_IDENTITY',
    userId: 'cmu9wkz4b000801s6h1hqoe4p',
    businessId: null,
    workspaceId: null,
    status: 'APPROVED',
    idType: 'NATIONAL_ID',
    submittedAt: '2026-09-24T11:02:14.884Z',
    reviewedAt: '2026-09-28T07:41:55.102Z',
    rejectionCode: null,
    rejectionReason: null,
    adminNotes: 'NID watermarks verified against the government registry.',
    applicant: {
      id: 'cmu9wkz4b000801s6h1hqoe4p',
      displayName: 'Rahim Ahmed',
      email: 'rahim@example.com',
      phone: '+8801700000000',
    },
    documents: [
      {
        docIndex: 0,
        originalName: '_Weil_ Full.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 520882,
        uploadedAt: '2026-09-24T11:02:14.884Z',
        previewUrl: '/api/v1/admin/verifications/cmulfjl62000201r33hha40xi/document/0',
      },
    ],
    auditLogs: [
      {
        id: 'cmulfjl62000301r33hha40xz',
        requestId: 'cmulfjl62000201r33hha40xi',
        actorId: 'cmt8orkov00004upco3oifg2v',
        action: 'APPROVED',
        ipAddress: '113.11.34.102',
        userAgent: 'Requestly/1.0',
        metadata: {
          action: 'APPROVE',
          adminNotes: 'NID watermarks verified against the government registry.',
          rejectionCode: null,
          rejectionReason: null,
        },
        createdAt: '2026-09-28T07:41:55.102Z',
      },
    ],
  },
}

describe('the third list envelope (§2.2)', () => {
  it('parses rows under `data.requests`, with the counters beside them', () => {
    const parsed = verificationListResponseSchema.parse(LIVE_LIST)

    expect(parsed.data.requests).toHaveLength(1)
    expect(parsed.data.total).toBe(5)
    expect(parsed.data.totalPages).toBe(1)
  })

  it('rejects the two OTHER envelope shapes this backend also ships', () => {
    /*
     * Three mutually incompatible list shapes now exist, with no rule to derive
     * which a route uses. If either of these ever parses, the schema has been
     * loosened into something that cannot tell them apart — and a page would
     * render zero rows from a response that had five.
     */
    expect(
      verificationListResponseSchema.safeParse({
        success: true,
        data: [LIVE_LIST.data.requests[0]],
        pagination: { page: 1, limit: 20, total: 5, totalPages: 1 },
      }).success,
    ).toBe(false)

    expect(
      verificationListResponseSchema.safeParse({
        success: true,
        data: {
          items: [LIVE_LIST.data.requests[0]],
          meta: { page: 1, limit: 20, total: 5, totalPages: 1 },
        },
      }).success,
    ).toBe(false)
  })

  it('accepts an out-of-range page rather than calling it a contract violation', () => {
    /*
     * ⚠️ `?page=99` answers 200 with `page: 99` echoed and an empty array
     * (§3.9). A `.positive()`-and-clamped schema would turn a navigable empty
     * state into "Something went wrong".
     */
    const parsed = verificationListResponseSchema.parse({
      success: true,
      data: { total: 5, page: 99, limit: 20, totalPages: 1, requests: [] },
    })

    expect(parsed.data.page).toBe(99)
    expect(parsed.data.requests).toEqual([])
  })
})

describe('the applicant shell on business rows (§3.4)', () => {
  it('parses an applicant whose every field is null', () => {
    const parsed = verificationListResponseSchema.parse(LIVE_LIST)
    const row = parsed.data.requests[0]

    /* Present, not absent — so `!applicant` is not enough to detect it. */
    expect(row?.applicant).not.toBeNull()
    expect(row?.applicant?.displayName).toBeNull()
    expect(row?.applicant?.email).toBeNull()
    expect(row?.applicant?.accountType).toBe('PERSONAL')
  })

  it('parses the detail route’s narrower applicant projection too', () => {
    /*
     * The detail projection carries `id` and omits `username`, `avatarUrl` and
     * `accountType` entirely. A key that were `.nullable()` but not
     * `.optional()` would reject this whole response — exactly the bug that took
     * out the feedback ticket page.
     */
    const parsed = verificationDetailResponseSchema.parse(LIVE_DETAIL)

    expect(parsed.data.applicant?.id).toBe('cmu9wkz4b000801s6h1hqoe4p')
    expect(parsed.data.applicant?.username).toBeUndefined()
  })
})

describe('the status vocabulary (§3.2)', () => {
  it('carries five states, including the undocumented one the data uses', () => {
    expect(VERIFICATION_STATUS_VALUES).toEqual([
      'PENDING',
      'PENDING_REVIEW',
      'APPROVED',
      'REJECTED',
      'REVOKED',
    ])
  })

  it('accepts `PENDING`, which `verification_doc.md` never mentions', () => {
    /*
     * The doc documents `PENDING_REVIEW` and omits `PENDING`. Every live row
     * holds `PENDING`, so a schema built from the doc alone would reject the
     * entire queue.
     */
    expect(
      verificationListResponseSchema.parse(LIVE_LIST).data.requests[0]?.status,
    ).toBe('PENDING')
  })
})

describe('the detail route’s additions (§2.4)', () => {
  it('parses the decision fields, the manifest and the audit trail', () => {
    const parsed = verificationDetailResponseSchema.parse(LIVE_DETAIL)

    expect(parsed.data.adminNotes).toContain('watermarks')
    expect(parsed.data.documents?.[0]?.sizeBytes).toBe(520_882)
    expect(parsed.data.auditLogs?.[0]?.action).toBe('APPROVED')
  })

  it('keeps `ipAddress` and `userAgent`, which the doc does not mention (§3.7)', () => {
    const parsed = verificationDetailResponseSchema.parse(LIVE_DETAIL)

    expect(parsed.data.auditLogs?.[0]?.ipAddress).toBe('113.11.34.102')
    expect(parsed.data.auditLogs?.[0]?.userAgent).toBe('Requestly/1.0')
  })

  it('tolerates an application with no documents and no audit rows (§3.5)', () => {
    /*
     * A real, live state: all three pending business applications have zero
     * documents, and one had zero audit rows — not even `SUBMITTED`.
     */
    const parsed = verificationDetailResponseSchema.parse({
      success: true,
      data: { ...LIVE_DETAIL.data, documents: [], auditLogs: [] },
    })

    expect(parsed.data.documents).toEqual([])
    expect(parsed.data.auditLogs).toEqual([])
  })

  it('tolerates an audit action the panel has never heard of', () => {
    /*
     * The doc lists six actions. A seventh must degrade to a humanised label
     * rather than reject the application an operator is trying to read.
     */
    const parsed = verificationDetailResponseSchema.parse({
      success: true,
      data: {
        ...LIVE_DETAIL.data,
        auditLogs: [
          { ...LIVE_DETAIL.data.auditLogs[0], action: 'SOMETHING_ENTIRELY_NEW' },
        ],
      },
    })

    expect(parsed.data.auditLogs?.[0]?.action).toBe('SOMETHING_ENTIRELY_NEW')
  })

  it('tolerates a rejection code it does not recognise', () => {
    const parsed = verificationDetailResponseSchema.parse({
      success: true,
      data: {
        ...LIVE_DETAIL.data,
        status: 'REJECTED',
        rejectionCode: 'BRAND_NEW_CODE',
      },
    })

    expect(parsed.data.rejectionCode).toBe('BRAND_NEW_CODE')
  })

  it('tolerates a rejected record with no reason recorded (§3.6)', () => {
    const parsed = verificationDetailResponseSchema.parse({
      success: true,
      data: {
        ...LIVE_DETAIL.data,
        status: 'REJECTED',
        rejectionCode: 'BLURRY_DOCUMENT',
        rejectionReason: null,
      },
    })

    expect(parsed.data.rejectionReason).toBeNull()
  })

  it('names the six rejection codes the applicant’s app can be shown', () => {
    expect(VERIFICATION_REJECTION_CODE_VALUES).toEqual([
      'BLURRY_DOCUMENT',
      'EXPIRED_DOCUMENT',
      'NAME_MISMATCH',
      'INVALID_DOCUMENT',
      'INCOMPLETE_DOCUMENT',
      'OTHER',
    ])
  })
})

describe('the decision response is unrenderable on purpose', () => {
  it('keeps only id, status and reviewedAt', () => {
    /*
     * ⚠️ The schema is the enforcement. A decision changes the application, its
     * audit trail and the applicant's account in one transaction, and the
     * response describes none of it — so a screen that tried to paint itself
     * from a write would have nothing to paint with. Only `GET /:id` draws.
     */
    const parsed = verificationDecisionResponseSchema.parse({
      success: true,
      message: 'Verification request has been approved.',
      data: {
        id: 'cmulfjl62000201r33hha40xi',
        status: 'APPROVED',
        reviewedAt: '2026-09-29T10:45:00.000Z',
      },
    })

    expect(Object.keys(parsed.data).sort()).toEqual(['id', 'reviewedAt', 'status'])
  })

  it('strips a full record if the service ever sends one', () => {
    const parsed = verificationDecisionResponseSchema.parse({
      success: true,
      data: { ...LIVE_DETAIL.data, status: 'REJECTED' },
    })

    expect(parsed.data).not.toHaveProperty('documents')
    expect(parsed.data).not.toHaveProperty('auditLogs')
    expect(parsed.data).not.toHaveProperty('applicant')
  })
})
