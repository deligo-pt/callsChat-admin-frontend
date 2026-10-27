import { http, HttpResponse } from 'msw'

import { API_PREFIX, applyScenario, errorResponse, isEmptyScenario } from './shared'

/**
 * Diamond Wallet & Creator Economy — a mock of a backend that currently holds
 * **nothing** (plan.md §2, phase W1).
 *
 * Measured against `https://test-api.callschat.com/api/v1` on 2026-10-27.
 * Everything reproduced here is a behaviour that was observed, including the
 * places where the integration guide is wrong:
 *
 *   - **every list is empty** — 0 top-up requests, 0 packages, the live default;
 *   - the queue's envelope is `{ data: { items, total, page, limit, totalPages } }`,
 *     **not** the `{ data: [], pagination }` the guide prints;
 *   - packages answer a **bare array** with no pagination at all;
 *   - `status` and `method` are **validated and case-SENSITIVE**;
 *   - the `method` enum includes `STRIPE`, `GOOGLE_PLAY` and `APPLE_IAP`, and
 *     does **not** include the guide's `UPAY`;
 *   - `limit` is 1–100 and `page` is ≥ 1, both enforced;
 *   - **`startDate` and `endDate` are not validated at all** — `hello` is a 200;
 *   - `amount` may not be zero; `note` and `reason` are required;
 *   - re-reviewing a request is a **400 `BAD_REQUEST`** — NOT the `409` the
 *     guide documents, and with a different sentence;
 *   - the 404 messages end in a period and are **not** doubled, unlike the
 *     host routes.
 *
 * ⚠️ **The default seed is empty, and that is the whole point.** A mock full of
 * tidy payments would make the queue look finished while the only thing an
 * operator can reach today is the empty state. The populated seed is opt-in
 * via `seedMockWallet()`.
 */

const VALIDATION = 'FST_ERR_VALIDATION' as const
const NOT_FOUND = 'NOT_FOUND' as const
const BAD_REQUEST = 'BAD_REQUEST' as const

const REQUESTS = `${API_PREFIX}/admin/wallet/requests`
const PACKAGES = `${API_PREFIX}/admin/wallet/packages`
const ADJUST = `${API_PREFIX}/admin/wallet/adjust`

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

interface MockTopUpRequest {
  id: string
  userId: string
  packageId: string | null
  diamonds: number
  amountBdt: number
  method: string
  senderNumber: string | null
  transactionId: string | null
  receiptImageUrl: string | null
  status: string
  rejectionReason: string | null
  reviewedById: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  user: {
    id: string
    phone: string | null
    email: string | null
    profile: {
      displayName: string | null
      username: string | null
      avatarUrl: string | null
    } | null
  } | null
  package: MockPackage | null
}

interface MockPackage {
  id: string
  title: string
  diamonds: number
  bonusDiamonds: number
  priceBdt: number
  priceUsd: number | null
  badgeText: string | null
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

function populatedPackages(): MockPackage[] {
  return [
    {
      id: 'pkg-diamond-tier-1',
      title: 'Starter Pack',
      diamonds: 100,
      bonusDiamonds: 0,
      priceBdt: 120,
      priceUsd: 1.0,
      badgeText: null,
      sortOrder: 1,
      isActive: true,
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
    },
    {
      id: 'pkg-diamond-tier-4',
      title: 'Diamond Chest',
      diamonds: 2500,
      bonusDiamonds: 250,
      priceBdt: 3000,
      /* ⚠️ A float. Never coerce it to an integer. */
      priceUsd: 25.5,
      badgeText: 'POPULAR',
      sortOrder: 4,
      isActive: true,
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
    },
    {
      /*
       * ⚠️ Inactive, and it must still be listed. The admin list includes
       * hidden packages — a screen that filtered them out would make a
       * withdrawn tier look deleted, and nobody could switch it back on.
       */
      id: 'pkg-diamond-retired',
      title: 'Retired Tier',
      diamonds: 50,
      bonusDiamonds: 0,
      priceBdt: 60,
      priceUsd: null,
      badgeText: null,
      sortOrder: 99,
      isActive: false,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
  ]
}

function populatedRequests(): MockTopUpRequest[] {
  return [
    {
      id: 'cmvo2ve4l0003wkihbnpnc5jb',
      userId: 'cms3ewh5y00002fmont803bo0',
      packageId: 'pkg-diamond-tier-4',
      diamonds: 2750,
      amountBdt: 3000,
      method: 'BKASH',
      senderNumber: '01712345678',
      transactionId: '9K38FX92P1',
      receiptImageUrl: 'https://cdn.callschat.com/receipts/proof_1029.jpg',
      status: 'PENDING',
      rejectionReason: null,
      reviewedById: null,
      reviewedAt: null,
      createdAt: '2026-10-25T17:05:00.000Z',
      updatedAt: '2026-10-25T17:05:00.000Z',
      user: {
        id: 'cms3ewh5y00002fmont803bo0',
        phone: '+8801712345678',
        email: 'rakibul@test.com',
        profile: {
          displayName: 'Rakibul Khan',
          username: 'rakibul09',
          /* ⚠️ Relative, as every live record is (plan.md O10). */
          avatarUrl: 'avatars/avatar_cms3ewh5y_1793010419825.jpg',
        },
      },
      package: populatedPackages()[1]!,
    },
    {
      /*
       * ⚠️ A store purchase, which the guide says this queue does not contain.
       * No `senderNumber`, nothing to reconcile against a bank statement, and
       * an operator who "verifies the TrxID" on it is checking a receipt that
       * Apple already settled.
       */
      id: 'cmvo2ve4l0004wkihbnpnc5jc',
      userId: 'cms3ewh5y00012fmont803bo1',
      packageId: 'pkg-diamond-tier-1',
      diamonds: 100,
      amountBdt: 120,
      method: 'APPLE_IAP',
      senderNumber: null,
      transactionId: '1000000987654321',
      receiptImageUrl: null,
      status: 'APPROVED',
      rejectionReason: null,
      reviewedById: 'adm_1',
      reviewedAt: '2026-10-26T09:00:00.000Z',
      createdAt: '2026-10-26T08:40:00.000Z',
      updatedAt: '2026-10-26T09:00:00.000Z',
      user: {
        id: 'cms3ewh5y00012fmont803bo1',
        phone: null,
        email: 'ios@test.com',
        profile: { displayName: 'Nabila', username: 'nabila_ios', avatarUrl: null },
      },
      package: populatedPackages()[0]!,
    },
    {
      /*
       * ⚠️ The hostile fixture. No profile at all, no email, a 420-character
       * unbroken transaction id, and a `javascript:` receipt — the one piece
       * of user-submitted media this module renders, and the one an operator
       * is most tempted to click because the money depends on it.
       */
      id: 'cmvo2ve4l0005wkihbnpnc5jd',
      userId: 'cms3ewh5y00022fmont803bo2',
      packageId: null,
      diamonds: 0,
      amountBdt: 0,
      method: 'NAGAD',
      senderNumber: '0',
      transactionId: 'TRX'.padEnd(420, 'X'),
      receiptImageUrl: 'javascript:alert(document.domain)',
      status: 'PENDING',
      rejectionReason: null,
      reviewedById: null,
      reviewedAt: null,
      createdAt: '2026-10-27T23:59:59.000Z',
      updatedAt: '2026-10-27T23:59:59.000Z',
      user: {
        id: 'cms3ewh5y00022fmont803bo2',
        phone: null,
        email: null,
        profile: null,
      },
      package: null,
    },
    {
      id: 'cmvo2ve4l0006wkihbnpnc5je',
      userId: 'cms3ewh5y00032fmont803bo3',
      packageId: 'pkg-diamond-tier-1',
      diamonds: 100,
      amountBdt: 120,
      method: 'ROCKET',
      senderNumber: '01999888777',
      transactionId: 'RK77213',
      receiptImageUrl: null,
      status: 'REJECTED',
      rejectionReason:
        'Transaction ID RK77213 not found in the merchant statement for 2026-10-24.',
      reviewedById: 'adm_1',
      reviewedAt: '2026-10-25T10:00:00.000Z',
      createdAt: '2026-10-24T18:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.000Z',
      user: {
        id: 'cms3ewh5y00032fmont803bo3',
        phone: '+8801999888777',
        email: null,
        profile: { displayName: 'Imran', username: 'imran_r', avatarUrl: null },
      },
      package: populatedPackages()[0]!,
    },
  ]
}

let requests: MockTopUpRequest[] = []
let packages: MockPackage[] = []

/** Restore the live default: nothing at all. */
export function resetMockWallet(): void {
  requests = []
  packages = []
}

/**
 * Opt into the populated seed.
 *
 * ⚠️ Deliberately a function a test must call, not a default — see the file
 * note. Production holds zero rows, so a test that does not ask for data is
 * testing the state an operator is actually in.
 */
export function seedMockWallet(): void {
  requests = populatedRequests()
  packages = populatedPackages()
}

/** Read-only views, for assertions about what a write actually changed. */
export function mockTopUpRequests(): readonly MockTopUpRequest[] {
  return requests
}

export function mockDiamondPackages(): readonly MockPackage[] {
  return packages
}

declare global {
  var __mockWallet:
    { readonly seed: () => void; readonly reset: () => void } | undefined
}

/**
 * Expose the seed switch to a real browser, as `__mockHosts` does.
 *
 * The flag is remembered in `sessionStorage` for the same reason: a reload
 * re-evaluates the bundle and the fixtures go back to empty, so a seed that
 * lived only in memory would vanish on the first refresh and every e2e test
 * would have to reach its screen by clicking a sidebar that is a drawer at
 * 360px and a rail at 1920px.
 */
const SEED_FLAG = 'callschat.mocks.wallet.seeded'

function remember(seeded: boolean): void {
  try {
    if (seeded) sessionStorage.setItem(SEED_FLAG, '1')
    else sessionStorage.removeItem(SEED_FLAG)
  } catch {
    /* Private browsing and blocked storage both throw; a lost preference is fine. */
  }
}

export function exposeWalletFixtureControls(): void {
  let wanted: boolean
  try {
    wanted = sessionStorage.getItem(SEED_FLAG) === '1'
  } catch {
    wanted = false
  }
  if (wanted) seedMockWallet()

  globalThis.__mockWallet = {
    seed: () => {
      seedMockWallet()
      remember(true)
    },
    reset: () => {
      resetMockWallet()
      remember(false)
    },
  }
}

/* ------------------------------------------------------------------ *
 * Validation — the service's own wordings, verbatim
 * ------------------------------------------------------------------ */

const TOP_UP_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const
const PAYMENT_METHODS = [
  'BKASH',
  'NAGAD',
  'ROCKET',
  'BANK',
  'STRIPE',
  'GOOGLE_PLAY',
  'APPLE_IAP',
] as const

function enumError(
  field: string,
  allowed: readonly string[],
  received: string,
): Response {
  return errorResponse(
    400,
    VALIDATION,
    `querystring/${field} Invalid enum value. Expected ${allowed
      .map((value) => `'${value}'`)
      .join(' | ')}, received '${received}'`,
  )
}

/**
 * ⚠️ **`startDate` and `endDate` are deliberately NOT validated here**, because
 * the server does not validate them: `?startDate=hello` answers `200`. A mock
 * that rejected them would be better behaved than the backend and would hide
 * the one defect on this route that produces a silently wrong answer rather
 * than an error. The guard belongs in the client, and the test for it needs a
 * mock that lets the bad value through.
 */
function readListQuery(url: URL): Response | { page: number; limit: number } {
  const status = url.searchParams.get('status')
  if (status !== null && !(TOP_UP_STATUSES as readonly string[]).includes(status)) {
    return enumError('status', TOP_UP_STATUSES, status)
  }

  const method = url.searchParams.get('method')
  if (method !== null && !(PAYMENT_METHODS as readonly string[]).includes(method)) {
    return enumError('method', PAYMENT_METHODS, method)
  }

  const rawLimit = url.searchParams.get('limit')
  const limit = rawLimit === null ? 20 : Number(rawLimit)
  if (rawLimit !== null) {
    if (!Number.isFinite(limit) || limit < 1) {
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
  }

  const rawPage = url.searchParams.get('page')
  const page = rawPage === null ? 1 : Number(rawPage)
  if (rawPage !== null && (!Number.isFinite(page) || page < 1)) {
    return errorResponse(
      400,
      VALIDATION,
      'querystring/page Number must be greater than or equal to 1',
    )
  }

  return { page, limit }
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json()
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

export const walletHandlers = [
  /** `GET /admin/wallet/requests`. */
  http.get(REQUESTS, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const url = new URL(request.url)
    const parsed = readListQuery(url)
    if (parsed instanceof Response) return parsed

    const { page, limit } = parsed
    const status = url.searchParams.get('status')
    const method = url.searchParams.get('method')
    const search = url.searchParams.get('search')?.toLowerCase()

    const rows = isEmptyScenario()
      ? []
      : requests.filter((row) => {
          if (status && row.status !== status) return false
          if (method && row.method !== method) return false
          if (search) {
            const haystack = `${row.transactionId ?? ''} ${row.senderNumber ?? ''}`
            if (!haystack.toLowerCase().includes(search)) return false
          }
          return true
        })

    const start = (page - 1) * limit

    /*
     * ⚠️ The counters sit BESIDE the rows under `data`, not in a `pagination`
     * object. The guide prints the other shape; this is what the server sends.
     */
    return HttpResponse.json({
      success: true,
      data: {
        items: rows.slice(start, start + limit),
        total: rows.length,
        page,
        limit,
        totalPages: Math.ceil(rows.length / limit),
      },
    })
  }),

  /** `PATCH /admin/wallet/requests/:id/approve`. */
  http.patch(`${REQUESTS}/:id/approve`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const row = requests.find((candidate) => candidate.id === params['id'])
    if (!row) return errorResponse(404, NOT_FOUND, 'Top-up request not found.')

    /*
     * ⚠️ **`400 BAD_REQUEST`, not the `409 CONFLICT` the guide documents.**
     * Measured against a real approved row on 2026-10-27:
     *
     *     400 {"code":"BAD_REQUEST","message":"Cannot approve request in 'APPROVED' status."}
     *
     * The guide's §3.2 prints a 409 and a different sentence
     * ("…cannot be re-processed"), and this mock reproduced that invention
     * until a real row disproved it. The backend still locks `FOR UPDATE` and
     * still refuses anything that is not PENDING — only the status code and
     * the wording were wrong, and the wording is what an operator reads.
     */
    if (row.status !== 'PENDING') {
      return errorResponse(
        400,
        BAD_REQUEST,
        `Cannot approve request in '${row.status}' status.`,
      )
    }

    row.status = 'APPROVED'
    row.reviewedById = 'adm_mock'
    row.reviewedAt = new Date().toISOString()
    row.updatedAt = row.reviewedAt

    return HttpResponse.json({
      success: true,
      message: 'Top-up request approved and diamonds credited successfully.',
      data: {
        request: {
          id: row.id,
          status: row.status,
          reviewedById: row.reviewedById,
          reviewedAt: row.reviewedAt,
        },
        newDiamondBalance: 3680,
        transactionId: `cmvtx_${Date.now().toString(36)}`,
      },
    })
  }),

  /** `PATCH /admin/wallet/requests/:id/reject`. */
  http.patch(`${REQUESTS}/:id/reject`, async ({ params, request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    /*
     * ⚠️ Validation runs BEFORE the lookup, as it does on every write route on
     * this backend — a malformed body against an unknown id answers 400, not
     * 404. That is what let the whole write contract be mapped against an
     * empty database.
     */
    const reason = body?.['reason']
    if (typeof reason !== 'string' || reason.length === 0) {
      return errorResponse(400, VALIDATION, 'body/reason Required')
    }

    const row = requests.find((candidate) => candidate.id === params['id'])
    if (!row) return errorResponse(404, NOT_FOUND, 'Top-up request not found.')

    /* Same shape as approve, same verb substitution — measured. */
    if (row.status !== 'PENDING') {
      return errorResponse(
        400,
        BAD_REQUEST,
        `Cannot reject request in '${row.status}' status.`,
      )
    }

    row.status = 'REJECTED'
    row.rejectionReason = reason
    row.reviewedById = 'adm_mock'
    row.reviewedAt = new Date().toISOString()
    row.updatedAt = row.reviewedAt

    return HttpResponse.json({
      success: true,
      message: 'Top-up request rejected.',
      data: row,
    })
  }),

  /**
   * `GET /admin/wallet/packages`.
   *
   * ⚠️ A bare array with no pagination, measured. Includes inactive packages.
   */
  http.get(PACKAGES, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    return HttpResponse.json({
      success: true,
      data: isEmptyScenario() ? [] : packages,
    })
  }),

  /** `POST /admin/wallet/packages`. */
  http.post(PACKAGES, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    const missing: string[] = []
    if (typeof body?.['title'] !== 'string') missing.push('body/title Required')
    if (typeof body?.['diamonds'] !== 'number') missing.push('body/diamonds Required')
    if (typeof body?.['priceBdt'] !== 'number') missing.push('body/priceBdt Required')
    if (missing.length > 0) return errorResponse(400, VALIDATION, missing.join(', '))

    const invalid: string[] = []
    if (body!['title'] === '') invalid.push('body/title Title is required')
    if ((body!['diamonds'] as number) <= 0)
      invalid.push('body/diamonds Base diamonds must be positive')
    if ((body!['priceBdt'] as number) <= 0)
      invalid.push('body/priceBdt BDT price must be positive')
    if (body!['sortOrder'] !== undefined && typeof body!['sortOrder'] !== 'number')
      invalid.push('body/sortOrder Expected number, received string')
    if (body!['isActive'] !== undefined && typeof body!['isActive'] !== 'boolean')
      invalid.push('body/isActive Expected boolean, received string')
    if (invalid.length > 0) return errorResponse(400, VALIDATION, invalid.join(', '))

    const now = new Date().toISOString()
    const created: MockPackage = {
      id: `pkg_${Date.now().toString(36)}`,
      title: body!['title'] as string,
      diamonds: body!['diamonds'] as number,
      bonusDiamonds: (body!['bonusDiamonds'] as number | undefined) ?? 0,
      priceBdt: body!['priceBdt'] as number,
      priceUsd: (body!['priceUsd'] as number | null | undefined) ?? null,
      badgeText: (body!['badgeText'] as string | null | undefined) ?? null,
      sortOrder: (body!['sortOrder'] as number | undefined) ?? packages.length + 1,
      isActive: (body!['isActive'] as boolean | undefined) ?? true,
      createdAt: now,
      updatedAt: now,
    }
    packages.push(created)

    return HttpResponse.json({ success: true, data: created }, { status: 201 })
  }),

  /** `PATCH /admin/wallet/packages/:id`. */
  http.patch(`${PACKAGES}/:id`, async ({ params, request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    const row = packages.find((candidate) => candidate.id === params['id'])
    if (!row) return errorResponse(404, NOT_FOUND, 'Diamond package not found.')

    if (typeof body?.['title'] === 'string' && body['title'] === '') {
      return errorResponse(400, VALIDATION, 'body/title Title is required')
    }

    Object.assign(row, body, { updatedAt: new Date().toISOString() })
    return HttpResponse.json({ success: true, data: row })
  }),

  /** `DELETE /admin/wallet/packages/:id`. */
  http.delete(`${PACKAGES}/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const index = packages.findIndex((candidate) => candidate.id === params['id'])
    if (index < 0) return errorResponse(404, NOT_FOUND, 'Diamond package not found.')

    packages.splice(index, 1)
    return HttpResponse.json({
      success: true,
      message: 'Package deleted successfully.',
    })
  }),

  /** `POST /admin/wallet/adjust`. */
  http.post(ADJUST, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    const missing: string[] = []
    if (typeof body?.['userId'] !== 'string') missing.push('body/userId Required')
    if (typeof body?.['amount'] !== 'number') missing.push('body/amount Required')
    if (typeof body?.['note'] !== 'string') missing.push('body/note Required')
    if (missing.length > 0) return errorResponse(400, VALIDATION, missing.join(', '))

    if (body!['amount'] === 0) {
      return errorResponse(400, VALIDATION, 'body/amount Amount cannot be zero')
    }

    return HttpResponse.json({
      success: true,
      message: 'User wallet adjusted successfully.',
      data: {
        userId: body!['userId'],
        amountAdjusted: body!['amount'],
        newDiamondBalance: 4180,
        transaction: {
          id: `cmvtx_adj_${Date.now().toString(36)}`,
          type: 'ADMIN_ADJUSTMENT',
          amount: body!['amount'],
          balanceAfter: 4180,
          note: body!['note'],
          createdAt: new Date().toISOString(),
        },
      },
    })
  }),
]
