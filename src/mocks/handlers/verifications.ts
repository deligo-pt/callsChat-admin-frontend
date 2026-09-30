import { http, HttpResponse } from 'msw'

import { API_PREFIX, applyScenario, errorResponse } from './shared'

/**
 * Verification & Compliance — a deliberately **hostile** mock (plan.md §7, V0).
 *
 * It reproduces the live service's defects rather than an idealised contract,
 * because a mock that behaves better than production is a mock that lets a bug
 * ship. Everything below was observed against the live API on **2026-09-29**:
 *
 *   - the **third** list envelope, `{ total, page, limit, totalPages, requests }`
 *     (§2.2);
 *   - `status` defaults to the pending applications, **not** `ALL` — 3 of 5
 *     rows (§3.8);
 *   - the status enum has **six** values including an undocumented `PENDING`,
 *     and `PENDING`/`PENDING_REVIEW` filter identically (§3.2);
 *   - `?page=99` is **echoed**, not clamped: 200, `page: 99`, `requests: []`
 *     (§3.9);
 *   - `limit=200` → 400, with the server's own wording;
 *   - on `BUSINESS_ENTITY` rows every `applicant` field is `null` while
 *     `accountType` is populated and meaningless (§3.4);
 *   - three applications carry **zero documents**, and one of those has **zero
 *     audit rows** — not even a `SUBMITTED` (§3.5);
 *   - `REJECT` is accepted with **no `rejectionCode`** and with **no
 *     `rejectionReason`** (§3.6);
 *   - **`APPROVED` is not terminal**: a `REJECT` against an approved
 *     application returns 200 and rejects it (§3.1);
 *   - audit rows carry `ipAddress` and `userAgent` (§3.7);
 *   - the document route streams **binary** with the vault's real headers, and
 *     answers `401` with no token and two distinguishable `404`s (§2.6).
 *
 * The four user-side routes are **not** mocked. The panel cannot call them —
 * an admin submitting a verification would be filing identity documents as
 * themselves (§1.2) — and mocking a route the product never requests would
 * invent a capability that does not exist.
 */

const VALIDATION = 'FST_ERR_VALIDATION' as const
const NOT_FOUND = 'NOT_FOUND' as const
const UNAUTHORIZED = 'UNAUTHORIZED' as const

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

interface MockDocument {
  docIndex: number
  originalName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
}

interface MockAuditLog {
  id: string
  requestId: string
  actorId: string | null
  action: string
  ipAddress: string | null
  userAgent: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface MockVerification {
  id: string
  targetType: 'USER_IDENTITY' | 'BUSINESS_ENTITY'
  userId: string | null
  businessId: string | null
  workspaceId: string | null
  status: 'PENDING' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REVOKED'
  idType: string | null
  submittedAt: string
  reviewedAt: string | null
  rejectionCode: string | null
  rejectionReason: string | null
  adminNotes: string | null
  applicant: {
    id?: string
    displayName: string | null
    username: string | null
    email: string | null
    phone: string | null
    avatarUrl: string | null
    accountType: string | null
  } | null
  business: {
    id: string
    /* ⚠️ The owning account — the only route from a KYB row to a human. */
    userId: string | null
    companyName: string | null
    category: string | null
    description: string | null
    website: string | null
    address: string | null
    operatingHours: string | null
    isVerified: boolean
    createdAt: string
    updatedAt: string
  } | null
  documents: MockDocument[]
  auditLogs: MockAuditLog[]
}

const ADMIN_ID = 'cmt8orkov00004upco3oifg2v'

/**
 * ⚠️ A real admin IP, as the live audit trail carries it (§3.7). Kept because
 * the disclosure that hides it by default has to have something to hide.
 */
const ADMIN_IP = '113.11.34.102'

/**
 * Five applications, matching the live distribution exactly: two approved
 * identity checks with one document each, and three pending business
 * applications with none.
 */
const SEED: MockVerification[] = [
  {
    id: 'cmulfjl62000201r33hha40xi',
    targetType: 'USER_IDENTITY',
    userId: 'cmu9wkz4b000801s6h1hqoe4p',
    businessId: null,
    workspaceId: null,
    /*
     * ⚠️ Seeded APPROVED so the "already decided" path is reachable without
     * setting it up. This is the id of the live record that two validation
     * probes rejected and which had to be restored — plan.md §8 O5, kept as a
     * reminder of what this screen is capable of.
     */
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
      username: 'rahim99',
      email: 'rahim@example.com',
      phone: '+8801700000000',
      /*
       * ⚠️ A storage KEY, not a URL — captured live. An `<img src>` resolves
       * this against the panel's own origin and 404s, which is why the panel
       * renders initials and never loads it.
       */
      avatarUrl: 'avatars/avatar_cmu9wkz4b000801s6h1hqoe4p_1786538993084.jpg',
      accountType: 'PERSONAL',
    },
    business: null,
    documents: [
      {
        docIndex: 0,
        originalName: '_Weil_ Full.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 520_882,
        uploadedAt: '2026-09-24T11:02:14.884Z',
      },
    ],
    /*
     * ⚠️ **Newest first**, exactly as the live route returns them (§2.4) — the
     * opposite of a reply stream. A mock that served them oldest-first would
     * let a timeline that silently re-sorts look correct.
     *
     * The three `metadata` shapes are the three observed live: `SUBMITTED`
     * carries the submission summary, `VIEWED_DOCUMENT` names the file, and a
     * decision carries the notes and codes.
     */
    auditLogs: [
      {
        id: 'vlog_0003',
        requestId: 'cmulfjl62000201r33hha40xi',
        actorId: ADMIN_ID,
        action: 'APPROVED',
        ipAddress: ADMIN_IP,
        userAgent: 'Requestly/1.0',
        metadata: {
          action: 'APPROVE',
          adminNotes: 'NID watermarks verified against the government registry.',
          rejectionCode: null,
          rejectionReason: null,
        },
        createdAt: '2026-09-28T07:41:55.102Z',
      },
      {
        id: 'vlog_0002',
        requestId: 'cmulfjl62000201r33hha40xi',
        actorId: ADMIN_ID,
        action: 'VIEWED_DOCUMENT',
        ipAddress: ADMIN_IP,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        /* ⚠️ Proof that opening a document is permanently recorded (§3.3). */
        metadata: {
          docIndex: 0,
          mimeType: 'application/pdf',
          originalName: '_Weil_ Full.pdf',
        },
        createdAt: '2026-09-28T07:40:02.551Z',
      },
      {
        id: 'vlog_0001',
        requestId: 'cmulfjl62000201r33hha40xi',
        actorId: 'cmu9wkz4b000801s6h1hqoe4p',
        action: 'SUBMITTED',
        ipAddress: ADMIN_IP,
        userAgent: 'Requestly/1.0',
        metadata: {
          idType: 'NATIONAL_ID',
          targetType: 'USER_IDENTITY',
          documentCount: 1,
        },
        createdAt: '2026-09-24T11:02:14.884Z',
      },
    ],
  },
  {
    id: 'cmulfjl62000301r33hha40xj',
    targetType: 'USER_IDENTITY',
    userId: 'cmu9wkz4b000901s6h1hqoe4q',
    businessId: null,
    workspaceId: null,
    /*
     * ⚠️ **Rejected with a code and NO reason text** — the §3.6 trap, which the
     * live service accepts with a 200 and which no live row happens to carry.
     * Seeded here because the panel has to render the gap rather than an empty
     * paragraph: the applicant was refused and handed nothing to act on.
     *
     * Kept on an identity row so the live distribution is untouched — three
     * PENDING business applications, five in total.
     */
    status: 'REJECTED',
    idType: 'NATIONAL_ID',
    submittedAt: '2026-09-25T09:15:00.000Z',
    reviewedAt: '2026-09-27T12:00:00.000Z',
    rejectionCode: 'BLURRY_DOCUMENT',
    rejectionReason: null,
    adminNotes: null,
    applicant: {
      id: 'cmu9wkz4b000901s6h1hqoe4q',
      /*
       * ⚠️ An attacker-controlled display name. The applicant types this, and
       * the queue renders it. A test asserts it appears as text.
       */
      displayName: '<img src=x onerror=alert(1)>',
      username: null,
      email: null,
      phone: null,
      avatarUrl: null,
      accountType: 'PERSONAL',
    },
    business: null,
    documents: [
      {
        docIndex: 0,
        /* ⚠️ Also attacker-controlled: this is an uploaded file's own name. */
        originalName:
          'a-very-long-unbroken-filename-that-must-not-widen-the-row-nid_front.png',
        mimeType: 'image/png',
        sizeBytes: 204_850,
        uploadedAt: '2026-09-25T09:15:00.000Z',
      },
    ],
    auditLogs: [
      {
        id: 'vlog_0011',
        requestId: 'cmulfjl62000301r33hha40xj',
        actorId: 'cmu9wkz4b000901s6h1hqoe4q',
        action: 'SUBMITTED',
        ipAddress: null,
        userAgent: null,
        metadata: null,
        createdAt: '2026-09-25T09:15:00.000Z',
      },
    ],
  },
  {
    id: 'cmu04s71l003701oi3wvzvbdp',
    targetType: 'BUSINESS_ENTITY',
    userId: null,
    businessId: 'cmu044h68000q01oixu36ov0j',
    workspaceId: null,
    /* ⚠️ `PENDING`, the value the doc never mentions and every live row holds. */
    status: 'PENDING',
    idType: null,
    submittedAt: '2026-09-13T18:11:54.153Z',
    reviewedAt: null,
    rejectionCode: null,
    rejectionReason: null,
    adminNotes: null,
    /*
     * ⚠️ Every field null, `accountType` populated and meaningless (§3.4). The
     * object is present, so a `!applicant` check is not enough — the Subject
     * column has to fall through every field.
     */
    applicant: {
      displayName: null,
      username: null,
      email: null,
      phone: null,
      avatarUrl: null,
      accountType: 'PERSONAL',
    },
    /*
     * Captured verbatim from the live detail route on 2026-09-29. Eleven
     * fields, not the four the queue needs — `address` is populated and
     * `userId` is the only link back to a person on a KYB row (§3.4).
     */
    business: {
      id: 'cmu044h68000q01oixu36ov0j',
      userId: 'cmu044g97000l01oipmeewcjq',
      companyName: 'DeliGo',
      category: 'Healthcare & Medical',
      description: null,
      website: null,
      address: 'lisbon portugal',
      operatingHours: null,
      isVerified: false,
      createdAt: '2026-09-13T17:53:27.536Z',
      updatedAt: '2026-09-13T18:11:26.990Z',
    },
    /* ⚠️ Nothing to review, and no audit trail either — not even SUBMITTED. */
    documents: [],
    auditLogs: [],
  },
  {
    id: 'cmu04s71l003801oi3wvzvbdq',
    targetType: 'BUSINESS_ENTITY',
    userId: null,
    businessId: 'cmu044h68000r01oixu36ov0k',
    workspaceId: null,
    status: 'PENDING',
    idType: null,
    submittedAt: '2026-09-18T07:30:12.000Z',
    reviewedAt: null,
    rejectionCode: null,
    rejectionReason: null,
    adminNotes: null,
    applicant: {
      displayName: null,
      username: null,
      email: null,
      phone: null,
      avatarUrl: null,
      accountType: 'BUSINESS',
    },
    business: {
      id: 'cmu044h68000r01oixu36ov0k',
      userId: 'cmu044g97000m01oipmeewcjr',
      companyName: 'Northwind Logistics',
      category: 'Transport & Delivery',
      description: 'Same-day courier services across the metro area.',
      /* ⚠️ Attacker-controlled free text. Rendered as text, never as an href. */
      website: 'javascript:alert(document.domain)',
      address: '14 Kemal Ataturk Ave, Banani, Dhaka',
      operatingHours: '09:00 – 18:00, Sun–Thu',
      isVerified: false,
      createdAt: '2026-09-18T07:00:00.000Z',
      updatedAt: '2026-09-18T07:30:12.000Z',
    },
    documents: [],
    auditLogs: [],
  },
  {
    id: 'cmu04s71l003901oi3wvzvbdr',
    targetType: 'BUSINESS_ENTITY',
    userId: null,
    businessId: 'cmu044h68000s01oixu36ov0l',
    workspaceId: null,
    status: 'PENDING',
    idType: null,
    submittedAt: '2026-09-21T14:45:00.000Z',
    reviewedAt: null,
    /*
     * ⚠️ A REJECTED-shaped remnant on a PENDING row: the previous rejection's
     * code survived a resubmission, and it carries NO reason text (§3.6). The
     * detail page must name the gap rather than render an empty paragraph.
     */
    rejectionCode: 'BLURRY_DOCUMENT',
    rejectionReason: null,
    adminNotes: null,
    applicant: {
      displayName: null,
      username: null,
      email: null,
      phone: null,
      avatarUrl: null,
      accountType: 'PERSONAL',
    },
    business: {
      id: 'cmu044h68000s01oixu36ov0l',
      userId: null,
      companyName: 'Rajshahi Tea Traders',
      category: null,
      description: null,
      website: null,
      address: null,
      operatingHours: null,
      isVerified: false,
      createdAt: '2026-09-21T14:00:00.000Z',
      updatedAt: '2026-09-21T14:45:00.000Z',
    },
    documents: [],
    auditLogs: [
      {
        id: 'vlog_0022',
        requestId: 'cmu04s71l003901oi3wvzvbdr',
        actorId: null,
        /* An action the panel has never heard of — it must degrade, not throw. */
        action: 'RESUBMITTED_WITH_COURIER_RECEIPT',
        ipAddress: null,
        userAgent: null,
        metadata: null,
        createdAt: '2026-09-23T08:00:00.000Z',
      },
      {
        id: 'vlog_0021',
        requestId: 'cmu04s71l003901oi3wvzvbdr',
        actorId: ADMIN_ID,
        action: 'REJECTED',
        ipAddress: ADMIN_IP,
        userAgent: 'Requestly/1.0',
        /* ⚠️ A rejection the service accepted with no reason text at all. */
        metadata: {
          action: 'REJECT',
          adminNotes: null,
          rejectionCode: 'BLURRY_DOCUMENT',
          rejectionReason: null,
        },
        createdAt: '2026-09-22T10:00:00.000Z',
      },
    ],
  },
]

let requests: MockVerification[] = structuredClone(SEED)

/** Counts every call to the document route, as the audit trail would. */
let documentViews: { id: string; docIndex: number }[] = []

/**
 * Restore the seed records and clear the view log.
 *
 * `requests` is module state loaded once at import, so a test that decides on an
 * application leaks into the next one unless this is called. Mirrors
 * `resetMockBootstrap` and `resetMockFeedback`.
 */
export function resetMockVerifications(): void {
  requests = structuredClone(SEED)
  documentViews = []
}

/**
 * Every document fetch the mock has served since the last reset.
 *
 * ⚠️ This exists for one assertion and it is the most important one in the
 * module: **nothing may fetch a document that a human did not ask for**
 * (plan.md §3.3). Every call to the live route writes a `VIEWED_DOCUMENT` row
 * naming the acting admin and their IP, so a prefetch on hover or on mount
 * would fabricate evidence that somebody opened a stranger's passport. A test
 * that renders the page and expects this to be empty is the only thing that
 * catches such a regression.
 */
export function mockVerificationDocumentViews(): readonly {
  id: string
  docIndex: number
}[] {
  return documentViews
}

/* ------------------------------------------------------------------ *
 * Validation — the server's own messages, verbatim
 * ------------------------------------------------------------------ */

const STATUS_FILTERS = [
  'PENDING',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'REVOKED',
  'ALL',
] as const

const TARGET_TYPE_FILTERS = ['USER_IDENTITY', 'BUSINESS_ENTITY', 'ALL'] as const

const REJECTION_CODES = [
  'BLURRY_DOCUMENT',
  'EXPIRED_DOCUMENT',
  'NAME_MISMATCH',
  'INVALID_DOCUMENT',
  'INCOMPLETE_DOCUMENT',
  'OTHER',
] as const

function enumIssue(
  location: string,
  field: string,
  allowed: readonly string[],
  received: string,
): string {
  return `${location}/${field} Invalid enum value. Expected ${allowed
    .map((value) => `'${value}'`)
    .join(' | ')}, received '${received}'`
}

function hasBearer(request: Request): boolean {
  return (request.headers.get('Authorization') ?? '').startsWith('Bearer ')
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text()
  if (raw.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * The list row projection.
 *
 * ⚠️ It **adds** `documentCount` and **drops** the decision fields, the
 * documents and the audit logs — the live list and detail routes really do
 * return different shapes, and a mock that returned one shape everywhere would
 * hide that `documentCount` is absent from the detail (§2.3, §2.4).
 */
function toListRow(record: MockVerification) {
  return {
    id: record.id,
    targetType: record.targetType,
    userId: record.userId,
    businessId: record.businessId,
    workspaceId: record.workspaceId,
    status: record.status,
    idType: record.idType,
    documentCount: record.documents.length,
    submittedAt: record.submittedAt,
    reviewedAt: record.reviewedAt,
    applicant: record.applicant,
    business: record.business,
  }
}

function toDetail(record: MockVerification) {
  return {
    id: record.id,
    targetType: record.targetType,
    userId: record.userId,
    businessId: record.businessId,
    workspaceId: record.workspaceId,
    status: record.status,
    idType: record.idType,
    submittedAt: record.submittedAt,
    reviewedAt: record.reviewedAt,
    rejectionCode: record.rejectionCode,
    rejectionReason: record.rejectionReason,
    adminNotes: record.adminNotes,
    applicant: record.applicant,
    business: record.business,
    documents: record.documents.map((document) => ({
      ...document,
      /*
       * Served as the live route does — a path, which the panel deliberately
       * ignores in favour of building its own from the two ids.
       */
      previewUrl: `/api/v1/admin/verifications/${record.id}/document/${String(document.docIndex)}`,
    })),
    auditLogs: record.auditLogs,
  }
}

/** A minimal but genuine PDF, so `%PDF` sniffing in a test is meaningful. */
function fakePdfBytes(): Uint8Array {
  return new TextEncoder().encode(
    '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  )
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

export const verificationHandlers = [
  /**
   * `GET /admin/verifications/:id/document/:docIndex` — the decrypted stream.
   *
   * ⚠️ MUST stay above `GET /admin/verifications/:id`. MSW matches in
   * registration order, and the detail pattern would otherwise swallow it.
   */
  http.get(
    `${API_PREFIX}/admin/verifications/:id/document/:docIndex`,
    async ({ params, request }) => {
      const scenario = await applyScenario()
      if (scenario) return scenario

      /* The vault refuses an anonymous request outright — verified 401. */
      if (!hasBearer(request)) {
        return errorResponse(401, UNAUTHORIZED, 'Unauthorized')
      }

      const id = String(params['id'])
      const record = requests.find((candidate) => candidate.id === id)
      if (!record) {
        return errorResponse(404, NOT_FOUND, 'Verification request not found')
      }

      const docIndex = Number(params['docIndex'])
      const document = record.documents.find(
        (candidate) => candidate.docIndex === docIndex,
      )
      /* ⚠️ A DIFFERENT message from the unknown-id 404 — both are verified. */
      if (!document) {
        return errorResponse(404, NOT_FOUND, 'Document manifest at index not found')
      }

      /* The audit row the live service writes on every single view. */
      documentViews.push({ id, docIndex })

      const body =
        document.mimeType === 'application/pdf'
          ? fakePdfBytes()
          : new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

      /*
       * The vault's real response headers, reproduced so a test can assert the
       * panel does not undermine them (§2.6).
       */
      return new HttpResponse(body, {
        status: 200,
        headers: {
          'Content-Type': document.mimeType,
          'Content-Disposition': `inline; filename="${document.originalName}"`,
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN',
        },
      })
    },
  ),

  /** `GET /admin/verifications` — the queue. */
  http.get(`${API_PREFIX}/admin/verifications`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const url = new URL(request.url)
    const rawStatus = url.searchParams.get('status')
    const rawTargetType = url.searchParams.get('targetType')
    const rawLimit = url.searchParams.get('limit')
    const rawPage = url.searchParams.get('page')
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase()

    if (
      rawStatus !== null &&
      !(STATUS_FILTERS as readonly string[]).includes(rawStatus)
    ) {
      return errorResponse(
        400,
        VALIDATION,
        enumIssue('querystring', 'status', STATUS_FILTERS, rawStatus),
      )
    }

    if (
      rawTargetType !== null &&
      !(TARGET_TYPE_FILTERS as readonly string[]).includes(rawTargetType)
    ) {
      return errorResponse(
        400,
        VALIDATION,
        enumIssue('querystring', 'targetType', TARGET_TYPE_FILTERS, rawTargetType),
      )
    }

    const limit = rawLimit === null ? 20 : Number(rawLimit)
    if (Number.isNaN(limit) || limit < 1) {
      return errorResponse(
        400,
        VALIDATION,
        'querystring/limit Number must be greater than or equal to 1',
      )
    }
    if (limit > 100) {
      return errorResponse(
        400,
        VALIDATION,
        'querystring/limit Number must be less than or equal to 100',
      )
    }

    /*
     * ⚠️ The default is the PENDING applications, NOT `ALL` (§3.8). Omitting
     * `status` returned 3 of 5 live rows, so a caller that forgets the parameter
     * is silently filtered here too rather than seeing everything and passing.
     */
    const status = rawStatus ?? 'PENDING'
    const targetType = rawTargetType ?? 'ALL'

    let matched = requests.filter((record) => {
      /* `PENDING` and `PENDING_REVIEW` are aliases — both match both (§3.2). */
      const statusMatches =
        status === 'ALL'
          ? true
          : status === 'PENDING' || status === 'PENDING_REVIEW'
            ? record.status === 'PENDING' || record.status === 'PENDING_REVIEW'
            : record.status === status

      const targetMatches = targetType === 'ALL' || record.targetType === targetType

      return statusMatches && targetMatches
    })

    if (search.length > 0) {
      matched = matched.filter((record) =>
        [
          record.applicant?.displayName,
          record.applicant?.username,
          record.applicant?.email,
          record.business?.companyName,
        ]
          .filter((value): value is string => typeof value === 'string')
          .some((value) => value.toLowerCase().includes(search)),
      )
    }

    const total = matched.length
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const page = rawPage === null ? 1 : Number(rawPage)

    if (Number.isNaN(page) || page < 1) {
      return errorResponse(
        400,
        VALIDATION,
        'querystring/page Number must be greater than or equal to 1',
      )
    }

    const start = (page - 1) * limit

    return HttpResponse.json({
      success: true,
      data: {
        total,
        /*
         * ⚠️ ECHOED, not clamped (§3.9). `?page=99` answers 200 with `page: 99`
         * and an empty array while `totalPages` stays 1 — so an empty state
         * derived from `totalPages` would claim there is a page to show.
         */
        page,
        limit,
        totalPages,
        requests: matched.slice(start, start + limit).map(toListRow),
      },
    })
  }),

  /** `GET /admin/verifications/:id` — one application, with everything. */
  http.get(`${API_PREFIX}/admin/verifications/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const record = requests.find((candidate) => candidate.id === String(params['id']))
    if (!record) {
      return errorResponse(404, NOT_FOUND, 'Verification request not found')
    }

    return HttpResponse.json({ success: true, data: toDetail(record) })
  }),

  /**
   * `PATCH /admin/verifications/:id/decision`.
   *
   * ⚠️ Three of this handler's behaviours are defects being preserved: a
   * `REJECT` with no code succeeds, a `REJECT` with no reason succeeds, and an
   * `APPROVED` application can be rejected (§3.1, §3.6). Fixing any of them
   * here would hide the reason the panel's own guards exist.
   */
  http.patch(
    `${API_PREFIX}/admin/verifications/:id/decision`,
    async ({ params, request }) => {
      const scenario = await applyScenario()
      if (scenario) return scenario

      const record = requests.find((candidate) => candidate.id === String(params['id']))
      if (!record) {
        return errorResponse(404, NOT_FOUND, 'Verification request not found')
      }

      const body = await readBody(request)
      if (!body) {
        return errorResponse(
          400,
          VALIDATION,
          "Body cannot be empty when content-type is set to 'application/json'",
        )
      }

      const action = body['action']
      if (action === undefined) {
        return errorResponse(400, VALIDATION, 'body/action Required')
      }
      /* Uppercase only — `approve` is rejected, verified. */
      if (action !== 'APPROVE' && action !== 'REJECT') {
        return errorResponse(
          400,
          VALIDATION,
          enumIssue('body', 'action', ['APPROVE', 'REJECT'], String(action)),
        )
      }

      const rejectionCode = body['rejectionCode']
      if (
        rejectionCode !== undefined &&
        rejectionCode !== null &&
        !(REJECTION_CODES as readonly string[]).includes(String(rejectionCode))
      ) {
        return errorResponse(
          400,
          VALIDATION,
          enumIssue('body', 'rejectionCode', REJECTION_CODES, String(rejectionCode)),
        )
      }

      /*
       * ⚠️ NOT validated, on purpose: a `REJECT` with neither `rejectionCode`
       * nor `rejectionReason` returns 200 on the live service, and the applicant
       * is told they were refused with nothing to act on (§3.6). The panel's
       * payload type is the only thing that prevents it.
       *
       * ⚠️ Also NOT checked: the current status. `verification_doc.md` calls
       * `APPROVED` a "Terminal state (Immutable)"; it is not, and this handler
       * reproduces that rather than the documentation (§3.1).
       */

      const adminNotes = body['adminNotes']
      const approved = action === 'APPROVE'

      record.status = approved ? 'APPROVED' : 'REJECTED'
      record.reviewedAt = new Date().toISOString()
      record.rejectionCode = approved ? null : ((rejectionCode as string) ?? null)
      record.rejectionReason = approved
        ? null
        : ((body['rejectionReason'] as string | undefined) ?? null)
      record.adminNotes =
        typeof adminNotes === 'string' ? adminNotes : record.adminNotes
      /* ⚠️ Prepended — the service returns newest first (§2.4). */
      record.auditLogs = [
        {
          id: `vlog_${Date.now().toString(36)}`,
          requestId: record.id,
          actorId: ADMIN_ID,
          action: approved ? 'APPROVED' : 'REJECTED',
          ipAddress: ADMIN_IP,
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          metadata: {
            action,
            adminNotes: record.adminNotes,
            rejectionCode: record.rejectionCode,
            rejectionReason: record.rejectionReason,
          },
          createdAt: record.reviewedAt,
        },
        ...record.auditLogs,
      ]

      /*
       * ⚠️ THREE keys, as documented — not the record. A screen that wanted to
       * paint itself from this response cannot, which is the arrangement
       * `verificationDecisionResponseSchema` enforces on the way in.
       */
      return HttpResponse.json({
        success: true,
        message: approved
          ? 'Verification request has been approved.'
          : 'Verification request has been rejected.',
        data: {
          id: record.id,
          status: record.status,
          reviewedAt: record.reviewedAt,
        },
      })
    },
  ),
]
