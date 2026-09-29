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
 * `https://api.callschat.com/api/v1` on 2026-09-28.
 */

beforeEach(() => {
  resetMockBootstrap()
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('two independent platform records (§1.1)', () => {
  it('serves a different row per platform', async () => {
    const android = await fetchBootstrapConfig('ANDROID')
    const ios = await fetchBootstrapConfig('IOS')

    expect(android.id).not.toBe(ios.id)
    expect(android.storeUrl).not.toBe(ios.storeUrl)
  })

  it('writes to one platform without touching the other', async () => {
    const before = await fetchBootstrapConfig('IOS')
    await updateBootstrapConfig({ platform: 'ANDROID', latestVersion: '9.9.9' })
    const after = await fetchBootstrapConfig('IOS')

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
    const iosBefore = await fetchBootstrapConfig('IOS')
    await updateBootstrapConfig({ latestVersion: '3.3.3' } as never)

    expect((await fetchBootstrapConfig('ANDROID')).latestVersion).toBe('3.3.3')
    expect((await fetchBootstrapConfig('IOS')).latestVersion).toBe(
      iosBefore.latestVersion,
    )
  })

  it('validates platform on READ, unlike on write', async () => {
    // `?platform=WEB` → 400, while a missing platform on write → 200.
    await expect(fetchBootstrapConfig('WEB' as never)).rejects.toSatisfy(
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
    const before = await fetchBootstrapConfig('ANDROID')
    expect(Object.keys(before.features)).toHaveLength(3)

    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      features: { chat: false },
    })

    expect(after.features).toEqual({ chat: false })
    expect(after.features['calls']).toBeUndefined()
  })

  it('leaves the map untouched when the key is omitted entirely', async () => {
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      minAndroidSdk: 26,
    })

    expect(Object.keys(after.features)).toHaveLength(3)
  })

  it('stores a flag the panel has never heard of', async () => {
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      features: { chat: true, calls: true, signup: true, brandNewFlag: true },
    })

    expect(after.features['brandNewFlag']).toBe(true)
  })
})

describe('`blockedVersions` replaces, and accepts junk (§3.4)', () => {
  it('replaces rather than appending', async () => {
    await updateBootstrapConfig({ platform: 'ANDROID', blockedVersions: ['1.1.0'] })
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
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
      blockedVersions: ['garbage', '1.2'],
    })

    expect(after.blockedVersions).toEqual(['garbage', '1.2'])
  })

  it('rejects a non-array, as the server does', async () => {
    await expect(
      updateBootstrapConfig({ platform: 'ANDROID', blockedVersions: '1.0.0' as never }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('body/blockedVersions'),
    )
  })
})

describe('`configVersion` increments on every write (§3.5)', () => {
  it('moves even when nothing changes', async () => {
    const before = await fetchBootstrapConfig('ANDROID')
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
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
      minAndroidSdk: 25,
    })
    const second = await updateBootstrapConfig({
      platform: 'ANDROID',
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
      storeUrl: 'javascript:alert(document.domain)',
    })

    expect(after.storeUrl).toBe('javascript:alert(document.domain)')
  })

  it('ships one already poisoned, so a read path cannot avoid the case', async () => {
    const seeded = await fetchBootstrapConfig('ANDROID')
    expect(seeded.storeUrl.startsWith('javascript:')).toBe(true)
  })
})

describe('`maintenanceMessage` clears on both null and empty string (§3.7)', () => {
  it('clears on null', async () => {
    await updateBootstrapConfig({ platform: 'ANDROID', maintenanceMessage: 'down' })
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      maintenanceMessage: null,
    })

    expect(after.maintenanceMessage).toBeNull()
  })

  it('clears on an empty string too — not stored as ""', async () => {
    await updateBootstrapConfig({ platform: 'ANDROID', maintenanceMessage: 'down' })
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
      maintenanceMessage: '',
    })

    expect(after.maintenanceMessage).toBeNull()
  })

  it('survives a write that omits it', async () => {
    await updateBootstrapConfig({ platform: 'ANDROID', maintenanceMessage: 'kept' })
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
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
        minSupportedVersion: 'not-a-version',
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('Must be a valid Semantic Version'),
    )
  })

  it('rejects a build number below 1', async () => {
    await expect(
      updateBootstrapConfig({ platform: 'ANDROID', minBuildNumber: -5 }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message.includes('Number must be greater than or equal to 1'),
    )
  })

  it('rejects a malformed email', async () => {
    await expect(
      updateBootstrapConfig({ platform: 'ANDROID', supportEmail: 'nope' }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('Must be a valid email address'),
    )
  })

  it('rejects a non-boolean feature value, naming the flag', async () => {
    await expect(
      updateBootstrapConfig({
        platform: 'ANDROID',
        features: { chat: 'yes' as never },
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message.includes('body/features/chat'),
    )
  })

  it('rejects a bad platform, listing all four spellings it accepts', async () => {
    await expect(updateBootstrapConfig({ platform: 'WEB' as never })).rejects.toSatisfy(
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
    const before = await fetchBootstrapConfig('ANDROID')
    const after = await updateBootstrapConfig({
      platform: 'ANDROID',
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
    expect((await fetchBootstrapConfig('IOS')).updatedBy).toBeNull()
  })

  it('records a BARE id after a write, never an expanded actor', async () => {
    const after = await updateBootstrapConfig({ platform: 'IOS', minAndroidSdk: 24 })

    expect(typeof after.updatedBy).toBe('string')
    expect(after.updatedBy).not.toHaveProperty('email')
  })

  it('carries `minAndroidSdk` on the iOS record, where it means nothing', async () => {
    expect((await fetchBootstrapConfig('IOS')).minAndroidSdk).toBe(24)
  })
})
