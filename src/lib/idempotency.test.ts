import { describe, expect, it } from 'vitest'

import { isFinancialMutation, newCorrelationId, newIdempotencyKey } from './idempotency'

describe('newIdempotencyKey', () => {
  it('produces a v4 UUID', () => {
    expect(newIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('produces a distinct key each call', () => {
    const keys = new Set(Array.from({ length: 200 }, () => newIdempotencyKey()))
    expect(keys.size).toBe(200)
  })
})

describe('newCorrelationId', () => {
  it('is prefixed and distinct from an idempotency key', () => {
    const id = newCorrelationId()
    expect(id.startsWith('corr_')).toBe(true)
    expect(id).not.toContain('-')
  })
})

describe('isFinancialMutation', () => {
  it('flags money-moving mutations', () => {
    expect(isFinancialMutation('POST', '/admin/adjustments')).toBe(true)
    expect(isFinancialMutation('POST', '/admin/withdrawals/wdr_1/approve')).toBe(true)
    expect(isFinancialMutation('POST', '/admin/withdrawals/wdr_1/reject')).toBe(true)
    expect(isFinancialMutation('POST', '/admin/payments/pay_1/refund')).toBe(true)
    expect(isFinancialMutation('POST', '/admin/payout-rates')).toBe(true)
    expect(isFinancialMutation('PATCH', '/admin/diamond-packages/dpk_1')).toBe(true)
  })

  it('does not flag reads, even of financial resources', () => {
    expect(isFinancialMutation('GET', '/admin/withdrawals/wdr_1')).toBe(false)
    expect(isFinancialMutation('GET', '/admin/adjustments')).toBe(false)
  })

  it('does not flag non-financial mutations', () => {
    expect(isFinancialMutation('POST', '/admin/users/usr_1/suspend')).toBe(false)
    expect(isFinancialMutation('POST', '/admin/moderation-cases/mcs_1/resolve')).toBe(
      false,
    )
  })
})
