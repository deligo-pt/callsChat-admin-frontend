import { describe, expect, it } from 'vitest'

import {
  bootstrapConfigResponseSchema,
  bootstrapUpdateResponseSchema,
  publicBootstrapSchema,
} from '@/types/bootstrap'

/**
 * The contract, against payloads captured from the live service on
 * **2026-09-28**, and re-captured on **2026-10-08** for the dual-app rollout
 * (plan.md §2).
 *
 * Every fixture below is a real response body, pasted rather than composed —
 * the feedback module learned that lesson the hard way, when a hand-written
 * fixture carried a key the service never sends and the whole suite went green
 * against a payload that could not exist.
 */

/** `GET /admin/bootstrap?platform=ANDROID&appType=PERSONAL`, verbatim. */
const LIVE_ANDROID = {
  success: true,
  data: {
    id: 'cmui6rpcx01or01mm1injp0hu',
    platform: 'ANDROID',
    appType: 'PERSONAL',
    configVersion: 1,
    maintenanceMode: false,
    maintenanceMessage: null,
    minSupportedVersion: '1.0.0',
    latestVersion: '1.0.0',
    minBuildNumber: 1,
    latestBuildNumber: 1,
    forceUpdate: false,
    storeUrl: 'https://play.google.com/store/apps/details?id=com.callschat',
    blockedVersions: [],
    forceLogout: false,
    forceLogoutBeforeVersion: null,
    minAndroidSdk: 24,
    privacyPolicyUrl: 'https://callschat.com/privacy',
    termsUrl: 'https://callschat.com/terms',
    supportEmail: 'support@callschat.com',
    features: { chat: true, calls: true, signup: true },
    createdAt: '2026-09-26T09:27:21.633Z',
    updatedAt: '2026-09-26T09:27:21.633Z',
    /* `null` on a record nobody had edited — the real initial state. */
    updatedBy: null,
  },
}

/** `GET /admin/bootstrap?platform=IOS`, verbatim. */
const LIVE_IOS = {
  success: true,
  data: {
    ...LIVE_ANDROID.data,
    id: 'cmukpfoez000401ngwppvo6gz',
    platform: 'IOS',
    storeUrl: 'https://apps.apple.com/app/callschat',
    createdAt: '2026-09-24T08:00:00.000Z',
    updatedAt: '2026-09-24T08:00:00.000Z',
  },
}

/** `PATCH /admin/bootstrap`, verbatim — note the extra `message`. */
const LIVE_UPDATE = {
  success: true,
  message: 'Bootstrap configuration updated successfully',
  data: {
    ...LIVE_ANDROID.data,
    configVersion: 21,
    updatedBy: 'cmt8orkov00004upco3oifg2v',
  },
}

/**
 * `GET /admin/bootstrap?platform=ANDROID&appType=BUSINESS`, verbatim,
 * captured 2026-10-08.
 *
 * ⚠️ Pasted whole rather than spread from `LIVE_ANDROID`, unlike the two
 * fixtures above. The point of this one is that a Business record differs from
 * a Personal record in ways a spread would paper over — a different `id`, a
 * different `storeUrl`, and a **different set of feature flags**. Deriving it
 * would assert that the panel handles a record the service does not serve.
 */
const LIVE_ANDROID_BUSINESS = {
  success: true,
  data: {
    id: 'cmuz1ny6c00p601l1t0lars9a',
    platform: 'ANDROID',
    appType: 'BUSINESS',
    configVersion: 1,
    maintenanceMode: false,
    maintenanceMessage: null,
    minSupportedVersion: '1.0.0',
    latestVersion: '1.0.0',
    minBuildNumber: 1,
    latestBuildNumber: 1,
    forceUpdate: false,
    storeUrl:
      'https://play.google.com/store/apps/details?id=com.codextechit.callchat.business',
    blockedVersions: [],
    forceLogout: false,
    forceLogoutBeforeVersion: null,
    minAndroidSdk: 24,
    privacyPolicyUrl: 'https://callschat.com/privacy',
    termsUrl: 'https://callschat.com/terms',
    supportEmail: 'support@callschat.com',
    features: {
      chat: true,
      calls: true,
      signup: true,
      support: true,
      workspace: true,
      automation: true,
    },
    createdAt: '2026-10-08T04:36:33.348Z',
    updatedAt: '2026-10-08T04:36:33.348Z',
    updatedBy: null,
  },
}

/** `GET /bootstrap` (public, unauthenticated), verbatim. */
const LIVE_PUBLIC = {
  config_version: 1,
  server_time: '2026-09-28T03:45:35.551Z',
  maintenance_mode: false,
  maintenance_message: null,
  update: {
    status: 'none',
    min_supported_version: '1.0.0',
    latest_version: '1.0.0',
    min_build_number: 1,
    latest_build_number: 1,
    store_url: 'https://play.google.com/store/apps/details?id=com.callschat',
  },
  blocked_versions: [],
  session: { force_logout: false, force_logout_before_version: null },
  min_android_sdk: 24,
  legal: {
    privacy_policy_url: 'https://callschat.com/privacy',
    terms_url: 'https://callschat.com/terms',
    support_email: 'support@callschat.com',
  },
  features: { chat: true, calls: true, signup: true },
}

describe('the admin record', () => {
  it('parses the live Android response', () => {
    const parsed = bootstrapConfigResponseSchema.parse(LIVE_ANDROID)
    expect(parsed.data.platform).toBe('ANDROID')
    expect(parsed.data.configVersion).toBe(1)
  })

  it('parses the live iOS response as a separate record', () => {
    const android = bootstrapConfigResponseSchema.parse(LIVE_ANDROID)
    const ios = bootstrapConfigResponseSchema.parse(LIVE_IOS)

    /*
     * ⚠️ Two rows, not two views of one (plan.md §1.1). Verified by setting
     * `bootstrap.latestVersion = 9.9.9` on Android and watching iOS stay put.
     */
    expect(ios.data.id).not.toBe(android.data.id)
    expect(ios.data.storeUrl).not.toBe(android.data.storeUrl)
  })

  it('parses `updatedBy: null`, the state of a never-edited record', () => {
    expect(bootstrapConfigResponseSchema.parse(LIVE_ANDROID).data.updatedBy).toBeNull()
  })

  it('parses `minAndroidSdk` on the iOS record, where it means nothing', () => {
    // plan.md §3.9 — present live, and rejecting it would blank the iOS tab.
    expect(bootstrapConfigResponseSchema.parse(LIVE_IOS).data.minAndroidSdk).toBe(24)
  })

  it('parses the update response, whose `message` the read response lacks', () => {
    const parsed = bootstrapUpdateResponseSchema.parse(LIVE_UPDATE)
    expect(parsed.message).toContain('updated successfully')
    expect(parsed.data.configVersion).toBe(21)
  })
})

describe('appType — the dual-app key (plan.md §2)', () => {
  it('parses a BUSINESS record, which is a different row and not a view', () => {
    const parsed = bootstrapConfigResponseSchema.parse(LIVE_ANDROID_BUSINESS).data

    expect(parsed.appType).toBe('BUSINESS')
    expect(parsed.platform).toBe('ANDROID')
    /* Same platform, different row — the composite key is doing the work. */
    expect(parsed.id).not.toBe(
      bootstrapConfigResponseSchema.parse(LIVE_ANDROID).data.id,
    )
  })

  it('carries a flag set the Personal record does not have', () => {
    /*
     * ⚠️ The assertion that kills the doc's §4.4 feature matrix.
     *
     * `bootstrap-update.md` presents a fixed two-tier scheme — Personal gets
     * three flags, Business adds three more — and advises the panel to render
     * business-exclusive flags only in the Business view. Live, the sets are
     * per-record and arbitrary: `ANDROID/PERSONAL` carries **13** flags and
     * `IOS/PERSONAL` carries **3**, so two Personal records disagree with each
     * other and the split is not Personal-vs-Business at all (plan.md §3.1).
     *
     * This is why `FeatureFlagsCard` renders whatever keys the record holds
     * and must never be given a hard-coded list.
     */
    const business = bootstrapConfigResponseSchema.parse(LIVE_ANDROID_BUSINESS).data

    expect(Object.keys(business.features)).toEqual(
      expect.arrayContaining(['workspace', 'automation', 'support']),
    )
  })

  it('rejects an appType the panel refuses to originate', () => {
    /*
     * The service accepts all four spellings — `PERSONAL | BUSINESS |
     * personal | business` — and the panel narrows to the upper-case pair, the
     * same call already made for `platform`. One value with two spellings is
     * how a store ends up holding both.
     */
    const lowercased = {
      ...LIVE_ANDROID_BUSINESS,
      data: { ...LIVE_ANDROID_BUSINESS.data, appType: 'business' },
    }

    expect(() => bootstrapConfigResponseSchema.parse(lowercased)).toThrow()
  })

  it('refuses a record with no appType at all', () => {
    /*
     * ⚠️ Not pedantry. Both query keys default **independently** and silently
     * (plan.md §2.3), so a response missing `appType` means the panel cannot
     * tell which of the four records it is holding — and the next save would
     * go to whichever one the server picks. Better to fail the parse.
     */
    const { appType: _dropped, ...rest } = LIVE_ANDROID_BUSINESS.data

    expect(() =>
      bootstrapConfigResponseSchema.parse({ success: true, data: rest }),
    ).toThrow()
  })
})

describe('the hostile values the server accepts', () => {
  it('CARRIES a `javascript:` store URL rather than rejecting the record', () => {
    /*
     * ⚠️ plan.md §3.2, the security finding. `{"storeUrl":"javascript:alert(1)"}`
     * was accepted, stored, and served from the unauthenticated public
     * endpoint.
     *
     * The schema must **not** reject it: this record carries the maintenance
     * switch an operator may be reaching for during an incident, and blanking
     * the screen over one poisoned field would be the worse failure. It is
     * defused at render instead — the same trade `features/feedback` makes for
     * an attachment URL.
     */
    const poisoned = {
      ...LIVE_ANDROID,
      data: { ...LIVE_ANDROID.data, storeUrl: 'javascript:alert(document.domain)' },
    }

    const parsed = bootstrapConfigResponseSchema.parse(poisoned)
    expect(parsed.data.storeUrl).toBe('javascript:alert(document.domain)')
  })

  it('carries a non-SemVer blocked version rather than rejecting the record', () => {
    // plan.md §3.4 — `["garbage","1.2"]` was stored live.
    const parsed = bootstrapConfigResponseSchema.parse({
      ...LIVE_ANDROID,
      data: { ...LIVE_ANDROID.data, blockedVersions: ['1.1.0', 'garbage'] },
    })

    expect(parsed.data.blockedVersions).toEqual(['1.1.0', 'garbage'])
  })

  it('carries a feature flag the panel has never heard of', () => {
    // The API accepted `brandNewFlag` and stored it. `features` is an open map.
    const parsed = bootstrapConfigResponseSchema.parse({
      ...LIVE_ANDROID,
      data: {
        ...LIVE_ANDROID.data,
        features: { chat: true, calls: true, signup: true, brandNewFlag: true },
      },
    })

    expect(parsed.data.features['brandNewFlag']).toBe(true)
  })

  it('rejects a non-boolean feature value, because the server does too', () => {
    // `{"chat":"yes"}` → 400 body/features/chat Expected boolean, received string
    expect(() =>
      bootstrapConfigResponseSchema.parse({
        ...LIVE_ANDROID,
        data: { ...LIVE_ANDROID.data, features: { chat: 'yes' } },
      }),
    ).toThrow()
  })

  it('rejects a platform spelling the panel refuses to originate', () => {
    /*
     * The API's enum accepts `android` lower-case, and the panel narrows to
     * the upper-case pair deliberately (plan.md §2.2): two spellings of one
     * value is how a store ends up holding both.
     */
    expect(() =>
      bootstrapConfigResponseSchema.parse({
        ...LIVE_ANDROID,
        data: { ...LIVE_ANDROID.data, platform: 'android' },
      }),
    ).toThrow()
  })
})

describe('the public payload', () => {
  it('parses, even though the panel never requests it', () => {
    /*
     * Kept as the contract `evaluate.ts` reproduces. The panel cannot call
     * this route — CORS forbids the `app-version` header (plan.md §3.8) — so
     * this fixture is the only thing tying the local calculation to the
     * server's shape.
     */
    const parsed = publicBootstrapSchema.parse(LIVE_PUBLIC)
    expect(parsed.update.status).toBe('none')
    expect(parsed.session.force_logout).toBe(false)
  })

  it('is snake_case, unlike every other payload in this panel', () => {
    expect(LIVE_PUBLIC).toHaveProperty('config_version')
    expect(LIVE_PUBLIC).not.toHaveProperty('configVersion')
  })
})
