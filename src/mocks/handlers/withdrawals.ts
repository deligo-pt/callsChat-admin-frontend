import { http, HttpResponse } from 'msw'

import { currentMockAdmin } from './auth'
import { API_PREFIX, applyScenario, errorResponse, isEmptyScenario } from './shared'

/**
 * Mock of `/admin/withdrawals/*` and `/admin/withdrawal-settings`
 * (plan.md §0, phase W0).
 *
 * Shapes, validation messages and the 404 wording are copied from staging
 * (2026-11-04): BDT as strings on rows and numbers in stats, nested stats,
 * no `username`, storage-key avatars, the full account number.
 *
 * ⚠️ Not measured (writes): the success messages are the guide's, and the
 * wrong-state answer (`409 INVALID_STATE_TRANSITION`) is a guess.
 */

const BASE = `${API_PREFIX}/admin/withdrawals`
const SETTINGS = `${API_PREFIX}/admin/withdrawal-settings`
const VALIDATION = 'FST_ERR_VALIDATION' as const
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED'] as const
const SORTS = ['createdAt', 'amount', 'amountBdt', 'status'] as const

type Status = (typeof STATUSES)[number]

interface MockSnapshot {
  type: string
  accountName: string
  accountNumber: string
  bankName: string | null
  branchName: string | null
  routingNumber: string | null
  paymentDetailId: string
}

interface MockHost {
  id: string
  userId: string
  email: string
  phone: string | null
  createdAt: string
  displayName: string
  avatarUrl: string | null
  level: number
  status: string
  withdrawableDiamonds: number
  pendingWithdrawal: number
  totalDiamondsEarned: number
}

interface MockWithdrawal {
  id: string
  hostId: string
  snapshot: MockSnapshot
  /** The live saved account — differs from the snapshot when the host edited it. */
  detail: (MockSnapshot & { isDefault: boolean; deletedAt: string | null }) | null
  amount: number
  status: Status
  userNote: string | null
  adminNote: string | null
  rejectReason: string | null
  transactionRef: string | null
  processedBy: { id: string; email: string; displayName: string } | null
  requestedAt: string
  processedAt: string | null
  paidAt: string | null
}

interface MockSettings {
  minAmount: number
  maxAmount: number
  conversionRate: number
  feePercent: number
  feeFlat: number
  maxPaymentDetailsPerUser: number
  withdrawalsEnabled: boolean
  updatedAt: string
  updatedBy: string | null
}

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

const SUPER = {
  id: 'cmv80oug40000b9kzd52qpjds',
  email: 'admin@callschat.com',
  displayName: 'Super Administrator',
}

function makeHosts(): MockHost[] {
  return [
    {
      id: 'cmv9o053n00ct01qgoabdxao3',
      userId: 'cmv5jz04e000201o5mtu3alad',
      email: 'rakib.host@example.com',
      phone: null,
      createdAt: '2026-10-12T17:55:39.230Z',
      displayName: 'Rakibul Haque',
      avatarUrl: 'avatars/avatar_cmv5jz04e000201o5mtu3alad_1793010419825.jpg',
      level: 1,
      status: 'ACTIVE',
      withdrawableDiamonds: 2172,
      pendingWithdrawal: 1000,
      totalDiamondsEarned: 5621,
    },
    {
      id: 'cmvhostnusrat0000000000001',
      userId: 'cmvusrnusrat00000000000001',
      email: 'nusrat.live@example.com',
      phone: '+8801812345678',
      createdAt: '2026-09-02T09:12:00.000Z',
      displayName: 'Nusrat Jahan',
      avatarUrl: null,
      level: 4,
      status: 'ACTIVE',
      withdrawableDiamonds: 48200,
      pendingWithdrawal: 25000,
      totalDiamondsEarned: 182400,
    },
    {
      id: 'cmvhosttanvir000000000001',
      userId: 'cmvusrtanvir00000000000001',
      email: 'tanvir.music@example.com',
      phone: '+8801912345678',
      createdAt: '2026-08-20T11:00:00.000Z',
      displayName: 'DJ Tanvir',
      avatarUrl: null,
      level: 3,
      status: 'ACTIVE',
      withdrawableDiamonds: 9100,
      pendingWithdrawal: 12000,
      totalDiamondsEarned: 64000,
    },
  ]
}

function wallet(
  id: string,
  type: string,
  accountName: string,
  accountNumber: string,
): MockSnapshot {
  return {
    type,
    accountName,
    accountNumber,
    bankName: null,
    branchName: null,
    routingNumber: null,
    paymentDetailId: id,
  }
}

const RAKIB_BKASH = wallet(
  'cmw0jm66s002c01n6fxc93fwi',
  'BKASH',
  'Md Rakibul Haque',
  '01711111111',
)
const NUSRAT_NAGAD = wallet(
  'cmwpdnusratnagad000000001',
  'NAGAD',
  'Nusrat Jahan',
  '01812345678',
)
const TANVIR_BANK: MockSnapshot = {
  type: 'BANK',
  accountName: 'Shahriar Kabir',
  accountNumber: '1052101004589',
  bankName: 'Dutch-Bangla Bank PLC',
  branchName: 'Dhanmondi Branch',
  routingNumber: '090271844',
  paymentDetailId: 'cmwpdtanvirbank0000000001',
}

function live(
  snapshot: MockSnapshot,
  changes: Partial<MockSnapshot> = {},
  deleted = false,
) {
  return {
    ...snapshot,
    ...changes,
    isDefault: true,
    deletedAt: deleted ? '2026-11-03T08:00:00.000Z' : null,
  }
}

function makeWithdrawals(): MockWithdrawal[] {
  const base = {
    userNote: null,
    adminNote: null,
    rejectReason: null,
    transactionRef: null,
    processedBy: null,
    processedAt: null,
    paidAt: null,
  }
  return [
    {
      ...base,
      id: 'cmw0nfxln003m01n65dvdyydw',
      hostId: 'cmv9o053n00ct01qgoabdxao3',
      snapshot: RAKIB_BKASH,
      detail: live(RAKIB_BKASH),
      amount: 1000,
      status: 'PENDING',
      requestedAt: '2026-11-03T12:13:39.419Z',
    },
    {
      ...base,
      id: 'cmwnusratpending00000000001',
      hostId: 'cmvhostnusrat0000000000001',
      snapshot: NUSRAT_NAGAD,
      detail: live(NUSRAT_NAGAD),
      amount: 25000,
      status: 'PENDING',
      userNote: 'Earnings payout for November',
      requestedAt: '2026-11-03T20:40:00.000Z',
    },
    {
      ...base,
      id: 'cmwtanvirapproved000000001',
      hostId: 'cmvhosttanvir000000000001',
      snapshot: TANVIR_BANK,
      // The host renamed the account after asking: pay the snapshot.
      detail: live(TANVIR_BANK, { accountName: 'Tanvir Ahmed' }),
      amount: 12000,
      status: 'APPROVED',
      processedBy: SUPER,
      processedAt: '2026-11-03T15:00:00.000Z',
      requestedAt: '2026-11-03T10:05:00.000Z',
    },
    {
      ...base,
      id: 'cmw0bp7xg000t01n6ocxwiajo',
      hostId: 'cmv9o053n00ct01qgoabdxao3',
      snapshot: RAKIB_BKASH,
      detail: live(RAKIB_BKASH),
      amount: 500,
      status: 'PAID',
      userNote: 'November payout request',
      adminNote: 'Dispatched via bKash merchant gateway',
      transactionRef: 'BKASH_TRX_9876543210',
      processedBy: SUPER,
      processedAt: '2026-11-02T16:30:00.000Z',
      paidAt: '2026-11-02T17:00:00.000Z',
      requestedAt: '2026-11-02T15:00:00.000Z',
    },
    {
      ...base,
      id: 'cmwnusratpaid0000000000001',
      hostId: 'cmvhostnusrat0000000000001',
      snapshot: NUSRAT_NAGAD,
      detail: live(NUSRAT_NAGAD),
      amount: 40000,
      status: 'PAID',
      transactionRef: 'NGD8K2L9P1Q',
      processedBy: SUPER,
      processedAt: '2026-10-28T09:00:00.000Z',
      paidAt: '2026-10-28T11:20:00.000Z',
      requestedAt: '2026-10-27T18:30:00.000Z',
    },
    {
      ...base,
      id: 'cmw0rejected0000000amy3e3',
      hostId: 'cmv9o053n00ct01qgoabdxao3',
      snapshot: RAKIB_BKASH,
      detail: live(RAKIB_BKASH),
      amount: 500,
      status: 'REJECTED',
      userNote: 'November payout request',
      adminNote: 'Flagged for verification',
      rejectReason: 'Account holder name does not match verified KYC profile.',
      processedBy: SUPER,
      processedAt: '2026-11-02T13:00:00.000Z',
      requestedAt: '2026-11-02T12:00:00.000Z',
    },
    {
      ...base,
      id: 'cmw0cancelled00000dxv9v1',
      hostId: 'cmv9o053n00ct01qgoabdxao3',
      snapshot: RAKIB_BKASH,
      detail: live(RAKIB_BKASH, {}, true),
      amount: 1000,
      status: 'CANCELLED',
      userNote: 'November payout request',
      processedAt: '2026-11-01T10:00:00.000Z',
      requestedAt: '2026-11-01T09:00:00.000Z',
    },
  ]
}

function makeSettings(): MockSettings {
  return {
    minAmount: 500,
    maxAmount: 150000,
    conversionRate: 0.01,
    feePercent: 0,
    feeFlat: 0,
    maxPaymentDetailsPerUser: 5,
    withdrawalsEnabled: true,
    updatedAt: '2026-11-02T15:38:24.346Z',
    updatedBy: SUPER.id,
  }
}

let hosts = makeHosts()
let withdrawals = makeWithdrawals()
let settings = makeSettings()

/** Back to the seed — for tests. */
export function resetMockWithdrawals(): void {
  hosts = makeHosts()
  withdrawals = makeWithdrawals()
  settings = makeSettings()
}

/* ------------------------------------------------------------------ *
 * Serialisation — the server's shapes
 * ------------------------------------------------------------------ */

/** Two decimals at most, no trailing zeros: `"10"`, `"2.5"` — as measured. */
function bdtString(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function money(amount: number) {
  const gross = Math.round(amount * settings.conversionRate * 100) / 100
  const fee =
    Math.round(((gross * settings.feePercent) / 100 + settings.feeFlat) * 100) / 100
  return { gross, fee, net: Math.round((gross - fee) * 100) / 100 }
}

function hostOf(row: MockWithdrawal): MockHost {
  const host = hosts.find((candidate) => candidate.id === row.hostId)
  if (!host) throw new Error(`Mock withdrawal ${row.id} has no host`)
  return host
}

function serialise(row: MockWithdrawal, detail = false) {
  const host = hostOf(row)
  const { gross, fee, net } = money(row.amount)
  return {
    id: row.id,
    userId: host.userId,
    hostProfileId: host.id,
    paymentDetailId: row.snapshot.paymentDetailId,
    paymentSnapshot: row.snapshot,
    amount: row.amount,
    amountBdt: bdtString(gross),
    feeBdt: bdtString(fee),
    netAmountBdt: bdtString(net),
    status: row.status,
    userNote: row.userNote,
    adminNote: row.adminNote,
    rejectReason: row.rejectReason,
    transactionRef: row.transactionRef,
    processedByAdminId: row.processedBy?.id ?? null,
    requestedAt: row.requestedAt,
    processedAt: row.processedAt,
    paidAt: row.paidAt,
    createdAt: row.requestedAt,
    updatedAt: row.paidAt ?? row.processedAt ?? row.requestedAt,
    user: {
      id: host.userId,
      email: host.email,
      phone: host.phone,
      ...(detail ? { createdAt: host.createdAt } : {}),
      profile: { displayName: host.displayName, avatarUrl: host.avatarUrl },
    },
    ...(detail
      ? {
          host: {
            id: host.id,
            level: host.level,
            badgeLevel: host.level,
            status: host.status,
            withdrawableDiamonds: host.withdrawableDiamonds,
            pendingWithdrawal: host.pendingWithdrawal,
            totalDiamondsEarned: host.totalDiamondsEarned,
          },
        }
      : {}),
    paymentDetail: row.detail
      ? {
          id: row.detail.paymentDetailId,
          userId: host.userId,
          type: row.detail.type,
          accountName: row.detail.accountName,
          accountNumber: row.detail.accountNumber,
          bankName: row.detail.bankName,
          branchName: row.detail.branchName,
          routingNumber: row.detail.routingNumber,
          isDefault: row.detail.isDefault,
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-01T10:00:00.000Z',
          deletedAt: row.detail.deletedAt,
        }
      : null,
    processedByAdmin: row.processedBy
      ? {
          id: row.processedBy.id,
          email: row.processedBy.email,
          profile: { displayName: row.processedBy.displayName },
        }
      : null,
  }
}

function bucket(status: Status) {
  const rows = withdrawals.filter((row) => row.status === status)
  const diamonds = rows.reduce((sum, row) => sum + row.amount, 0)
  return {
    count: rows.length,
    diamonds,
    amountBdt: rows.reduce((sum, row) => sum + money(row.amount).gross, 0),
  }
}

/* ------------------------------------------------------------------ *
 * Guards and validation — messages copied from staging
 * ------------------------------------------------------------------ */

function guard(): Response | null {
  const admin = currentMockAdmin()
  if (!admin) return errorResponse(401, 'UNAUTHORIZED', 'Authentication required.')
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') {
    return errorResponse(403, 'FORBIDDEN', 'Access Denied: Requires ADMIN privileges')
  }
  return null
}

async function prelude(): Promise<Response | null> {
  return (await applyScenario()) ?? guard()
}

function enumMessage(field: string, values: readonly string[], received: string) {
  return `querystring/${field} Invalid enum value. Expected ${values
    .map((value) => `'${value}'`)
    .join(' | ')}, received '${received}'`
}

function intCheck(field: string, raw: string | null, max?: number) {
  if (raw === null) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 1)
    return `querystring/${field} Number must be greater than or equal to 1`
  if (max && value > max)
    return `querystring/${field} Number must be less than or equal to ${max}`
  return null
}

async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  const text = await request.text()
  if (!text) {
    return request.headers.get('content-type')?.includes('application/json')
      ? errorResponse(
          400,
          'FST_ERR_CTP_EMPTY_JSON_BODY' as never,
          "Body cannot be empty when content-type is set to 'application/json'",
        )
      : {}
  }
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return errorResponse(400, VALIDATION, 'body must be object')
  }
}

function textCheck(
  body: Record<string, unknown>,
  field: string,
  {
    min,
    max,
    required,
    short,
  }: { min: number; max: number; required: boolean; short: string },
): string | null {
  const value = body[field]
  if (value === undefined || value === null)
    return required ? `body/${field} Required` : null
  if (typeof value !== 'string')
    return `body/${field} Expected string, received ${typeof value}`
  if (value.trim().length < min) return `body/${field} ${short}`
  if (value.length > max)
    return `body/${field} String must contain at most ${max} character(s)`
  return null
}

function conflict(row: MockWithdrawal, verb: string) {
  return errorResponse(
    409,
    'INVALID_STATE_TRANSITION',
    `Cannot ${verb} a withdrawal request with status ${row.status}`,
  )
}

function find(id: unknown): MockWithdrawal | undefined {
  return withdrawals.find((row) => row.id === id)
}

function stamp() {
  const admin = currentMockAdmin()
  return {
    id: admin?.id ?? SUPER.id,
    email: 'admin@callschat.com',
    displayName: admin?.displayName ?? SUPER.displayName,
  }
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

export const withdrawalHandlers = [
  http.get(`${BASE}/stats`, async () => {
    const stop = await prelude()
    if (stop) return stop
    const all = isEmptyScenario() ? [] : withdrawals
    const buckets = {
      pending: bucket('PENDING'),
      approved: bucket('APPROVED'),
      paid: bucket('PAID'),
      rejected: bucket('REJECTED'),
      cancelled: bucket('CANCELLED'),
    }
    if (all.length === 0) {
      for (const key of Object.keys(buckets) as (keyof typeof buckets)[]) {
        buckets[key] = { count: 0, diamonds: 0, amountBdt: 0 }
      }
    }
    return HttpResponse.json({
      success: true,
      data: {
        totalRequests: all.length,
        totalDiamonds: all.reduce((sum, row) => sum + row.amount, 0),
        totalAmountBdt: all.reduce((sum, row) => sum + money(row.amount).gross, 0),
        ...buckets,
      },
    })
  }),

  http.get(BASE, async ({ request }) => {
    const stop = await prelude()
    if (stop) return stop

    const params = new URL(request.url).searchParams
    const status = params.get('status')
    const sortBy = params.get('sortBy')
    const sortOrder = params.get('sortOrder')
    const error =
      intCheck('limit', params.get('limit'), 100) ??
      intCheck('page', params.get('page')) ??
      (status !== null && !(STATUSES as readonly string[]).includes(status)
        ? enumMessage('status', STATUSES, status)
        : null) ??
      (sortBy !== null && !(SORTS as readonly string[]).includes(sortBy)
        ? enumMessage('sortBy', SORTS, sortBy)
        : null) ??
      (sortOrder !== null && sortOrder !== 'asc' && sortOrder !== 'desc'
        ? enumMessage('sortOrder', ['asc', 'desc'], sortOrder)
        : null)
    if (error) return errorResponse(400, VALIDATION, error)

    const search = params.get('search')?.trim().toLowerCase()
    const userId = params.get('userId')
    const start = params.get('startDate')
    const end = params.get('endDate')

    const matched = (isEmptyScenario() ? [] : withdrawals).filter((row) => {
      const host = hostOf(row)
      if (status && row.status !== status) return false
      if (userId && host.userId !== userId) return false
      if (start && row.requestedAt < new Date(start).toISOString()) return false
      if (end && row.requestedAt > new Date(end).toISOString()) return false
      if (search) {
        // Measured: name, email, holder name and TrxID — not the account number.
        const haystack = [
          host.displayName,
          host.email,
          row.snapshot.accountName,
          row.transactionRef ?? '',
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })

    const key = (sortBy ?? 'createdAt') as (typeof SORTS)[number]
    const direction = sortOrder === 'asc' ? 1 : -1
    matched.sort((a, b) => {
      const left =
        key === 'createdAt' ? a.requestedAt : key === 'status' ? a.status : a.amount
      const right =
        key === 'createdAt' ? b.requestedAt : key === 'status' ? b.status : b.amount
      return left < right ? -direction : left > right ? direction : 0
    })

    const page = Number(params.get('page') ?? 1)
    const limit = Number(params.get('limit') ?? 20)
    const total = matched.length
    const totalPages = Math.ceil(total / limit)
    return HttpResponse.json({
      success: true,
      data: matched
        .slice((page - 1) * limit, page * limit)
        .map((row) => serialise(row)),
      pagination: { total, page, limit, totalPages, hasMore: page < totalPages },
    })
  }),

  http.get(`${BASE}/:id`, async ({ params }) => {
    const stop = await prelude()
    if (stop) return stop
    const row = find(params['id'])
    if (!row) return errorResponse(404, 'NOT_FOUND', 'Withdrawal request not found')
    return HttpResponse.json({ success: true, data: serialise(row, true) })
  }),

  http.patch(`${BASE}/:id/approve`, async ({ params, request }) => {
    const stop = await prelude()
    if (stop) return stop
    const body = await readBody(request)
    if (body instanceof Response) return body
    const row = find(params['id'])
    if (!row) return errorResponse(404, 'NOT_FOUND', 'Withdrawal request not found')
    if (row.status !== 'PENDING') return conflict(row, 'approve')
    row.status = 'APPROVED'
    row.processedBy = stamp()
    row.processedAt = new Date().toISOString()
    return HttpResponse.json({
      success: true,
      message: 'Withdrawal request approved successfully.',
      data: serialise(row),
    })
  }),

  http.patch(`${BASE}/:id/reject`, async ({ params, request }) => {
    const stop = await prelude()
    if (stop) return stop
    const body = await readBody(request)
    if (body instanceof Response) return body
    const error =
      textCheck(body, 'rejectReason', {
        min: 3,
        max: 500,
        required: true,
        short: 'Rejection reason must be at least 3 characters',
      }) ??
      textCheck(body, 'adminNote', { min: 0, max: 500, required: false, short: '' })
    if (error) return errorResponse(400, VALIDATION, error)
    const row = find(params['id'])
    if (!row) return errorResponse(404, 'NOT_FOUND', 'Withdrawal request not found')
    if (row.status !== 'PENDING' && row.status !== 'APPROVED')
      return conflict(row, 'reject')
    const host = hostOf(row)
    host.pendingWithdrawal = Math.max(0, host.pendingWithdrawal - row.amount)
    host.withdrawableDiamonds += row.amount
    row.status = 'REJECTED'
    row.rejectReason = String(body['rejectReason']).trim()
    row.adminNote =
      typeof body['adminNote'] === 'string' ? body['adminNote'].trim() : null
    row.processedBy = stamp()
    row.processedAt = new Date().toISOString()
    return HttpResponse.json({
      success: true,
      message: 'Withdrawal request rejected and diamonds refunded to host.',
      data: serialise(row),
    })
  }),

  http.patch(`${BASE}/:id/mark-paid`, async ({ params, request }) => {
    const stop = await prelude()
    if (stop) return stop
    const body = await readBody(request)
    if (body instanceof Response) return body
    const error =
      textCheck(body, 'transactionRef', {
        min: 3,
        max: 150,
        required: true,
        short: 'Transaction reference ID / TrxID is required',
      }) ??
      textCheck(body, 'adminNote', { min: 0, max: 500, required: false, short: '' })
    if (error) return errorResponse(400, VALIDATION, error)
    const row = find(params['id'])
    if (!row) return errorResponse(404, 'NOT_FOUND', 'Withdrawal request not found')
    if (row.status !== 'APPROVED') return conflict(row, 'mark as paid')
    const host = hostOf(row)
    host.pendingWithdrawal = Math.max(0, host.pendingWithdrawal - row.amount)
    row.status = 'PAID'
    row.transactionRef = String(body['transactionRef']).trim()
    if (typeof body['adminNote'] === 'string') row.adminNote = body['adminNote'].trim()
    row.processedBy = row.processedBy ?? stamp()
    row.paidAt = new Date().toISOString()
    return HttpResponse.json({
      success: true,
      message: 'Withdrawal marked as paid successfully.',
      data: serialise(row),
    })
  }),

  http.get(SETTINGS, async () => {
    const stop = await prelude()
    if (stop) return stop
    return HttpResponse.json({ success: true, data: { id: 'primary', ...settings } })
  }),

  http.put(SETTINGS, async ({ request }) => {
    const stop = await prelude()
    if (stop) return stop
    const admin = currentMockAdmin()
    if (admin?.role !== 'SUPER_ADMIN') {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Access Denied: Requires SUPER_ADMIN privileges',
      )
    }
    const body = await readBody(request)
    if (body instanceof Response) return body
    const numeric = [
      'minAmount',
      'maxAmount',
      'conversionRate',
      'feePercent',
      'feeFlat',
      'maxPaymentDetailsPerUser',
    ] as const
    for (const field of numeric) {
      const value = body[field]
      if (value !== undefined && typeof value !== 'number') {
        return errorResponse(
          400,
          VALIDATION,
          `body/${field} Expected number, received ${typeof value}`,
        )
      }
    }
    if (
      body['withdrawalsEnabled'] !== undefined &&
      typeof body['withdrawalsEnabled'] !== 'boolean'
    ) {
      return errorResponse(
        400,
        VALIDATION,
        `body/withdrawalsEnabled Expected boolean, received ${typeof body['withdrawalsEnabled']}`,
      )
    }
    settings = {
      ...settings,
      ...(body as Partial<MockSettings>),
      updatedAt: new Date().toISOString(),
      updatedBy: admin.id,
    }
    return HttpResponse.json({
      success: true,
      message: 'Withdrawal settings updated successfully.',
      data: { id: 'primary', ...settings },
    })
  }),
]
