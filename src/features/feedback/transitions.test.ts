import { describe, expect, it } from 'vitest'

import { FEEDBACK_STATUS_VALUES, type FeedbackStatus } from '@/types/feedback'

import { canTransition, isTerminatingStatus, transitionsFor } from './transitions'

/**
 * The state machine, as verified live on 2026-09-06
 * (feedback_management_plan.md §2.5).
 */

const MATRIX: Readonly<Record<FeedbackStatus, readonly FeedbackStatus[]>> = {
  PENDING: ['REVIEWING', 'IN_PROGRESS', 'CLOSED'],
  REVIEWING: ['IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED', 'REOPENED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'REVIEWING', 'RESOLVED', 'CLOSED'],
}

describe('transitionsFor', () => {
  it.each(FEEDBACK_STATUS_VALUES)('matches the live matrix for %s', (status) => {
    expect(transitionsFor(status)).toEqual(MATRIX[status])
  })

  it('NEVER offers the current status, even though the server accepts it', () => {
    /*
     * The mitigation for §3.4. `PATCH /:id/status` with the ticket's current
     * status answered 200 live and appended a `REOPENED → REOPENED` row to the
     * audit trail, contrary to the documented matrix. The panel's only defence
     * is that the control is built from this list — so if this assertion ever
     * fails, an operator can write junk into a colleague's audit history with
     * one click.
     */
    for (const status of FEEDBACK_STATUS_VALUES) {
      expect(transitionsFor(status)).not.toContain(status)
    }
  })

  it('always offers at least one move — no ticket is a dead end', () => {
    for (const status of FEEDBACK_STATUS_VALUES) {
      expect(transitionsFor(status).length).toBeGreaterThan(0)
    }
  })

  it('offers only CLOSED -> REOPENED, the narrowest state', () => {
    expect(transitionsFor('CLOSED')).toEqual(['REOPENED'])
  })
})

describe('canTransition', () => {
  it('accepts every pair in the matrix and refuses every pair outside it', () => {
    for (const from of FEEDBACK_STATUS_VALUES) {
      for (const to of FEEDBACK_STATUS_VALUES) {
        expect(canTransition(from, to)).toBe(MATRIX[from].includes(to))
      }
    }
  })

  it('refuses a self-transition, disagreeing with the server on purpose', () => {
    for (const status of FEEDBACK_STATUS_VALUES) {
      expect(canTransition(status, status)).toBe(false)
    }
  })

  it('refuses the pair the live API rejected by name', () => {
    /* "Invalid status transition from 'CLOSED' to 'PENDING'." */
    expect(canTransition('CLOSED', 'PENDING')).toBe(false)
  })
})

describe('isTerminatingStatus', () => {
  it('is true only for the two states that end the reporter’s wait', () => {
    expect(isTerminatingStatus('RESOLVED')).toBe(true)
    expect(isTerminatingStatus('CLOSED')).toBe(true)
    expect(isTerminatingStatus('PENDING')).toBe(false)
    expect(isTerminatingStatus('REVIEWING')).toBe(false)
    expect(isTerminatingStatus('IN_PROGRESS')).toBe(false)
    expect(isTerminatingStatus('REOPENED')).toBe(false)
  })
})
