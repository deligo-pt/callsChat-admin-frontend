import { beforeEach, describe, expect, it } from 'vitest'

import { isAppError } from '@/api/errors'
import { setSession } from '@/auth/tokenStore'
import { resetMockStaff } from '@/mocks/handlers/staff'
import { staffListResponseSchema, staffMemberSchema } from '@/types/staff'

import {
  createStaffMember,
  deleteStaffMember,
  fetchStaffList,
  fetchStaffMember,
  resetStaffPassword,
  updateStaffPermissions,
  updateStaffRole,
  updateStaffStatus,
} from './api'

/**
 * Mock-fidelity tests.
 *
 * These do not test the mock for its own sake — they test that the mock is as
 * **hostile** as the live service, because five of the seven traps in
 * staff_management_plan.md §3 are invisible from a success response. A
 * permissive mock answers 200 to a delta-posting permission bug, to a
 * cache-seeding staleness bug, and to a deleted-row action; the suite goes
 * green and the defect ships.
 *
 * Every expectation below was verified against the real API on 2026-09-03. If
 * one of these fails, either the mock drifted or the backend was fixed — and
 * the second is worth checking before deleting the test.
 */

const listKey = { page: 1, limit: 100 }

/*
 * The MSW server is started once for the whole suite by `tests/setup.ts`.
 * Only the roster needs resetting here — it is module state that outlives a
 * `localStorage` clear, so without this a deletion in one test leaks into the
 * next.
 */
beforeEach(() => {
  resetMockStaff()
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('reads', () => {
  it('returns the standard paginated envelope', async () => {
    const result = await fetchStaffList(listKey)
    expect(() => staffListResponseSchema.parse(result)).not.toThrow()
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('filters by role, status and search', async () => {
    const admins = await fetchStaffList({ ...listKey, role: 'ADMIN' })
    expect(admins.data.every((row) => row.role === 'ADMIN')).toBe(true)

    const suspended = await fetchStaffList({ ...listKey, status: 'SUSPENDED' })
    expect(suspended.data.every((row) => row.status === 'SUSPENDED')).toBe(true)

    const found = await fetchStaffList({ ...listKey, search: 'sarah' })
    expect(found.data).toHaveLength(1)

    const missing = await fetchStaffList({ ...listKey, search: 'zzzzzzzz' })
    expect(missing.data).toHaveLength(0)
  })

  it('rejects an out-of-range limit with the live message', async () => {
    await expect(fetchStaffList({ ...listKey, limit: 500 })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message.includes('Number must be less than or equal to 100'),
    )
  })

  it('refuses INACTIVE as a status filter', async () => {
    /*
     * ⚠️ The heart of staff_management_plan.md §3.4. The filter enum omits
     * `INACTIVE`, so deleted rows can be neither excluded nor isolated
     * server-side — which is the entire reason the directory needs a
     * client-side "Hide deleted" toggle in A1.
     */
    await expect(fetchStaffList({ ...listKey, status: 'INACTIVE' })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('querystring/status'),
    )
  })
})

describe('trap: deleted rows are visible but inert (§3.4)', () => {
  it('lists a soft-deleted account despite the doc claiming otherwise', async () => {
    const result = await fetchStaffList(listKey)
    const deleted = result.data.find((row) => row.status === 'INACTIVE')
    expect(deleted).toBeDefined()
  })

  it('returns 200 on a read of a deleted account', async () => {
    const row = await fetchStaffMember('stf_deleted')
    expect(row.status).toBe('INACTIVE')
  })

  it('404s on every mutation against a deleted account', async () => {
    /*
     * The asymmetry that shapes the whole UI: reads do not filter `deletedAt`,
     * mutations do. So a deleted row renders as an ordinary row whose every
     * button fails — hence "suppress actions", not "disable with a tooltip".
     */
    await expect(updateStaffPermissions('stf_deleted', ['USER_VIEW'])).rejects.toThrow()
    await expect(
      updateStaffStatus('stf_deleted', { status: 'ACTIVE', reason: 'x' }),
    ).rejects.toThrow()
    await expect(updateStaffRole('stf_deleted', 'ADMIN')).rejects.toThrow()
    await expect(deleteStaffMember('stf_deleted')).rejects.toThrow()
  })
})

describe('trap: permissions replace, never merge (§3.3)', () => {
  it('drops keys that were not resent', async () => {
    const before = await fetchStaffMember('stf_sarah')
    expect(before.adminPermissions).toContain('USER_VIEW')

    const after = await updateStaffPermissions('stf_sarah', ['DASHBOARD_VIEW'])

    expect(after.adminPermissions).toEqual(['DASHBOARD_VIEW'])
    expect(after.adminPermissions).not.toContain('USER_VIEW')
  })

  it('accepts an empty array as a full revocation', async () => {
    const after = await updateStaffPermissions('stf_sarah', [])
    expect(after.adminPermissions).toEqual([])
  })

  it('rejects an unknown key with an indexed message', async () => {
    await expect(
      // @ts-expect-error — deliberately outside the enum.
      updateStaffPermissions('stf_sarah', ['USER_VIEW', 'TIME_TRAVEL']),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('body/permissions/1'),
    )
  })
})

describe('trap: the mutation response is stale by one revocation (§3.7)', () => {
  it('echoes pre-revocation counts that a refetch then contradicts', async () => {
    const before = await fetchStaffMember('stf_sarah')
    expect(before.activeSessionsCount).toBe(2)

    const echoed = await updateStaffStatus('stf_sarah', {
      status: 'SUSPENDED',
      reason: 'Contract test.',
    })
    const refetched = await fetchStaffMember('stf_sarah')

    /*
     * This is the whole point. Seeding the cache from `echoed` would show two
     * live sessions on an account whose sessions were destroyed by that very
     * call — precisely the fact an operator is checking.
     */
    expect(echoed.activeSessionsCount).toBe(2)
    expect(refetched.activeSessionsCount).toBe(0)
    expect(refetched.lastActiveAt).toBeNull()
  })
})

describe('trap: reason is optional server-side (§3.6)', () => {
  it('accepts a ban with no reason at all', async () => {
    /*
     * plan.md §10B requires a reason on every status change; the backend does
     * not enforce it. If this ever starts failing, the client-side enforcement
     * in A4 has become redundant rather than load-bearing.
     */
    const result = await updateStaffStatus('stf_sarah', { status: 'BANNED' })
    expect(result.status).toBe('BANNED')
  })
})

describe('role changes leave permissions alone', () => {
  it('keeps every key across a promotion', async () => {
    const before = await fetchStaffMember('stf_sarah')
    const after = await updateStaffRole('stf_sarah', 'ADMIN')

    expect(after.role).toBe('ADMIN')
    expect(after.adminPermissions).toEqual(before.adminPermissions)
  })
})

describe('create', () => {
  it('provisions an account and returns the full record', async () => {
    const created = await createStaffMember({
      email: 'new.person@callschat.com',
      password: 'StrongPass123',
      displayName: 'New Person',
      role: 'MODERATOR',
      permissions: ['USER_VIEW'],
    })

    expect(() => staffMemberSchema.parse(created)).not.toThrow()
    expect(created.username).toMatch(/^staff_new\.person_/)
    expect(created.status).toBe('ACTIVE')
    expect(created.adminPermissions).toEqual(['USER_VIEW'])
  })

  it('omits a blank phone rather than storing an empty string', async () => {
    const created = await createStaffMember({
      email: 'no.phone@callschat.com',
      password: 'StrongPass123',
      displayName: 'No Phone',
      role: 'MODERATOR',
      phone: '   ',
    })
    expect(created.phone).toBeNull()
  })

  it('reports every bad field in one rejection', async () => {
    await expect(
      createStaffMember({
        email: 'not-an-email',
        password: 'short',
        displayName: '',
        role: 'MODERATOR',
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message.includes('body/email') &&
        error.message.includes('body/password') &&
        error.message.includes('body/displayName'),
    )
  })

  it('accepts a phone the live API would also accept unvalidated (§8 O4)', async () => {
    const created = await createStaffMember({
      email: 'odd.phone@callschat.com',
      password: 'StrongPass123',
      displayName: 'Odd Phone',
      role: 'MODERATOR',
      phone: 'nonsense',
    })
    expect(created.phone).toBe('nonsense')
  })
})

describe('reset password and delete', () => {
  it('resolves with no record, because neither endpoint returns one', async () => {
    await expect(
      resetStaffPassword('stf_sarah', 'AnotherPass123'),
    ).resolves.toBeUndefined()
    await expect(deleteStaffMember('stf_marcus')).resolves.toBeUndefined()
  })

  it('rejects a password below the server floor of 8', async () => {
    await expect(resetStaffPassword('stf_sarah', 'short')).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('body/newPassword'),
    )
  })

  it('leaves a deleted account in the directory, marked INACTIVE', async () => {
    await deleteStaffMember('stf_marcus')
    const result = await fetchStaffList(listKey)
    const row = result.data.find((entry) => entry.id === 'stf_marcus')

    expect(row).toBeDefined()
    expect(row?.status).toBe('INACTIVE')
  })
})

describe('Super Admin immunity and invisibility (§2.8)', () => {
  const SUPER_ADMIN_ID = 'cmt8orkov00004upco3oifg2v'

  it('404s a read of a Super Admin — invisible, not merely protected', async () => {
    await expect(fetchStaffMember(SUPER_ADMIN_ID)).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.status === 404,
    )
  })

  it('403s a status change against a Super Admin', async () => {
    await expect(
      updateStaffStatus(SUPER_ADMIN_ID, { status: 'SUSPENDED', reason: 'x' }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.status === 403 &&
        error.message.includes('Super Administrator accounts cannot be suspended'),
    )
  })
})

describe('the role-gated 403 (§5.7)', () => {
  it('refuses every route for a non-Super-Admin, with the terminal message', async () => {
    // `resetMockStaff` puts this back to SUPER_ADMIN before the next test.
    globalThis.__mockStaffActingRole?.set('ADMIN')

    await expect(fetchStaffList(listKey)).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.status === 403 &&
        /* Distinct from the module-gated 403 — this one is not actionable. */
        error.message.includes('Requires SUPER_ADMIN privileges'),
    )
  })
})
