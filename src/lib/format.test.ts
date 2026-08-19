import { describe, expect, it } from 'vitest'

import {
  formatDiamonds,
  formatDuration,
  formatMoney,
  minorUnitExponent,
  minorUnitsToDecimalString,
} from './format'

describe('minorUnitsToDecimalString', () => {
  it('converts two-decimal minor units exactly', () => {
    expect(minorUnitsToDecimalString(3600, 2)).toBe('36.00')
    expect(minorUnitsToDecimalString(1, 2)).toBe('0.01')
    expect(minorUnitsToDecimalString(0, 2)).toBe('0.00')
  })

  it('handles negative amounts', () => {
    expect(minorUnitsToDecimalString(-400, 2)).toBe('-4.00')
  })

  it('handles zero-decimal currencies', () => {
    expect(minorUnitsToDecimalString(400000, 0)).toBe('400000')
  })

  it('handles three-decimal currencies', () => {
    expect(minorUnitsToDecimalString(1234, 3)).toBe('1.234')
  })

  it('preserves precision beyond float-safe cents', () => {
    // 1_000_000_000_001 cents would lose precision through float division.
    expect(minorUnitsToDecimalString(1_000_000_000_001, 2)).toBe('10000000000.01')
  })

  it('rejects non-integer input', () => {
    expect(() => minorUnitsToDecimalString(10.5, 2)).toThrow(/integers in minor units/)
  })
})

describe('minorUnitExponent', () => {
  it('defaults to 2', () => {
    expect(minorUnitExponent('USD')).toBe(2)
    expect(minorUnitExponent('eur')).toBe(2)
  })

  it('knows zero-decimal currencies', () => {
    expect(minorUnitExponent('JPY')).toBe(0)
    expect(minorUnitExponent('KRW')).toBe(0)
  })

  it('knows three-decimal currencies', () => {
    expect(minorUnitExponent('KWD')).toBe(3)
  })
})

describe('formatMoney', () => {
  it('formats USD from minor units', () => {
    expect(formatMoney(3600, 'USD', { locale: 'en-US' })).toBe('$36.00')
  })

  it('formats a zero-decimal currency without a fraction', () => {
    expect(formatMoney(400000, 'JPY', { locale: 'en-US' })).toBe('¥400,000')
  })

  it('formats negative amounts', () => {
    expect(formatMoney(-400, 'USD', { locale: 'en-US' })).toBe('-$4.00')
  })
})

describe('formatDiamonds', () => {
  it('groups thousands', () => {
    expect(formatDiamonds(1284500, 'en-US')).toBe('1,284,500')
  })

  it('rejects fractional Diamonds', () => {
    expect(() => formatDiamonds(10.5)).toThrow(/integers/)
  })
})

describe('formatDuration', () => {
  it('formats hours', () => {
    expect(formatDuration(5040)).toBe('1h 24m')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(192)).toBe('3m 12s')
  })

  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('45s')
  })
})
