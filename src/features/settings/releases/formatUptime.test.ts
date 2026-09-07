import { describe, expect, it } from 'vitest'

import { formatUptime } from './formatUptime'

describe('formatUptime', () => {
  it('shows seconds only under a minute', () => {
    expect(formatUptime(0)).toBe('0s')
    expect(formatUptime(59)).toBe('59s')
  })

  it('drops seconds once minutes are meaningful', () => {
    expect(formatUptime(60)).toBe('1m')
    expect(formatUptime(3_599)).toBe('59m')
  })

  it('reads hours and minutes for a service up part of a day', () => {
    // The real value observed on production: 40402s.
    expect(formatUptime(40_402)).toBe('11h 13m')
  })

  it('switches to days once it has been up longer than one', () => {
    // "Has it restarted recently?" is the only question this answers.
    expect(formatUptime(200_000)).toBe('2d 7h')
  })

  it('does not produce nonsense for a bad value', () => {
    expect(formatUptime(-5)).toBe('0s')
    expect(formatUptime(1.9)).toBe('1s')
  })
})
