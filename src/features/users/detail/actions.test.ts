import { describe, expect, it } from 'vitest'

import { accountStatusSchema } from '@/types/identity'

import { availableStatusActions } from './actions'

/**
 * Legal status transitions.
 *
 * ⚠️ Derived client-side because no endpoint supplies them (plan.md 3A′ #13).
 * These tests are what stops that derivation drifting unnoticed, and they are
 * the spec to hand the backend when it starts returning `availableActions[]`.
 */
describe('availableStatusActions', () => {
  it('offers only a restore for a banned account', () => {
    /*
     * Re-banning or suspending an already-banned account is meaningless, and
     * offering it invites an operator to think it did something.
     */
    expect(availableStatusActions('BANNED')).toEqual(['restore'])
  })

  it('offers lift or ban for a suspended account, never a second suspend', () => {
    const actions = availableStatusActions('SUSPENDED')
    expect(actions).toContain('unsuspend')
    expect(actions).toContain('ban')
    expect(actions).not.toContain('suspend')
  })

  it.each(['ACTIVE', 'INACTIVE', 'PENDING_VERIFICATION'] as const)(
    'offers suspend and ban for %s',
    (status) => {
      const actions = availableStatusActions(status)
      expect(actions).toContain('suspend')
      expect(actions).toContain('ban')
      // Nothing to restore or lift — the account is not banned or suspended.
      expect(actions).not.toContain('restore')
      expect(actions).not.toContain('unsuspend')
    },
  )

  it('returns actions for EVERY status the API can produce', () => {
    /*
     * Guards the enum against drift: if the backend adds a sixth status, this
     * fails rather than silently rendering a record with no available action.
     */
    for (const status of accountStatusSchema.options) {
      expect(availableStatusActions(status).length).toBeGreaterThan(0)
    }
  })

  it('never offers an action and its inverse at the same time', () => {
    for (const status of accountStatusSchema.options) {
      const actions = availableStatusActions(status)
      expect(actions.includes('suspend') && actions.includes('unsuspend')).toBe(false)
      expect(actions.includes('ban') && actions.includes('restore')).toBe(false)
    }
  })
})
