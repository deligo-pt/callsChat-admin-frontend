import { describe, expect, it } from 'vitest'

import type { BootstrapRecordKey } from '@/types/bootstrap'

import {
  buildBlockedVersionsPayload,
  buildFeaturesPayload,
  buildLegalPayload,
  buildMaintenanceMessagePayload,
  buildReleasePolicyPayload,
} from './bootstrapSchemas'

/**
 * Every payload names the record it is for — phase D2 (plan.md §5).
 *
 * ⚠️ **The file this whole plan exists for.** `PATCH {}` returns **200 and
 * writes** (plan.md §2.5, verified live 2026-10-08 — it moved
 * `ANDROID/PERSONAL` from version 70 to 71). `platform` and `appType` default
 * **independently** and silently, so a payload that drops one edits a record
 * nobody asked for, the server answers success, and the operator watches their
 * change appear to do nothing.
 *
 * Dropping `appType` is the worse half. It targets `PERSONAL`, and
 * `ANDROID/PERSONAL` is the only one of the four records that is live in
 * production — so forgetting `platform` edits the wrong platform, while
 * forgetting `appType` edits the real users' app.
 *
 * Three rules shape what is written here, each learned from a test that could
 * not fail:
 *
 * 1. **One test per builder, never one test for all five.** The failure being
 *    guarded is a *single* forgotten site. A loop over all five passes while
 *    four are right and one is wrong only if the loop happens to be ordered
 *    luckily — and reports "payload key" as the failure either way, naming no
 *    site. Each builder gets its own assertion so a red test names the file to
 *    open.
 *
 * 2. **Asserted against `BUSINESS`, never `PERSONAL`.** `BootstrapTab` pins
 *    `PERSONAL` until D4, so a test expecting `PERSONAL` passes against a
 *    builder that ignores its argument and hard-codes the string — which is
 *    precisely the defect. `BUSINESS` is a value no builder could produce by
 *    accident.
 *
 * 3. **The key is asserted whole, not field by field.** `toMatchObject` on
 *    both keys at once is what fails when either half goes missing.
 *
 * ⚠️ These cover the five **builders**. The three inline write sites —
 * `DangerousSwitch` (on and off) and `SessionCard` — are asserted in
 * `dangerous.test.tsx` against the exact request body. Those run through the
 * screen, so they are pinned to `PERSONAL` and cannot yet catch a hard-coded
 * value the way rule 2 does here. **D4 closes that**, once the switcher can put
 * the screen into Business.
 */

/** A key no builder could produce by accident — see rule 2. */
const BUSINESS: BootstrapRecordKey = { platform: 'IOS', appType: 'BUSINESS' }

/**
 * The full record a caller actually passes.
 *
 * ⚠️ Callers hand over the whole `BootstrapConfig`, which satisfies
 * `BootstrapRecordKey` structurally but carries 21 other fields. Spreading it
 * directly put the entire record into every payload during D1 — saving the
 * legal card would also have written `maintenanceMode` and `forceUpdate`, and
 * the server would have answered 200 because it drops unrecognised keys rather
 * than rejecting them (plan.md §2.3). `recordKey()` narrows it, and the
 * `extraneous` assertions below are what keep it narrow.
 */
const CONFIG_SHAPED_KEY = {
  ...BUSINESS,
  id: 'cfg_business',
  configVersion: 44,
  maintenanceMode: true,
  forceUpdate: true,
  createdAt: '2026-10-08T04:36:33.348Z',
} as unknown as BootstrapRecordKey

const RELEASE_VALUES = {
  latestVersion: '1.3.0',
  latestBuildNumber: 18,
  minSupportedVersion: '1.1.0',
  minBuildNumber: 12,
  storeUrl: 'https://apps.apple.com/app/callschat-business',
}

describe('every builder names the record it writes to', () => {
  it('buildReleasePolicyPayload', () => {
    const payload = buildReleasePolicyPayload(BUSINESS, RELEASE_VALUES)

    expect(payload).toMatchObject(BUSINESS)
  })

  it('buildLegalPayload', () => {
    const payload = buildLegalPayload(BUSINESS, {
      privacyPolicyUrl: 'https://callschat.com/privacy',
      termsUrl: 'https://callschat.com/terms',
      supportEmail: 'support@callschat.com',
    })

    expect(payload).toMatchObject(BUSINESS)
  })

  it('buildMaintenanceMessagePayload', () => {
    const payload = buildMaintenanceMessagePayload(BUSINESS, {
      maintenanceMessage: 'Back at 10:00 UTC.',
    })

    expect(payload).toMatchObject(BUSINESS)
  })

  it('buildFeaturesPayload', () => {
    const payload = buildFeaturesPayload(BUSINESS, { chat: true, workspace: true })

    expect(payload).toMatchObject(BUSINESS)
  })

  it('buildBlockedVersionsPayload', () => {
    const payload = buildBlockedVersionsPayload(BUSINESS, ['1.0.0'])

    expect(payload).toMatchObject(BUSINESS)
  })
})

describe('no builder carries the rest of the record with it', () => {
  /*
   * ⚠️ The D1 regression, pinned. Each of these passes the *whole config* and
   * asserts the payload stayed narrow — a builder that spreads its argument
   * sends `configVersion`, `maintenanceMode` and `forceUpdate` on every save,
   * and the server reports success.
   *
   * `maintenanceMode` and `forceUpdate` are named explicitly rather than
   * checking the key count: those two can stop the product, and a payload that
   * carries them from a stale form is the worst outcome available here.
   */
  const extraneous = [
    'id',
    'configVersion',
    'createdAt',
    'maintenanceMode',
    'forceUpdate',
  ]

  it('buildReleasePolicyPayload', () => {
    const payload = buildReleasePolicyPayload(CONFIG_SHAPED_KEY, RELEASE_VALUES)

    for (const key of extraneous) expect(payload).not.toHaveProperty(key)
    expect(payload).toMatchObject(BUSINESS)
  })

  it('buildLegalPayload', () => {
    const payload = buildLegalPayload(CONFIG_SHAPED_KEY, {
      privacyPolicyUrl: 'https://callschat.com/privacy',
      termsUrl: 'https://callschat.com/terms',
      supportEmail: 'support@callschat.com',
    })

    for (const key of extraneous) expect(payload).not.toHaveProperty(key)
  })

  it('buildMaintenanceMessagePayload', () => {
    const payload = buildMaintenanceMessagePayload(CONFIG_SHAPED_KEY, {
      maintenanceMessage: '',
    })

    for (const key of extraneous) expect(payload).not.toHaveProperty(key)
  })

  it('buildFeaturesPayload', () => {
    const payload = buildFeaturesPayload(CONFIG_SHAPED_KEY, { chat: true })

    for (const key of extraneous) expect(payload).not.toHaveProperty(key)
  })

  it('buildBlockedVersionsPayload', () => {
    const payload = buildBlockedVersionsPayload(CONFIG_SHAPED_KEY, [])

    for (const key of extraneous) expect(payload).not.toHaveProperty(key)
  })
})

describe('the key is read from the argument, not assumed', () => {
  it('writes to Personal when Personal is what was asked for', () => {
    /*
     * The mirror of the `BUSINESS` assertions above. Together they prove the
     * builders *read* the key: one alone is satisfied by a hard-coded constant,
     * and it would be the constant that happens to be right today.
     */
    const payload = buildFeaturesPayload(
      { platform: 'ANDROID', appType: 'PERSONAL' },
      { chat: true },
    )

    expect(payload).toMatchObject({ platform: 'ANDROID', appType: 'PERSONAL' })
  })

  it('keeps platform and appType independent', () => {
    /*
     * ⚠️ All four combinations are real records (plan.md §2.1), and the two
     * keys default independently on the wire. A builder that derived one from
     * the other — or reused a single "which record" enum — would be correct for
     * two of the four and silently wrong for the rest.
     */
    expect(
      buildBlockedVersionsPayload({ platform: 'IOS', appType: 'PERSONAL' }, []),
    ).toMatchObject({ platform: 'IOS', appType: 'PERSONAL' })

    expect(
      buildBlockedVersionsPayload({ platform: 'ANDROID', appType: 'BUSINESS' }, []),
    ).toMatchObject({ platform: 'ANDROID', appType: 'BUSINESS' })
  })
})
