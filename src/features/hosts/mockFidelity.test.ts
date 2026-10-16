import { beforeEach, describe, expect, it } from 'vitest'

import { isAppError } from '@/api/errors'
import {
  fetchHostApplication,
  fetchHostApplications,
  fetchHostApplicationStats,
  fetchLiveHosts,
  reviewHostApplication,
  setLiveHostStatus,
} from '@/api/hosts'
import { setSession } from '@/auth/tokenStore'
import {
  mockHostApplications,
  mockLiveHosts,
  resetMockHosts,
  seedMockHosts,
} from '@/mocks/handlers/hosts'

/**
 * Does the mock behave like the live service? — phase H3.
 *
 * One `describe` per behaviour measured on
 * `https://test-api.callschat.com/api/v1` on 2026-10-15, driven through the
 * **real** `api/hosts.ts` rather than by reaching into the handler. Without
 * this file, "the mock reproduces the traps" is a claim in a comment; with it,
 * the claim fails a test when it stops being true.
 *
 * ⚠️ Note which way the defaults run. `resetMockHosts()` leaves the backend
 * **empty**, because that is what production actually is. A test that wants
 * rows asks for them with `seedMockHosts()`.
 */

beforeEach(() => {
  resetMockHosts()
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the live default: a backend with nothing in it (§2.1)', () => {
  it('serves an empty application page', async () => {
    const page = await fetchHostApplications({})

    expect(page.data).toEqual([])
    expect(page.pagination.total).toBe(0)
  })

  it('serves totalPages 1 for an empty table, not 0', async () => {
    /* ⚠️ The service's own arithmetic, verified: `total: 0, totalPages: 1`. */
    const page = await fetchHostApplications({})

    expect(page.pagination.totalPages).toBe(1)
  })

  it('serves an empty host roster', async () => {
    expect((await fetchLiveHosts({})).data).toEqual([])
  })

  it('serves six counters, all zero', async () => {
    const stats = await fetchHostApplicationStats()

    expect(stats).toEqual({
      totalApplications: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      activeHostsCount: 0,
      suspendedHostsCount: 0,
    })
  })
})

describe('status is case-SENSITIVE (§3.1)', () => {
  it('accepts the upper-case spelling', async () => {
    await expect(fetchHostApplications({ status: 'PENDING' })).resolves.toBeDefined()
  })

  it('rejects the lower-case spelling, exactly as the service does', async () => {
    /*
     * ⚠️ The assertion that stops someone "normalising" the filter on its way
     * out. The bootstrap enums accept four spellings each; this one does not,
     * and a mock that folded case would hide a guaranteed production 400.
     */
    await expect(fetchHostApplications({ status: 'pending' })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message.includes('querystring/status') &&
        error.message.includes("'PENDING' | 'APPROVED' | 'REJECTED'"),
    )
  })

  it('rejects the invented SUBMITTED, which no version of this API used', async () => {
    await expect(fetchHostApplications({ status: 'SUBMITTED' })).rejects.toSatisfy(
      (error: unknown) => isAppError(error),
    )
  })

  it('rejects a bad host status with its own three values', async () => {
    await expect(fetchLiveHosts({ status: 'GONE' })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message.includes("'ACTIVE' | 'SUSPENDED' | 'BANNED'"),
    )
  })
})

describe('niche is NOT validated (§3.2)', () => {
  it('accepts a niche the panel has never heard of, with a 200', async () => {
    /*
     * ⚠️ The asymmetry worth reproducing: `status` in the same querystring is
     * enum-checked and this is not. A typo does not fail — it silently returns
     * the wrong set, which is why the panel offers a closed select instead of
     * trusting the server to catch it.
     */
    await expect(fetchHostApplications({ niche: 'GARBAGE' })).resolves.toBeDefined()
  })

  it('returns nothing for it, which is the silent wrong answer', async () => {
    seedMockHosts()

    expect((await fetchHostApplications({ niche: 'GARBAGE' })).data).toEqual([])
    expect((await fetchHostApplications({ niche: 'TECH' })).data).toHaveLength(1)
  })
})

describe('the paging bounds the service enforces', () => {
  it.each([
    ['limit', 101, 'querystring/limit Number must be less than or equal to 100'],
    ['limit', 0, 'querystring/limit Number must be greater than or equal to 1'],
    ['page', 0, 'querystring/page Number must be greater than or equal to 1'],
  ])('rejects %s=%i', async (field, value, message) => {
    await expect(fetchHostApplications({ [field]: value })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.message === message,
    )
  })

  it('accepts limit=100, the documented maximum', async () => {
    await expect(fetchHostApplications({ limit: 100 })).resolves.toBeDefined()
  })
})

describe('the date filters', () => {
  it('accepts YYYY-MM-DD, which is what the doc promises', async () => {
    await expect(
      fetchHostApplications({ startDate: '2026-10-13' }),
    ).resolves.toBeDefined()
  })

  it('rejects a date it cannot parse', async () => {
    await expect(fetchHostApplications({ startDate: '13-10-2026' })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('querystring/startDate'),
    )
  })
})

describe('validation runs BEFORE the lookup (§2.3)', () => {
  /*
   * ⚠️ The behaviour that made the entire write contract mappable against a
   * database with zero rows. A mock that looked the record up first would
   * answer 404 here, and every write assertion below would have needed a
   * fixture that production cannot produce.
   */

  it('answers 400 for a bad action on an id that does not exist', async () => {
    await expect(
      reviewHostApplication('does-not-exist', {
        action: 'MAYBE' as never,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message === "body/action Action must be either 'APPROVE' or 'REJECT'",
    )
  })

  it('answers 404 only once the body is valid', async () => {
    await expect(
      reviewHostApplication('does-not-exist', { action: 'APPROVE' }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('Host application not found'),
    )
  })
})

describe('the review write', () => {
  it('rejects an empty body', async () => {
    await expect(reviewHostApplication('any', undefined as never)).rejects.toSatisfy(
      (error: unknown) => isAppError(error),
    )
  })

  it('requires 5 characters of rejection reason — 4 is not enough', async () => {
    await expect(
      reviewHostApplication('any', { action: 'REJECT', rejectionReason: 'abcd' }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message ===
          'body/rejectionReason A rejection reason of at least 5 characters is required when rejecting an application',
    )
  })

  it('accepts exactly 5 characters', async () => {
    seedMockHosts()
    await expect(
      reviewHostApplication('cmv6j6vfk00007wvb59fdeh07', {
        action: 'REJECT',
        rejectionReason: 'abcde',
      }),
    ).resolves.toBeUndefined()
  })

  it('approving creates the live host profile, as the service does', async () => {
    /*
     * ⚠️ This is what makes approval irreversible from the panel: a
     * `LiveHostProfile` now exists and there is no un-approve endpoint.
     */
    seedMockHosts()
    expect(
      mockLiveHosts().some((host) => host.userId === 'cmu2moelr0000zwvbz66ignv7'),
    ).toBe(false)

    await reviewHostApplication('cmv6j6vfk00007wvb59fdeh07', { action: 'APPROVE' })

    const created = mockLiveHosts().find(
      (host) => host.userId === 'cmu2moelr0000zwvbz66ignv7',
    )
    expect(created?.status).toBe('ACTIVE')
    expect(mockHostApplications()[0]?.status).toBe('APPROVED')
  })
})

describe('the host status write', () => {
  it('rejects a status outside the three', async () => {
    await expect(
      setLiveHostStatus('usr_99', { status: 'GONE' as never, reason: 'whatever' }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message ===
          "body/status Status must be 'ACTIVE', 'SUSPENDED', or 'BANNED'",
    )
  })

  it('requires a reason to SUSPEND', async () => {
    await expect(
      setLiveHostStatus('usr_99', { status: 'SUSPENDED' } as never),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message ===
          'body/reason A reason of at least 5 characters is required when suspending or banning a host',
    )
  })

  it('requires a reason to BAN — which the doc never says (§3.3)', async () => {
    await expect(
      setLiveHostStatus('usr_99', { status: 'BANNED' } as never),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('suspending or banning a host'),
    )
  })

  it('needs no reason to reactivate', async () => {
    seedMockHosts()
    await expect(
      setLiveHostStatus('usr_100', { status: 'ACTIVE' }),
    ).resolves.toBeUndefined()

    expect(mockLiveHosts().find((host) => host.userId === 'usr_100')?.status).toBe(
      'ACTIVE',
    )
  })

  it('is keyed on userId, not the profile id', async () => {
    /*
     * ⚠️ Both appear on every roster row and they differ. Sending `prof_123`
     * answers the "not found for this user" 404, which reads like the host is
     * gone rather than like the caller used the wrong key.
     */
    seedMockHosts()

    await expect(
      setLiveHostStatus('prof_123', { status: 'SUSPENDED', reason: 'Policy breach.' }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('Live host profile not found'),
    )

    await expect(
      setLiveHostStatus('usr_99', { status: 'SUSPENDED', reason: 'Policy breach.' }),
    ).resolves.toBeUndefined()
  })
})

describe('the doubled 404 messages are reproduced, not tidied', () => {
  it('serves the application 404 verbatim', async () => {
    await expect(fetchHostApplication('nope')).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message === 'Host application not found not found',
    )
  })

  it('serves the host 404 verbatim', async () => {
    await expect(setLiveHostStatus('nope', { status: 'ACTIVE' })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message === 'Live host profile not found for this user not found',
    )
  })
})

describe('the stats counters follow the data', () => {
  it('counts a suspended and a banned host together', async () => {
    /*
     * The doc names the card "Suspended / Banned", so one counter covers both
     * states. Asserted because an operator reading `suspendedHostsCount` is
     * being told how many hosts are off the platform, not how many are in one
     * particular state.
     */
    seedMockHosts()
    await setLiveHostStatus('usr_99', { status: 'BANNED', reason: 'Policy breach.' })

    const stats = await fetchHostApplicationStats()
    expect(stats.suspendedHostsCount).toBe(2)
    expect(stats.activeHostsCount).toBe(0)
  })
})

describe('the hostile fixture is reachable and survives the contract', () => {
  it('carries no user profile at all', async () => {
    seedMockHosts()
    const row = await fetchHostApplication('cmv6j6vfk00027wvb59fdeh09')

    expect(row.user?.profile).toBeNull()
  })

  it('carries a javascript: intro URL rather than being rejected', async () => {
    seedMockHosts()
    const row = await fetchHostApplication('cmv6j6vfk00027wvb59fdeh09')

    expect(row.introMediaUrl).toBe('javascript:alert(document.domain)')
  })

  it('carries a niche the panel has never heard of', async () => {
    seedMockHosts()
    const row = await fetchHostApplication('cmv6j6vfk00027wvb59fdeh09')

    expect(row.niche).toBe('ASTROLOGY')
  })

  it('carries a motivation long enough to matter to a layout', async () => {
    seedMockHosts()
    const row = await fetchHostApplication('cmv6j6vfk00027wvb59fdeh09')

    expect((row.motivation ?? '').length).toBeGreaterThan(2000)
  })
})
