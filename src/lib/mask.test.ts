import { describe, expect, it } from 'vitest'

import { maskEmail, maskPhone, maskReference, truncateMiddle } from './mask'

describe('maskPhone', () => {
  it('keeps the country prefix and last four digits', () => {
    expect(maskPhone('+8801712345678')).toBe('+880••••••5678')
  })

  it('masks a number without a country prefix', () => {
    expect(maskPhone('01712345678')).toBe('•••••••5678')
  })

  it('fully masks a very short value', () => {
    expect(maskPhone('123')).toBe('•••')
  })

  it('returns empty for empty input', () => {
    expect(maskPhone('')).toBe('')
  })
})

describe('maskEmail', () => {
  it('keeps two local characters and the domain', () => {
    expect(maskEmail('jonathan.doe@example.com')).toBe('jo••••••••••@example.com')
  })

  it('masks a very short local part entirely', () => {
    expect(maskEmail('ab@example.com')).toBe('••@example.com')
  })

  it('masks a value with no @ sign', () => {
    expect(maskEmail('notanemail')).toBe('••••••••••')
  })
})

describe('maskReference', () => {
  it('keeps a provider prefix and the last four characters', () => {
    expect(maskReference('acct_1M2n3B4v5C6x7Z')).toBe('acct_••••6x7Z')
  })

  it('masks a value with no prefix', () => {
    expect(maskReference('1234567890')).toBe('••••7890')
  })

  it('fully masks a very short value', () => {
    expect(maskReference('12')).toBe('••')
  })
})

describe('truncateMiddle', () => {
  it('leaves short values untouched', () => {
    expect(truncateMiddle('short', 18)).toBe('short')
  })

  it('truncates the middle of a long identifier', () => {
    const result = truncateMiddle('corr_01JQZ8N4X7VYB2K9TREM5HWDCF', 16)
    expect(result).toHaveLength(16)
    expect(result).toContain('…')
    expect(result.startsWith('corr_')).toBe(true)
    expect(result.endsWith('HWDCF')).toBe(true)
  })
})
