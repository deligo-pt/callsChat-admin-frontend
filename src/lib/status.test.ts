import { describe, expect, it } from 'vitest'

import { humaniseEnum, knownStatuses, resolveStatus, TONE_CLASSES } from './status'

describe('resolveStatus', () => {
  it('maps a known user status', () => {
    expect(resolveStatus('user', 'ACTIVE')).toEqual({
      label: 'Active',
      tone: 'success',
    })
    expect(resolveStatus('user', 'BANNED')).toEqual({ label: 'Banned', tone: 'danger' })
  })

  it('maps the same enum differently per domain where it matters', () => {
    expect(resolveStatus('withdrawal', 'APPROVED').tone).toBe('primary')
    expect(resolveStatus('hostApplication', 'APPROVED').tone).toBe('success')
  })

  it('degrades an unknown enum to a neutral humanised badge instead of throwing', () => {
    expect(resolveStatus('user', 'PENDING_DELETION')).toEqual({
      label: 'Pending deletion',
      tone: 'neutral',
    })
  })

  it('never returns a tone without a class mapping', () => {
    for (const domain of ['user', 'withdrawal', 'payment'] as const) {
      for (const value of knownStatuses(domain)) {
        expect(TONE_CLASSES[resolveStatus(domain, value).tone]).toBeTruthy()
      }
    }
  })
})

describe('humaniseEnum', () => {
  it('converts SCREAMING_SNAKE to sentence case', () => {
    expect(humaniseEnum('UNDER_REVIEW')).toBe('Under review')
    expect(humaniseEnum('SENT-TO-PROVIDER')).toBe('Sent to provider')
  })

  it('handles an empty value', () => {
    expect(humaniseEnum('   ')).toBe('Unknown')
  })
})
