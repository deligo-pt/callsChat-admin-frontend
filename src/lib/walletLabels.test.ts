import { describe, expect, it } from 'vitest'

import { giftName, methodOf, referenceSource } from './walletLabels'

describe('reading a source in words', () => {
  it.each([
    ['gift-heart_icon', 'Heart Icon'],
    ['gift-red_rose', 'Red Rose'],
    ['rocket', 'Rocket'],
    ['gift-', 'Gift'],
  ])('gift %j is called %j', (slug, name) => {
    expect(giftName(slug)).toBe(name)
  })

  it.each([
    ['Manual top-up via BKASH (TrxID: TEST0001)', 'bKash'],
    ['Manual top-up via NAGAD (TrxID: X)', 'Nagad'],
    ['Manual top-up via UPAY', 'Upay'],
    ['Approved by finance', null],
    [null, null],
  ])('the method in %j is %j', (note, method) => {
    expect(methodOf(note)).toBe(method)
  })

  it('names a reference by what it is', () => {
    expect(referenceSource('CREATOR_EARNINGS_CONVERT')).toBe('Creator Studio')
    expect(referenceSource('STREAK_REWARD')).toBe('Streak reward')
  })
})
