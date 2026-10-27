import { describe, expect, it } from 'vitest'

import {
  adjustWalletSchema,
  createPackageSchema,
  diamondPackageListSchema,
  economySettingsSchema,
  isManualMethod,
  MAX_LIST_LIMIT,
  MIN_PANEL_REJECTION_REASON,
  PAYMENT_METHODS,
  paymentMethodSchema,
  topUpRequestListSchema,
  topUpStatusSchema,
  TOP_UP_STATUSES,
} from '@/types/wallet'

/**
 * The wallet contract — phase W1.
 *
 * ⚠️ Every assertion here is pinned to something **measured** on
 * `test-api.callschat.com` on 2026-10-27, not to the integration guide. The
 * guide and the server disagree in nine places and the tests follow the
 * server; each one says which.
 */

describe('the payment method enum', () => {
  it('matches the server, which means UPAY is absent', () => {
    /*
     * ⚠️ The guide documents `BKASH, NAGAD, ROCKET, UPAY, BANK`. The server's
     * own 400 says:
     *
     *   Expected 'BKASH' | 'NAGAD' | 'ROCKET' | 'BANK' | 'STRIPE' |
     *            'GOOGLE_PLAY' | 'APPLE_IAP', received 'x'
     *
     * A filter offering UPAY would 400 on click.
     */
    expect([...PAYMENT_METHODS]).toEqual([
      'BKASH',
      'NAGAD',
      'ROCKET',
      'BANK',
      'STRIPE',
      'GOOGLE_PLAY',
      'APPLE_IAP',
    ])
    expect(paymentMethodSchema.safeParse('UPAY').success).toBe(false)
  })

  it('carries the three undocumented gateway methods', () => {
    /*
     * These change what the screen is. The guide frames this queue as manual
     * mobile-money verification; a Stripe or App Store row has nothing for an
     * operator to check against a bank statement.
     */
    for (const method of ['STRIPE', 'GOOGLE_PLAY', 'APPLE_IAP']) {
      expect(paymentMethodSchema.safeParse(method).success).toBe(true)
      expect(isManualMethod(method)).toBe(false)
    }

    for (const method of ['BKASH', 'NAGAD', 'ROCKET', 'BANK']) {
      expect(isManualMethod(method)).toBe(true)
    }
  })

  it('is case-sensitive, as the server is', () => {
    expect(paymentMethodSchema.safeParse('bkash').success).toBe(false)
    expect(topUpStatusSchema.safeParse('pending').success).toBe(false)
    expect(topUpStatusSchema.safeParse('PENDING').success).toBe(true)
  })

  it('knows the fourth status the host queue does not have', () => {
    /* ⚠️ `CANCELLED` exists here and nowhere in the host application enum. */
    expect([...TOP_UP_STATUSES]).toContain('CANCELLED')
  })
})

describe('the queue envelope', () => {
  /**
   * Captured verbatim from `GET /admin/wallet/requests?status=PENDING&page=1&limit=5`
   * on 2026-10-27. ⚠️ Do not retype it from the guide — the guide shows
   * `{ data: [...], pagination: {...} }`, and that is the whole point of this
   * test.
   */
  const CAPTURED = {
    success: true,
    data: { items: [], total: 0, page: 1, limit: 5, totalPages: 0 },
  } as const

  it('parses the shape the server actually sends', () => {
    const parsed = topUpRequestListSchema.parse(CAPTURED)
    expect(parsed.data.items).toEqual([])
    expect(parsed.data.total).toBe(0)
  })

  it('rejects the shape the guide prints', () => {
    /*
     * If this ever starts passing, the server changed envelope and the client
     * needs to change with it — silently accepting both is how a list renders
     * empty forever.
     */
    const fromTheGuide = {
      success: true,
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    }
    expect(topUpRequestListSchema.safeParse(fromTheGuide).success).toBe(false)
  })

  it('survives a row with almost nothing on it', () => {
    /*
     * ⚠️ No row has ever been observed — the live table is empty — so the
     * schema is permissive by design. The host module shipped a strict guess
     * and a real record disproved it.
     */
    const parsed = topUpRequestListSchema.parse({
      success: true,
      data: {
        items: [{ id: 'req_1' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    })
    expect(parsed.data.items[0]?.id).toBe('req_1')
  })

  it('keeps an unknown method rather than dropping the row', () => {
    const parsed = topUpRequestListSchema.parse({
      success: true,
      data: {
        items: [{ id: 'req_1', method: 'SOMETHING_NEW', status: 'WAT' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    })
    expect(parsed.data.items[0]?.method).toBe('SOMETHING_NEW')
  })
})

describe('the packages envelope', () => {
  it('is a bare array with no pagination', () => {
    /* Captured: `{"success":true,"data":[]}` — measured 2026-10-27. */
    const parsed = diamondPackageListSchema.parse({ success: true, data: [] })
    expect(parsed.data).toEqual([])
  })

  it('keeps a fractional USD price as a float', () => {
    /*
     * ⚠️ `priceUsd: 25.5` must not be coerced to an integer or rejected.
     * `minorUnits` would have done one or the other.
     */
    const parsed = diamondPackageListSchema.parse({
      success: true,
      data: [{ id: 'pkg_1', priceBdt: 3000, priceUsd: 25.5 }],
    })
    expect(parsed.data[0]?.priceUsd).toBe(25.5)
  })
})

describe('the write payloads', () => {
  it('refuses a zero adjustment, in the server’s own words', () => {
    const result = adjustWalletSchema.safeParse({ userId: 'u1', amount: 0, note: 'x' })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain('Amount cannot be zero')
  })

  it('allows a negative adjustment, because a debit is a first-class case', () => {
    expect(
      adjustWalletSchema.safeParse({ userId: 'u1', amount: -500, note: 'reversal' })
        .success,
    ).toBe(true)
  })

  it('requires a note, which is a permanent ledger record', () => {
    expect(adjustWalletSchema.safeParse({ userId: 'u1', amount: 5 }).success).toBe(
      false,
    )
  })

  it('reuses the server’s wordings for a package, so the two cannot disagree', () => {
    const result = createPackageSchema.safeParse({
      title: '',
      diamonds: -5,
      priceBdt: -1,
    })
    const issues = JSON.stringify(result.error?.issues)
    expect(issues).toContain('Title is required')
    expect(issues).toContain('Base diamonds must be positive')
    expect(issues).toContain('BDT price must be positive')
  })
})

describe('the economy settings', () => {
  it('has the two fields that exist, and not the one that does not', () => {
    /*
     * ⚠️ `defaultHostRevenueSharePercent` is documented and is NOT in the
     * settings record — all 25 keys were read on 2026-10-27. Revenue share is
     * per host, on the profile.
     */
    expect(Object.keys(economySettingsSchema.shape).sort()).toEqual([
      'minCreatorTransferLimit',
      'newUserDiamondBonus',
    ])
  })

  it('refuses a negative bonus in the server’s wording', () => {
    const result = economySettingsSchema.safeParse({
      newUserDiamondBonus: -1,
      minCreatorTransferLimit: 50,
    })
    expect(JSON.stringify(result.error?.issues)).toContain('Bonus cannot be negative')
  })
})

describe('the measured limits', () => {
  it('caps the page size where the server does', () => {
    expect(MAX_LIST_LIMIT).toBe(100)
  })

  it('asks for more than the server does before rejecting a payment', () => {
    /*
     * The server accepts a one-character reason. This text is read by the
     * person whose payment was refused, and they cannot ask a follow-up.
     */
    expect(MIN_PANEL_REJECTION_REASON).toBeGreaterThan(1)
  })
})
