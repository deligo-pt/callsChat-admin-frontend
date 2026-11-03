import { beforeEach, describe, expect, it } from 'vitest'

import { NotFoundError } from '@/api/errors'
import {
  adjustWallet,
  fetchWalletTransaction,
  fetchWalletTransactions,
  walletTransactionParams,
} from '@/api/wallet'
import { setSession } from '@/auth/tokenStore'
import { bangladeshDayBounds } from '@/lib/datetime'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import {
  mockWalletTransactions,
  resetMockWalletTransactions,
} from '@/mocks/handlers/walletTransactions'
import { users } from '@/mocks/seed'

import live from './walletTransactions.live.json'
import {
  directionOf,
  sourceOf,
  summaryFor,
  walletTransactionDetailEnvelopeSchema,
  walletTransactionListSchema,
} from './walletTransactions'

/**
 * The wallet ledger contract — plan.md §2, phase T1.
 *
 * `walletTransactions.live.json` holds what staging answered on 2026-11-01 to
 * 46 queries — every filter, every bound, every `400` — as ids, pagination,
 * summary and error. Only ids and numbers: no names or contact details.
 */

beforeEach(() => {
  resetMockWalletTransactions()
  signInMockAdmin('SUPER_ADMIN')
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

type Captured =
  | {
      s: 200
      ids: string[]
      pagination: Record<string, unknown>
      summary: Record<string, number>
    }
  | { s: number; err: { code: string; message: string } }

interface Answer {
  error: { code: string; message: string }
  data: { id: string }[]
  pagination: unknown
  summary: unknown
}

async function ask(query: string) {
  const response = await fetch(
    `http://localhost/api/v1/admin/wallet/transactions?${query}`,
  )
  return { status: response.status, body: (await response.json()) as Answer }
}

describe('the mock answers exactly as staging did', () => {
  /*
   * ⚠️ The broken parts included (plan.md B1–B3, B5) — a mock that filtered
   * correctly would let the panel pass here and fail live.
   */
  it.each(Object.entries(live as Record<string, Captured>))(
    '%s',
    async (query, expected) => {
      const { status, body } = await ask(query)
      expect(status).toBe(expected.s)
      if ('err' in expected) {
        expect({ code: body.error.code, message: body.error.message }).toEqual(
          expected.err,
        )
        return
      }
      expect(body.data.map((row) => row.id)).toEqual(expected.ids)
      expect(body.pagination).toEqual(expected.pagination)
      expect(body.summary).toEqual(expected.summary)
    },
  )
})

describe('the schemas accept what staging sends', () => {
  it('parses every captured row, its envelope, summary and hasMore', async () => {
    const { body } = await ask('limit=100')
    const parsed = walletTransactionListSchema.parse(body)
    expect(parsed.data).toHaveLength(59)
    expect(parsed.pagination.hasMore).toBe(false)
    expect(parsed.summary.totalVolumeDiamonds).toBe(17691)
  })

  it('keeps a type it has never heard of, rather than failing the page', () => {
    const row = { ...mockWalletTransactions()[0]!, type: 'STREAK_REWARD' }
    const parsed = walletTransactionListSchema.parse({
      success: true,
      data: [row],
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1, hasMore: false },
      summary: {
        totalTransactions: 1,
        totalVolumeDiamonds: 0,
        totalCreditDiamonds: 0,
        totalDebitDiamonds: 0,
      },
    })
    expect(parsed.data[0]?.type).toBe('STREAK_REWARD')
  })

  it('reads the current balance from the detail route', async () => {
    const newest = mockWalletTransactions()[0]!
    const detail = await fetchWalletTransaction(newest.id)
    expect(walletTransactionDetailEnvelopeSchema.shape.data.parse(detail)).toBeTruthy()
    expect(detail.user?.currentDiamondBalance).toBe(newest.balanceAfter)
  })

  it('reports an unknown id as not found', async () => {
    await expect(fetchWalletTransaction('nope')).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('the query only ever holds values the API accepts', () => {
  it('drops blanks, which are each a 400', () => {
    expect(
      walletTransactionParams({
        type: '',
        direction: ' ',
        sort: '',
        minAmount: '',
        limit: '',
        page: '',
        fromDate: '',
        toDate: '',
        userId: '  ',
        search: '   ',
      }),
    ).toEqual({})
  })

  it('upper-cases enums and refuses unknown ones', () => {
    expect(
      walletTransactionParams({ type: 'top_up', direction: 'debit', sort: 'ASC' }),
    ).toEqual({ type: 'TOP_UP', direction: 'DEBIT', sort: 'asc' })
    expect(
      walletTransactionParams({ type: 'TOP_UP,GIFT_SENT', direction: 'SIDEWAYS' }),
    ).toEqual({})
  })

  it('accepts the undocumented TOP_UP_PURCHASE', () => {
    expect(walletTransactionParams({ type: 'TOP_UP_PURCHASE' })).toEqual({
      type: 'TOP_UP_PURCHASE',
    })
  })

  it('sends whole numbers only, and clamps limit to 100', () => {
    expect(
      walletTransactionParams({ page: '2', limit: 500, minAmount: '100' }),
    ).toEqual({ page: 2, limit: 100, minAmount: 100 })
    expect(walletTransactionParams({ page: '1.5', limit: 0, minAmount: -5 })).toEqual(
      {},
    )
    expect(walletTransactionParams({ page: 'abc', minAmount: '1.5' })).toEqual({})
  })

  it('turns Bangladesh days into the UTC bounds the API wants', () => {
    expect(
      walletTransactionParams({ fromDate: '2026-10-29', toDate: '2026-10-29' }),
    ).toEqual({
      startDate: '2026-10-28T18:00:00.000Z',
      endDate: '2026-10-29T17:59:59.999Z',
    })
  })

  it('drops a day that does not exist', () => {
    expect(
      walletTransactionParams({ fromDate: '2026-02-31', toDate: '29/10/2026' }),
    ).toEqual({})
  })

  it('trims the user and the search', () => {
    expect(walletTransactionParams({ userId: ' u1 ', search: '  bkash ' })).toEqual({
      userId: 'u1',
      search: 'bkash',
    })
  })

  it('never sends maxAmount, which the API ignores', () => {
    const params = walletTransactionParams({ maxAmount: 10 } as never)
    expect(params).not.toHaveProperty('maxAmount')
  })

  it('turns a URL full of bad values into a page, not a 400', async () => {
    const page = await fetchWalletTransactions({
      type: 'top_up',
      direction: '',
      sort: 'NEWEST',
      limit: '500',
      page: '0',
      fromDate: '2026-02-31',
      minAmount: '1.5',
    })
    expect(page.data.length).toBeGreaterThan(0)
    expect(page.data.every((row) => row.type === 'TOP_UP')).toBe(true)
  })
})

describe('Bangladesh days', () => {
  it.each([
    ['2026-01-01', '2025-12-31T18:00:00.000Z', '2026-01-01T17:59:59.999Z'],
    ['2028-02-29', '2028-02-28T18:00:00.000Z', '2028-02-29T17:59:59.999Z'],
  ])('%s', (day, start, end) => {
    expect(bangladeshDayBounds(day)).toEqual({ start, end })
  })

  it.each(['2026-02-29', '2026-13-01', '2026-1-1', '', '2026-10-29T00:00:00Z'])(
    'refuses %j',
    (day) => {
      expect(bangladeshDayBounds(day)).toBeNull()
    },
  )
})

describe('reading a row honestly', () => {
  it('calls a free gift Free, though the server says CREDIT (B2)', () => {
    const free = mockWalletTransactions().find((row) => row.amount === 0)!
    expect(free.direction).toBe('CREDIT')
    expect(directionOf(free)).toBe('FREE')
    expect(directionOf({ amount: 5 })).toBe('CREDIT')
    expect(directionOf({ amount: -5 })).toBe('DEBIT')
  })

  it('corrects the summary for the direction filter (B3)', async () => {
    /* Staging: debit-only, the count follows the filter and the totals do not. */
    const debit = await fetchWalletTransactions({ direction: 'DEBIT', limit: 100 })
    expect(debit.summary.totalCreditDiamonds).toBe(13570)
    const corrected = summaryFor(debit.summary, 'DEBIT')
    const shown = debit.data.reduce((sum, row) => sum + Math.abs(row.amount), 0)
    expect(corrected).toEqual({
      totalTransactions: 17,
      totalVolumeDiamonds: shown,
      totalCreditDiamonds: 0,
      totalDebitDiamonds: shown,
    })

    const credit = await fetchWalletTransactions({ direction: 'CREDIT', limit: 100 })
    const credited = credit.data.reduce((sum, row) => sum + row.amount, 0)
    expect(summaryFor(credit.summary, 'CREDIT')).toEqual({
      totalTransactions: 19,
      totalVolumeDiamonds: credited,
      totalCreditDiamonds: credited,
      totalDebitDiamonds: 0,
    })
  })

  it('leaves the summary alone without a direction', async () => {
    const page = await fetchWalletTransactions({ limit: 1 })
    expect(summaryFor(page.summary, undefined)).toBe(page.summary)
  })

  it('names where each type came from', () => {
    expect(sourceOf({ type: 'TOP_UP', refId: 'req1' })).toEqual({
      kind: 'topUpRequest',
      requestId: 'req1',
    })
    expect(sourceOf({ type: 'ADMIN_ADJUSTMENT', refId: 'adm1' })).toEqual({
      kind: 'adjustedBy',
      adminId: 'adm1',
    })
    expect(sourceOf({ type: 'GIFT_SENT', refId: 'gift-heart_icon' })).toEqual({
      kind: 'gift',
      slug: 'gift-heart_icon',
    })
    expect(sourceOf({ type: 'TOP_UP_PURCHASE', refId: 'x' })).toEqual({
      kind: 'reference',
      refId: 'x',
    })
    expect(sourceOf({ type: 'TOP_UP', refId: '  ' })).toEqual({ kind: 'none' })
  })
})

describe('an adjustment writes a ledger row, as live does', () => {
  it('records type, amount, balance after, note and the admin', async () => {
    const target = users.find((user) => user.wallet.availableDiamonds > 100)!
    const before = target.wallet.availableDiamonds
    await adjustWallet({
      userId: target.id,
      amount: -50,
      note: 'Reversing a test credit.',
    })

    const page = await fetchWalletTransactions({ userId: target.id })
    expect(page.data[0]).toMatchObject({
      type: 'ADMIN_ADJUSTMENT',
      amount: -50,
      direction: 'DEBIT',
      balanceAfter: before - 50,
      note: 'Reversing a test credit.',
    })
    expect(page.data[0]?.refId).toBeTruthy()
    target.wallet.availableDiamonds = before
  })
})
