import { beforeEach, describe, expect, it } from 'vitest'

import { fetchBootstrapConfig, updateBootstrapConfig } from '@/api/bootstrap'
import { isAppError } from '@/api/errors'
import { setSession } from '@/auth/tokenStore'
import { resetMockBootstrap } from '@/mocks/handlers/bootstrap'

/**
 * Does the mock actually behave like the live service?
 *
 * One `describe` per trap in plan.md §3, driven through the **real**
 * `api/bootstrap.ts` rather than by reaching into the handler. Without this
 * file, "the mock reproduces the traps" is a claim in a comment; with it, the
 * claim fails a test when it stops being true.
 *
 * Every expectation here was observed against
 * `https://api.callschat.com/api/v1` on 2026-09-28, and the dual-app
 * behaviours on **2026-10-08** (plan.md §2).
 */

beforeEach(() => {
  resetMockBootstrap()
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('four records on a composite key (§2.1, D3)', () => {
  it('serves a different row for each (platform, appType) pair', async () => {
    const ids = new Set<string>()
    for (const platform of ['ANDROID', 'IOS'] as const) {
      for (const appType of ['PERSONAL', 'BUSINESS'] as const) {
        const record = await fetchBootstrapConfig(platform, appType)
        expect(record.platform).toBe(platform)
        expect(record.appType).toBe(appType)
        ids.add(record.id)
      }
    }

    /* Four distinct rows, not one row echoing the query back. */
    expect(ids.size).toBe(4)
  })

  it('writes to one record without touching the other three', async () => {
    /*
     * ⚠️ The dual-app version of the Android/iOS isolation check. A mock that
     * keyed on `platform` alone would pass the old test and fail this one —
     * which is the point, because the panel's cache key had the same bug
     * available to it (plan.md §2.1).
     */
    const others = [
      ['ANDROID', 'PERSONAL'],
      ['IOS', 'PERSONAL'],
      ['IOS', 'BUSINESS'],
    ] as const
    const before = await Promise.all(others.map(([p, a]) => fetchBootstrapConfig(p, a)))

    await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'BUSINESS',
      latestVersion: '9.9.9',
    })

    const after = await Promise.all(others.map(([p, a]) => fetchBootstrapConfig(p, a)))
    for (const [index, record] of after.entries()) {
      expect(record.latestVersion).toBe(before[index]!.latestVersion)
      expect(record.configVersion).toBe(before[index]!.configVersion)
    }
  })

  it('carries a different flag set per record, which the doc denies', async () => {
    /*
     * ⚠️ `bootstrap-update.md` §4.4 says Personal is `{chat, calls, signup}`
     * and Business adds three more. Live, `ANDROID/PERSONAL` has **13** and
     * `IOS/PERSONAL` has **3** — two records of the SAME appType that
     * disagree, so the split is not Personal-vs-Business at all (plan.md §3.1).
     *
     * This is the assertion that must fail if anyone ever "tidies" the seeds
     * into the doc's scheme, or hard-codes a flag list into
     * `FeatureFlagsCard`.
     */
    const androidPersonal = await fetchBootstrapConfig('ANDROID', 'PERSONAL')
    const iosPersonal = await fetchBootstrapConfig('IOS', 'PERSONAL')
    const business = await fetchBootstrapConfig('ANDROID', 'BUSINESS')

    expect(Object.keys(androidPersonal.features)).toHaveLength(13)
    expect(Object.keys(iosPersonal.features)).toHaveLength(3)
    expect(Object.keys(business.features)).toEqual(
      expect.arrayContaining(['workspace', 'automation', 'support']),
    )
  })
})

describe('both keys default INDEPENDENTLY (§2.3)', () => {
  /*
   * ⚠️ Verified live 2026-10-08. The panel never relies on these defaults —
   * `UpdateBootstrapPayload` requires both fields — but the mock reproduces
   * them so the guards in `bootstrapSchemas.ts` look necessary rather than
   * ceremonial. A mock that demanded both would let someone delete them.
   */

  it('serves ANDROID/PERSONAL when neither key is given', async () => {
    const response = await fetch('/api/v1/admin/bootstrap', {
      headers: { Authorization: 'Bearer test-token' },
    })
    const body = (await response.json()) as {
      data: { platform: string; appType: string }
    }

    expect(response.status).toBe(200)
    expect(body.data.platform).toBe('ANDROID')
    expect(body.data.appType).toBe('PERSONAL')
  })

  it('defaults appType to PERSONAL when only platform is given', async () => {
    const response = await fetch('/api/v1/admin/bootstrap?platform=IOS', {
      headers: { Authorization: 'Bearer test-token' },
    })
    const body = (await response.json()) as {
      data: { platform: string; appType: string }
    }

    expect(body.data.platform).toBe('IOS')
    expect(body.data.appType).toBe('PERSONAL')
  })

  it('defaults platform to ANDROID when only appType is given', async () => {
    const response = await fetch('/api/v1/admin/bootstrap?appType=BUSINESS', {
      headers: { Authorization: 'Bearer test-token' },
    })
    const body = (await response.json()) as {
      data: { platform: string; appType: string }
    }

    expect(body.data.platform).toBe('ANDROID')
    expect(body.data.appType).toBe('BUSINESS')
  })

  it('accepts lowercase spellings on read', async () => {
    const response = await fetch(
      '/api/v1/admin/bootstrap?platform=ios&appType=business',
      { headers: { Authorization: 'Bearer test-token' } },
    )
    const body = (await response.json()) as {
      data: { platform: string; appType: string }
    }

    expect(body.data.platform).toBe('IOS')
    expect(body.data.appType).toBe('BUSINESS')
  })

  it('rejects an appType outside the enum, listing all four spellings', async () => {
    await expect(
      fetchBootstrapConfig('ANDROID', 'ENTERPRISE' as never),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message.includes('querystring/appType') &&
        error.message.includes("'PERSONAL' | 'BUSINESS' | 'personal' | 'business'"),
    )
  })
})

describe('PATCH {} is a successful WRITE, not a rejection (§2.5)', () => {
  /*
   * ⚠️ **The single most important fidelity requirement in the mock**, and the
   * behaviour the whole dual-app guard exists for.
   *
   * Verified live 2026-10-08: an empty object answered 200 and moved the real
   * `ANDROID/PERSONAL` record from configVersion 70 to 71, restamping
   * `updatedAt`. It is not a no-op the server ignores — it is a no-op the
   * server RECORDS.
   *
   * A mock that returned 400 here would make `UpdateBootstrapPayload`'s
   * required keys look like over-engineering.
   */

  it('answers 200 and increments configVersion', async () => {
    const before = await fetchBootstrapConfig('ANDROID', 'PERSONAL')

    const response = await fetch('/api/v1/admin/bootstrap', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: '{}',
    })

    expect(response.status).toBe(200)

    const after = await fetchBootstrapConfig('ANDROID', 'PERSONAL')
    expect(after.configVersion).toBe(before.configVersion + 1)
  })

  it('lands on PERSONAL — the live record — when appType is omitted', async () => {
    /*
     * The consequence that makes §2.5 dangerous rather than merely untidy.
     * A payload that names only `platform` edits the Personal app.
     */
    const businessBefore = await fetchBootstrapConfig('ANDROID', 'BUSINESS')
    const personalBefore = await fetchBootstrapConfig('ANDROID', 'PERSONAL')

    await fetch('/api/v1/admin/bootstrap', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ platform: 'ANDROID', latestVersion: '7.7.7' }),
    })

    expect((await fetchBootstrapConfig('ANDROID', 'PERSONAL')).latestVersion).toBe(
      '7.7.7',
    )
    expect((await fetchBootstrapConfig('ANDROID', 'PERSONAL')).configVersion).toBe(
      personalBefore.configVersion + 1,
    )
    /* Business untouched — it was never named. */
    expect((await fetchBootstrapConfig('ANDROID', 'BUSINESS')).latestVersion).toBe(
      businessBefore.latestVersion,
    )
  })

  it('rejects a body that is absent entirely, unlike an empty object', async () => {
    /*
     * The asymmetry, verbatim from the service: no body at all is a 400, `{}`
     * is a 200. Both are reproduced because the difference is the whole trap.
     */
    const response = await fetch('/api/v1/admin/bootstrap', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
    })

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { message: string } }
    expect(body.error.message).toBe(
      "Body cannot be empty when content-type is set to 'application/json'",
    )
  })
})

describe('two independent platform records (§1.1)', () => {
  it('serves a different row per platform', async () => {
    const android = await fetchBootstrapConfig('ANDROID', 'PERSONAL')
    const ios = await fetchBootstrapConfig('IOS', 'PERSONAL')

    expect(android.id).not.toBe(ios.id)
    expect(android.storeUrl).not.toBe(ios.storeUrl)
  })

  it('writes to one platform without touching the other', async () => {
    const before = await fetchBootstrapConfig('IOS', 'PERSONAL')
    await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      latestVersion: '9.9.9',
    })
    const after = await fetchBootstrapConfig('IOS', 'PERSONAL')

    expect(after.latestVersion).toBe(before.latestVersion)
    expect(after.configVersion).toBe(before.configVersion)
  })
})

describe('`platform` is optional on write and defaults to Android (§3.3)', () => {
  it('accepts a body with no platform, and writes to ANDROID', async () => {
    /*
     * ⚠️ The API returns 200 for `PATCH {}`. The payload TYPE forbids this, so
     * the cast is the only way to reach the path — and that is the point: a
     * regression has to go out of its way to get here.
     */
    const iosBefore = await fetchBootstrapConfig('IOS', 'PERSONAL')
    await updateBootstrapConfig({ latestVersion: '3.3.3' } as never)

    expect((await fetchBootstrapConfig('ANDROID', 'PERSONAL')).latestVersion).toBe(
      '3.3.3',
    )
    expect((await fetchBootstrapConfig('IOS', 'PERSONAL')).latestVersion).toBe(
      iosBefore.latestVersion,
    )
  })

  it('validates platform on READ, unlike on write', async () => {
    // `?platform=WEB` → 400, while a missing platform on write → 200.
    await expect(fetchBootstrapConfig('WEB' as never, 'PERSONAL')).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('querystring/platform'),
    )
  })
})

describe('`features` REPLACES, it does not merge (§2.4)', () => {
  it('deletes every flag the payload omits', async () => {
    /*
     * ⚠️ The most dangerous behaviour on this endpoint for a form to get
     * wrong. Verified live: sending `{"chat":false}` left `features` as
     * exactly `{chat: false}` — `calls` and `signup` were gone.
     */
    const before = await fetchBootstrapConfig('ANDROID', 'PERSONAL')
    /*
     * ⚠️ Thirteen, not three. `ANDROID/PERSONAL` is the live Personal record
     * and carries thirteen flags, while `IOS/PERSONAL` carries three — two
     * records of the same appType that disagree (plan.md §3.1). Asserted here
     * so that the replace below is measured against the real blast radius:
     * one partial send deletes twelve flags, not two.
     */
    expect(Object.keys(before.features)).toHaveLength(13)

    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      features: { chat: false },
    })

    expect(after.features).toEqual({ chat: false })
    expect(after.features['calls']).toBeUndefined()
  })

  it('leaves the map untouched when the key is omitted entirely', async () => {
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      minAndroidSdk: 26,
    })

    expect(Object.keys(after.features)).toHaveLength(13)
  })

  it('stores a flag the panel has never heard of', async () => {
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      features: { chat: true, calls: true, signup: true, brandNewFlag: true },
    })

    expect(after.features['brandNewFlag']).toBe(true)
    /* And the replace took: the other ten live flags are gone. */
    expect(Object.keys(after.features)).toHaveLength(4)
  })
})

describe('`blockedVersions` replaces, and accepts junk (§3.4)', () => {
  it('replaces rather than appending', async () => {
    await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      blockedVersions: ['1.1.0'],
    })
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      blockedVersions: ['1.2.0'],
    })

    expect(after.blockedVersions).toEqual(['1.2.0'])
  })

  it('stores an entry that is not a version at all', async () => {
    /*
     * The server accepted `["garbage","1.2"]` while rejecting the same input
     * for `minSupportedVersion`. Such an entry blocks nobody — the panel's tag
     * input is the only thing standing between an operator and that illusion.
     */
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      blockedVersions: ['garbage', '1.2'],
    })

    expect(after.blockedVersions).toEqual(['garbage', '1.2'])
  })

  it('rejects a non-array, as the server does', async () => {
    await expect(
      updateBootstrapConfig({
        platform: 'ANDROID',
        appType: 'PERSONAL',
        blockedVersions: '1.0.0' as never,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('body/blockedVersions'),
    )
  })
})

describe('`configVersion` increments on every write (§3.5)', () => {
  it('moves even when nothing changes', async () => {
    const before = await fetchBootstrapConfig('ANDROID', 'PERSONAL')
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      minAndroidSdk: before.minAndroidSdk,
    })

    expect(after.configVersion).toBe(before.configVersion + 1)
  })

  it('has no way to express "only if it is still version N"', async () => {
    /*
     * Two writers, last one wins, silently. There is no `If-Match` and the API
     * does not accept `configVersion` back — the panel can only notice
     * afterwards, which is why it is rendered on screen.
     */
    const first = await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      minAndroidSdk: 25,
    })
    const second = await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      minAndroidSdk: 26,
    })

    expect(second.configVersion).toBe(first.configVersion + 1)
    expect(second.minAndroidSdk).toBe(26)
  })
})

describe('the three URL fields accept anything (§3.2)', () => {
  it('stores a `javascript:` store URL without complaint', async () => {
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      storeUrl: 'javascript:alert(document.domain)',
    })

    expect(after.storeUrl).toBe('javascript:alert(document.domain)')
  })

  it('ships one already poisoned, so a read path cannot avoid the case', async () => {
    const seeded = await fetchBootstrapConfig('ANDROID', 'PERSONAL')
    expect(seeded.storeUrl.startsWith('javascript:')).toBe(true)
  })
})

describe('`maintenanceMessage` clears on both null and empty string (§3.7)', () => {
  it('clears on null', async () => {
    await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      maintenanceMessage: 'down',
    })
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      maintenanceMessage: null,
    })

    expect(after.maintenanceMessage).toBeNull()
  })

  it('clears on an empty string too — not stored as ""', async () => {
    await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      maintenanceMessage: 'down',
    })
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      maintenanceMessage: '',
    })

    expect(after.maintenanceMessage).toBeNull()
  })

  it('survives a write that omits it', async () => {
    await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      maintenanceMessage: 'kept',
    })
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      minAndroidSdk: 27,
    })

    expect(after.maintenanceMessage).toBe('kept')
  })
})

describe('validation, in the server’s own words (§2.3)', () => {
  it('rejects a non-SemVer version', async () => {
    await expect(
      updateBootstrapConfig({
        platform: 'ANDROID',
        appType: 'PERSONAL',
        minSupportedVersion: 'not-a-version',
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('Must be a valid Semantic Version'),
    )
  })

  it('rejects a build number below 1', async () => {
    await expect(
      updateBootstrapConfig({
        platform: 'ANDROID',
        appType: 'PERSONAL',
        minBuildNumber: -5,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message.includes('Number must be greater than or equal to 1'),
    )
  })

  it('rejects a malformed email', async () => {
    await expect(
      updateBootstrapConfig({
        platform: 'ANDROID',
        appType: 'PERSONAL',
        supportEmail: 'nope',
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('Must be a valid email address'),
    )
  })

  it('rejects a non-boolean feature value, naming the flag', async () => {
    await expect(
      updateBootstrapConfig({
        platform: 'ANDROID',
        appType: 'PERSONAL',
        features: { chat: 'yes' as never },
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('body/features/chat'),
    )
  })

  it('rejects a bad platform, listing all four spellings it accepts', async () => {
    await expect(
      updateBootstrapConfig({ platform: 'WEB' as never, appType: 'PERSONAL' }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message.includes("'ANDROID' | 'IOS' | 'android' | 'ios'"),
    )
  })
})

describe('unknown keys are silently dropped (§2.3)', () => {
  it('returns 200 and changes nothing', async () => {
    /*
     * A typo'd field name reports success. Nothing in the response says the
     * value went nowhere, which is why the payload type is the only guard.
     */
    const before = await fetchBootstrapConfig('ANDROID', 'PERSONAL')
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      totallyUnknownKey: 123,
    } as never)

    expect(after).not.toHaveProperty('totallyUnknownKey')
    expect(after.latestVersion).toBe(before.latestVersion)
    /* It still counted as a write. */
    expect(after.configVersion).toBe(before.configVersion + 1)
  })
})

describe('provenance (§3.6, §3.9)', () => {
  it('starts with `updatedBy: null` on a record nobody has edited', async () => {
    expect((await fetchBootstrapConfig('IOS', 'PERSONAL')).updatedBy).toBeNull()
  })

  it('records a BARE id after a write, never an expanded actor', async () => {
    const after = await updateBootstrapConfig({
      platform: 'IOS',
      appType: 'PERSONAL',
      minAndroidSdk: 24,
    })

    expect(typeof after.updatedBy).toBe('string')
    expect(after.updatedBy).not.toHaveProperty('email')
  })

  it('carries `minAndroidSdk` on the iOS record, where it means nothing', async () => {
    expect((await fetchBootstrapConfig('IOS', 'PERSONAL')).minAndroidSdk).toBe(24)
  })
})
