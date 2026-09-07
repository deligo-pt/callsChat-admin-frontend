import { describe, expect, it } from 'vitest'

import {
  humaniseEnum,
  knownStatuses,
  resolveMaintenanceState,
  resolveStatus,
  TONE_CLASSES,
} from './status'

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

describe('system settings domains', () => {
  it('treats a running backup as informational, not a warning', () => {
    // A job in flight is the expected state, not something needing attention.
    expect(resolveStatus('backup', 'RUNNING')).toEqual({
      label: 'Running',
      tone: 'info',
    })
    expect(resolveStatus('backup', 'FAILED').tone).toBe('danger')
  })

  it('treats a disabled SMS provider as a fault, not a preference', () => {
    /*
     * With no provider, no user can receive an OTP — sign-in and sign-up are
     * down platform-wide. A neutral badge would understate that badly.
     */
    expect(resolveStatus('smsProvider', 'DISABLED').tone).toBe('danger')
    expect(resolveStatus('smsProvider', 'BULKGATE')).toEqual({
      label: 'BulkGate',
      tone: 'info',
    })
  })

  it('gives every new domain a tone that has a class mapping', () => {
    for (const domain of ['backup', 'smsProvider', 'smsTest', 'maintenance'] as const) {
      for (const value of knownStatuses(domain)) {
        expect(TONE_CLASSES[resolveStatus(domain, value).tone]).toBeTruthy()
      }
    }
  })
})

describe('resolveMaintenanceState', () => {
  const NOW = new Date('2026-09-01T12:00:00.000Z')

  it('is ACTIVE whenever the switch is on, window or not', () => {
    // The switch is the only thing that blocks traffic.
    expect(resolveMaintenanceState(true, null, NOW)).toBe('ACTIVE')
    expect(resolveMaintenanceState(true, '2026-12-01T00:00:00.000Z', NOW)).toBe(
      'ACTIVE',
    )
  })

  it('is SCHEDULED only for a future window with the switch off', () => {
    expect(resolveMaintenanceState(false, '2026-09-02T00:00:00.000Z', NOW)).toBe(
      'SCHEDULED',
    )
  })

  it('is OFF for a window that has already passed', () => {
    /*
     * Nothing automatic happens at the start time, so a past window with the
     * switch off means the maintenance simply never ran — not that it is live.
     */
    expect(resolveMaintenanceState(false, '2026-08-01T00:00:00.000Z', NOW)).toBe('OFF')
  })

  it('is OFF with no window, and does not crash on a malformed one', () => {
    expect(resolveMaintenanceState(false, null, NOW)).toBe('OFF')
    expect(resolveMaintenanceState(false, 'not-a-date', NOW)).toBe('OFF')
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
