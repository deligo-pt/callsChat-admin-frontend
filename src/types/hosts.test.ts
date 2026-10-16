import { describe, expect, it } from 'vitest'

import { repairNotFoundMessage } from '@/api/hosts'
import {
  hostApplicationListSchema,
  hostApplicationSchema,
  hostApplicationStatsSchema,
  hostApplicationStatusSchema,
  hostNicheSchema,
  liveHostListSchema,
  liveHostStatusSchema,
  MIN_HOST_STATUS_REASON,
  MIN_REJECTION_REASON,
  MAX_LIST_LIMIT,
} from '@/types/hosts'

/**
 * The host contract — phase H1 (plan.md §5).
 *
 * ⚠️ **These tests are unusual, and the reason matters.** Every other contract
 * file in this panel asserts against payloads captured from the wire. Here the
 * live service holds **zero applications and zero hosts** (plan.md §2.1), so no
 * row has ever been seen. The only measured responses are the stats envelope
 * and the rejections.
 *
 * So this file asserts two different kinds of thing, and keeps them apart:
 *
 * 1. **What was measured** — the stats shape, the enum spellings the service
 *    accepts and rejects, the validation floors. These are facts.
 * 2. **That the row schemas are permissive enough to survive a payload nobody
 *    has seen.** These are not claims about the service; they are claims about
 *    the panel's tolerance, and they exist because a strict schema against an
 *    unobserved shape blanks the screen rather than reporting a backend bug.
 */

/* ------------------------------------------------------------------ *
 * Measured
 * ------------------------------------------------------------------ */

describe('the stats envelope — the one shape that has been observed', () => {
  /** `GET /admin/live/host-applications/stats`, verbatim, 2026-10-15. */
  const LIVE_STATS = {
    success: true,
    data: {
      totalApplications: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      activeHostsCount: 0,
      suspendedHostsCount: 0,
    },
  }

  it('parses the live response, all six counters at zero', () => {
    const parsed = hostApplicationStatsSchema.parse(LIVE_STATS).data

    expect(parsed.totalApplications).toBe(0)
    expect(parsed.activeHostsCount).toBe(0)
  })

  it.each(Object.keys(LIVE_STATS.data))(
    'requires %s, because this shape was measured not guessed',
    (field) => {
      /*
       * ⚠️ The deliberate asymmetry with the row schemas below. A missing
       * counter here is a real backend change worth failing on — the response
       * was seen complete. A missing row field is not, because no row has been
       * seen at all.
       *
       * ⚠️ Parameterised over **all six** after mutation testing: dropping one
       * named field only guarded that field, so making any *other* counter
       * optional passed all 24 tests. One assertion is not six.
       */
      const rest = { ...LIVE_STATS.data } as Record<string, number>
      delete rest[field]

      expect(() =>
        hostApplicationStatsSchema.parse({ success: true, data: rest }),
      ).toThrow()
    },
  )
})

describe('status is case-SENSITIVE, unlike the bootstrap enums', () => {
  /*
   * ⚠️ Verified live: `?status=pending` answers
   * `400 querystring/status Invalid enum value. Expected 'PENDING' |
   * 'APPROVED' | 'REJECTED'`.
   *
   * The bootstrap module accepts `ANDROID|IOS|android|ios` on both read and
   * write, and the panel narrows to upper-case by choice. Here the service does
   * the narrowing, so anything that lower-cases a status produces a 400 rather
   * than a tolerated request. This test is what fails if someone "normalises"
   * the filter on its way out.
   */

  it('accepts exactly the three upper-case spellings', () => {
    expect(hostApplicationStatusSchema.options).toEqual([
      'PENDING',
      'APPROVED',
      'REJECTED',
    ])
  })

  it('rejects the lower-case spelling the service also rejects', () => {
    expect(hostApplicationStatusSchema.safeParse('pending').success).toBe(false)
  })

  it('is PENDING, never SUBMITTED', () => {
    /*
     * ⚠️ `SUBMITTED` is what the invented schema in `types/clubs.ts` claimed for
     * six weeks (plan.md §4.1). The service has never used it. This assertion
     * is the tripwire if the old value is ever reintroduced from memory.
     */
    expect(hostApplicationStatusSchema.safeParse('SUBMITTED').success).toBe(false)
  })
})

describe('the host status enum', () => {
  it('is the same three values on read and on write', () => {
    expect(liveHostStatusSchema.options).toEqual(['ACTIVE', 'SUSPENDED', 'BANNED'])
  })

  it('rejects a lower-case spelling, matching the service', () => {
    expect(liveHostStatusSchema.safeParse('active').success).toBe(false)
  })
})

describe('the validation floors the service enforces', () => {
  it('requires 5 characters of rejection reason — 4 is a 400', () => {
    expect(MIN_REJECTION_REASON).toBe(5)
  })

  it('requires 5 characters of reason to suspend OR ban', () => {
    /*
     * ⚠️ The doc attaches a reason to suspension only (§5.2) and shows
     * reactivation without one (§5.3). Measured: `{"status":"BANNED"}` alone is
     * a 400 on the same rule.
     */
    expect(MIN_HOST_STATUS_REASON).toBe(5)
  })

  it('caps the page size at 100', () => {
    expect(MAX_LIST_LIMIT).toBe(100)
  })
})

describe('the doubled 404 message is repaired before it can be read', () => {
  /*
   * Both routes concatenate a label with their own suffix, exactly as
   * `/admin/announcements` does. Reproduced in the mock so the defect stays
   * visible, repaired here so an operator never meets it.
   */

  it('repairs the application 404, where the doubling is adjacent', () => {
    expect(repairNotFoundMessage('Host application not found not found')).toBe(
      'Host application not found.',
    )
  })

  it('repairs the host 404, where the doubling is NOT adjacent', () => {
    /*
     * ⚠️ The case that broke the first implementation. `"Live host profile not
     * found for this user"` already ends in the phrase, so the service's suffix
     * lands several words away from it — and a `/not found not found$/` pattern
     * repairs the application message while leaving this one doubled.
     */
    expect(
      repairNotFoundMessage('Live host profile not found for this user not found'),
    ).toBe('Live host profile not found for this user.')
  })

  it('leaves an ordinary message alone', () => {
    expect(repairNotFoundMessage('Something else entirely')).toBe(
      'Something else entirely',
    )
  })

  it('leaves a single, correct "not found" alone', () => {
    /*
     * The repair must not fire on a message the backend got right — otherwise
     * fixing the defect upstream would start mangling good copy here.
     */
    expect(repairNotFoundMessage('Host application not found')).toBe(
      'Host application not found',
    )
  })
})

/* ------------------------------------------------------------------ *
 * Tolerance — claims about the panel, not about the service
 * ------------------------------------------------------------------ */

describe('a row survives a payload nobody has seen', () => {
  /*
   * ⚠️ **Every assertion here is about tolerance, not about truth.** The live
   * table is empty, so the doc's example is the only shape available and it may
   * be wrong in ways nothing can currently reveal. What these tests guarantee
   * is that being wrong costs a missing field rather than a blank screen.
   */

  it('parses the doc example', () => {
    const DOC_EXAMPLE = {
      id: 'cmv6j6vfk00007wvb59fdeh07',
      userId: 'cmu2moelr0000zwvbz66ignv7',
      niche: 'TECH',
      expectedHostingHoursPerWeek: 12,
      motivation: 'I love hosting live interactive coding sessions.',
      bio: 'Full-stack developer and open source enthusiast.',
      status: 'PENDING',
      introMediaUrl: 'https://cdn.callschat.com/samples/intro.mp4',
      socialLinks: { youtube: 'https://youtube.com/@alice_dev' },
      createdAt: '2026-10-13T10:21:32.960Z',
      user: {
        id: 'cmu2moelr0000zwvbz66ignv7',
        email: 'sk_alice@test.com',
        profile: {
          displayName: 'Alice Johnson',
          username: 'alice_live',
          avatarUrl: 'https://cdn.callschat.com/avatars/alice.png',
        },
      },
    }

    expect(hostApplicationSchema.parse(DOC_EXAMPLE).id).toBe(DOC_EXAMPLE.id)
  })

  it('needs nothing but an id', () => {
    expect(hostApplicationSchema.parse({ id: 'app_1' }).id).toBe('app_1')
  })

  it('tolerates a null profile, which is an ordinary account state', () => {
    /*
     * An applicant who never set a display name is normal on any consumer
     * platform. A required `displayName` would blank the whole queue for one
     * incomplete account.
     */
    const row = hostApplicationSchema.parse({
      id: 'app_1',
      user: { id: 'u1', email: null, profile: null },
    })

    expect(row.user?.profile).toBeNull()
  })

  it('carries a niche the panel has never heard of', () => {
    /*
     * ⚠️ The direct consequence of §3.2: `niche` is not server-validated, so the
     * service will store and return anything. A closed enum here would reject
     * a row the service considers perfectly valid.
     */
    const row = hostApplicationSchema.parse({ id: 'app_1', niche: 'ASTROLOGY' })

    expect(row.niche).toBe('ASTROLOGY')
  })

  it('carries a status the panel has never heard of', () => {
    const row = hostApplicationSchema.parse({ id: 'app_1', status: 'WITHDRAWN' })

    expect(row.status).toBe('WITHDRAWN')
  })

  it('carries a javascript: intro URL rather than rejecting the record', () => {
    /*
     * ⚠️ Every comparable URL field on this backend is unvalidated — the
     * bootstrap `storeUrl` accepted and publicly served `javascript:alert(1)`.
     * Rejecting it here would blank the entire application over one field. It is
     * carried, and defused at render (H5).
     */
    const row = hostApplicationSchema.parse({
      id: 'app_1',
      introMediaUrl: 'javascript:alert(document.domain)',
    })

    expect(row.introMediaUrl).toBe('javascript:alert(document.domain)')
  })

  it('carries an intro URL that is not a URL at all', () => {
    /*
     * ⚠️ Added after mutation testing. Swapping `z.string()` for `z.url()` on
     * `introMediaUrl` passed every test, because `javascript:alert(...)` **is**
     * a syntactically valid URL — the poisoned case above proves the panel does
     * not sanitise at the boundary, but it does not prove the field is
     * unvalidated.
     *
     * A value that `z.url()` genuinely rejects is what separates the two. The
     * service has never been seen to send one, and that is exactly the point:
     * nothing has been seen at all, so the field must not be the thing that
     * blanks an entire application.
     */
    const row = hostApplicationSchema.parse({
      id: 'app_1',
      introMediaUrl: 'uploads/intro-clip',
    })

    expect(row.introMediaUrl).toBe('uploads/intro-clip')
  })

  it('keeps totalLiveHours a float — 48.5 is not 48', () => {
    const page = liveHostListSchema.parse({
      success: true,
      data: [{ id: 'h1', totalLiveHours: 48.5 }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    })

    expect(page.data[0]?.totalLiveHours).toBe(48.5)
  })
})

describe('the empty page, which is the only thing production can return', () => {
  it('parses an empty application list', () => {
    const page = hostApplicationListSchema.parse({
      success: true,
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    })

    expect(page.data).toEqual([])
    /* ⚠️ `totalPages: 1` with `total: 0` — the service's own arithmetic. */
    expect(page.pagination.totalPages).toBe(1)
  })

  it('parses an empty host list', () => {
    const page = liveHostListSchema.parse({
      success: true,
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    })

    expect(page.data).toEqual([])
  })
})

describe('the niche list the panel offers', () => {
  it('is the five documented values', () => {
    expect(hostNicheSchema.options).toEqual([
      'TECH',
      'MUSIC',
      'TALK',
      'BUSINESS',
      'ENTERTAINMENT',
    ])
  })
})

/**
 * The live record, captured verbatim from `GET /admin/live/hosts` on
 * 2026-10-15 after approving a real application. Every other fixture in this
 * repo is doc-derived, so this is the only one that can contradict a guess —
 * and it did: the field is `suspendedReason`, not the `suspensionReason` the
 * schema, the mock and the roster cell all originally invented. The mock
 * agreed with the mistake, so 127 tests passed while the Reason column was
 * wired to read `undefined` for every suspended host.
 *
 * ⚠️ Do not tidy this payload or retype it from the guide. Its value is that
 * nobody here chose its keys.
 */
const CAPTURED_LIVE_HOST = {
  id: 'cmv9eniqs006j01qgov5kxoy8',
  userId: 'cmv80oug40000b9kzd52qpjds',
  status: 'ACTIVE',
  badgeLevel: 1,
  totalLiveHours: 0,
  totalDiamondsEarned: 0,
  followersCount: 0,
  approvedAt: '2026-10-15T00:00:00.000Z',
  suspendedAt: null,
  suspendedById: null,
  suspendedReason: null,
  agencyId: null,
  joinedAgencyAt: null,
  user: {
    id: 'cmv80oug40000b9kzd52qpjds',
    email: 'admin@callschat.com',
    profile: null,
  },
} as const

describe('the captured live host record', () => {
  it('parses, and keeps the reason under the name the service actually sends', () => {
    const parsed = liveHostListSchema.parse({
      success: true,
      data: [CAPTURED_LIVE_HOST],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    })
    const host = parsed.data[0]

    expect(host).toBeDefined()
    expect(host).toHaveProperty('suspendedReason')
    expect(host).not.toHaveProperty('suspensionReason')
  })

  it('carries a reason and its audit trail through when one is set', () => {
    const parsed = liveHostListSchema.parse({
      success: true,
      data: [
        {
          ...CAPTURED_LIVE_HOST,
          status: 'SUSPENDED',
          suspendedAt: '2026-10-15T09:00:00.000Z',
          suspendedById: 'cmv80oug40000b9kzd52qpjds',
          suspendedReason: 'Repeated copyright infringement during audio streaming.',
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    })

    expect(parsed.data[0]?.suspendedReason).toMatch(/copyright/i)
    expect(parsed.data[0]?.suspendedAt).toBe('2026-10-15T09:00:00.000Z')
    expect(parsed.data[0]?.suspendedById).toBe('cmv80oug40000b9kzd52qpjds')
  })
})
