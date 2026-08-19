import { describe, expect, it } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1')
  })

  it('lets a later Tailwind utility win over a conflicting earlier one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('drops falsy values', () => {
    expect(cn('px-2', false, null, undefined, '')).toBe('px-2')
  })

  it('supports conditional objects and arrays', () => {
    expect(cn(['px-2', { 'text-danger': true, 'text-success': false }])).toBe(
      'px-2 text-danger',
    )
  })
})
