import { http, HttpResponse } from 'msw'

import type { BootstrapAppType, BootstrapPlatform } from '@/types/bootstrap'

import { API_PREFIX, applyScenario, errorResponse } from './shared'

/**
 * Bootstrap Configuration — a deliberately **hostile** mock (plan.md §7, B0).
 *
 * It reproduces the live service's defects rather than an idealised contract,
 * because a mock that behaves better than production is a mock that lets a bug
 * ship. Everything below was observed against
 * `https://api.callschat.com/api/v1` on 2026-09-28:
 *
 *   - `PATCH` with **no `platform`** writes to ANDROID and returns 200 (§3.3);
 *   - `platform` is validated on **read** but not on write — the asymmetry is
 *     real and is reproduced;
 *   - the enum accepts `ANDROID | IOS | android | ios`, all four;
 *   - `features` and `blockedVersions` **replace**, every other field merges
 *     (§2.4) — the single most dangerous behaviour here for a form;
 *   - `configVersion` increments on **every** write, including a no-op (§3.5);
 *   - `storeUrl`, `privacyPolicyUrl` and `termsUrl` accept **any** string,
 *     including `javascript:` (§3.2) — seeded that way on ANDROID;
 *   - `blockedVersions` accepts non-SemVer entries that match no client (§3.4);
 *   - `maintenanceMessage` clears on both `null` and `""` (§3.7);
 *   - unknown body keys are silently dropped, with a 200 (§2.3);
 *   - `minAndroidSdk` is present on the **iOS** record, where it means nothing
 *     (§3.9);
 *   - `updatedBy` is a **bare id**, `null` until somebody writes (§3.6);
 *   - the five real validation rejections, with the server's own wording.
 *
 * The public `GET /bootstrap` is **not** mocked. The panel cannot call it —
 * CORS forbids the client headers (§3.8) — and mocking a route the product
 * never requests would invent a capability that does not exist.
 */

const VALIDATION = 'FST_ERR_VALIDATION' as const

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

interface MockConfig {
  id: string
  platform: BootstrapPlatform
  /*
   * ⚠️ **D1 only carries the field; D3 makes it a key.**
   *
   * Live, the record is keyed on the composite pair `(platform, appType)` —
   * four records, not two (plan.md §2.1). This mock still holds two, both
   * `PERSONAL`, which is what the panel read before the dual-app rollout. The
   * field is present so `bootstrapConfigSchema` parses; the routing, the four
   * seeds and the `PATCH {}` behaviour land in D3.
   *
   * Until then this mock is **more forgiving than the service**, and the gap
   * is named here rather than discovered: nothing in it can yet fail a test
   * for targeting the wrong record.
   */
  appType: BootstrapAppType
  configVersion: number
  maintenanceMode: boolean
  maintenanceMessage: string | null
  minSupportedVersion: string
  latestVersion: string
  minBuildNumber: number
  latestBuildNumber: number
  forceUpdate: boolean
  storeUrl: string
  blockedVersions: string[]
  forceLogout: boolean
  forceLogoutBeforeVersion: string | null
  minAndroidSdk: number
  privacyPolicyUrl: string
  termsUrl: string
  supportEmail: string
  features: Record<string, boolean>
  createdAt: string
  updatedAt: string
  updatedBy: string | null
}

const SUPER_ADMIN_ID = 'cmt8orkov00004upco3oifg2v'

/**
 * The four live records, captured 2026-10-08.
 *
 * ⚠️ **Flag sets differ per record, and two PERSONAL records disagree with
 * each other.** `bootstrap-update.md` §4.4 presents a fixed two-tier scheme —
 * Personal gets three flags, Business adds three — and the live data does not
 * follow it: `ANDROID/PERSONAL` carries **13**, `IOS/PERSONAL` carries **3**,
 * both BUSINESS records carry **6** (plan.md §3.1).
 *
 * Seeded faithfully because a tidy three-flag fixture would never exercise the
 * real screen: `FeatureFlagsCard` renders one row per flag, and thirteen rows
 * is what an operator actually sees.
 */
const SEED: Record<BootstrapPlatform, Record<BootstrapAppType, MockConfig>> = {
  ANDROID: {
    PERSONAL: {
      id: 'cmui6rpcx01or01mm1injp0hu',
      platform: 'ANDROID',
      appType: 'PERSONAL',
      /*
       * ⚠️ The only one of the four that is live in production (plan.md §2.1),
       * and the one a forgotten `appType` silently targets. Seeded at a high
       * revision because that is what the real record looks like — the other
       * three have never been edited.
       */
      configVersion: 21,
      maintenanceMode: false,
      maintenanceMessage: null,
      minSupportedVersion: '1.0.0',
      latestVersion: '1.0.0',
      minBuildNumber: 1,
      latestBuildNumber: 1,
      forceUpdate: false,
      /*
       * ⚠️ Accepted, stored, and served from the unauthenticated public
       * endpoint — verified live (§3.2). The panel must render it as text with
       * a warning and NO anchor; a test asserts there is no `a[href]` near it.
       */
      storeUrl: 'javascript:alert(document.domain)',
      /*
       * ⚠️ One real version and one that is not a version at all. The second
       * was accepted and stored live; it matches no client, so an operator
       * believes a bad build is barred when it is not (§3.4).
       */
      blockedVersions: ['1.1.0', 'garbage'],
      forceLogout: false,
      forceLogoutBeforeVersion: null,
      minAndroidSdk: 24,
      privacyPolicyUrl: 'https://callschat.com/privacy',
      termsUrl: 'https://callschat.com/terms',
      supportEmail: 'support@callschat.com',
      /* All thirteen, exactly as live — see the note on SEED. */
      features: {
        chat: true,
        calls: true,
        signup: true,
        groupChat: true,
        groupCalls: true,
        socialClub: true,
        videoCalls: true,
        safetyNumber: true,
        linkedDevices: true,
        voiceMessages: true,
        mediaAttachments: true,
        digitalBusinessCard: true,
        businessVerification: true,
      },
      createdAt: '2026-09-26T09:27:21.633Z',
      updatedAt: '2026-09-28T03:52:10.118Z',
      /* A bare id, never an expanded actor (§3.6). */
      updatedBy: SUPER_ADMIN_ID,
    },
    BUSINESS: {
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
      /* `null` until somebody writes — the state of a never-edited record. */
      updatedBy: null,
    },
  },
  IOS: {
    PERSONAL: {
      id: 'cmukpfoez000401ngwppvo6gz',
      platform: 'IOS',
      appType: 'PERSONAL',
      configVersion: 1,
      maintenanceMode: false,
      maintenanceMessage: null,
      minSupportedVersion: '1.0.0',
      latestVersion: '1.0.0',
      minBuildNumber: 1,
      latestBuildNumber: 1,
      forceUpdate: false,
      storeUrl: 'https://apps.apple.com/app/callschat',
      blockedVersions: [],
      forceLogout: false,
      forceLogoutBeforeVersion: null,
      /* ⚠️ Meaningless on iOS, and present anyway — exactly as live (§3.9). */
      minAndroidSdk: 24,
      privacyPolicyUrl: 'https://callschat.com/privacy',
      termsUrl: 'https://callschat.com/terms',
      supportEmail: 'support@callschat.com',
      /* ⚠️ Three, where ANDROID/PERSONAL has thirteen. Same appType. */
      features: { chat: true, calls: true, signup: true },
      createdAt: '2026-09-24T08:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
      updatedBy: null,
    },
    BUSINESS: {
      id: 'cmuz1nz0m00p701l1uxzp195j',
      platform: 'IOS',
      appType: 'BUSINESS',
      configVersion: 1,
      maintenanceMode: false,
      maintenanceMessage: null,
      minSupportedVersion: '1.0.0',
      latestVersion: '1.0.0',
      minBuildNumber: 1,
      latestBuildNumber: 1,
      forceUpdate: false,
      storeUrl: 'https://apps.apple.com/app/callschat-business',
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
  },
}

let configs: Record<
  BootstrapPlatform,
  Record<BootstrapAppType, MockConfig>
> = structuredClone(SEED)

/**
 * Restore the seed records.
 *
 * `configs` is module state loaded once at import, so a test that mutates a
 * record leaks into the next one unless this is called. Mirrors
 * `resetMockFeedback` and `resetMockStaff`.
 */
export function resetMockBootstrap(): void {
  configs = structuredClone(SEED)
}

/* ------------------------------------------------------------------ *
 * Validation — the server's own messages, verbatim
 * ------------------------------------------------------------------ */

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*))*))?$/

/** All four spellings, as the live enum accepts them. */
const PLATFORM_VALUES = ['ANDROID', 'IOS', 'android', 'ios'] as const

function normalisePlatform(value: unknown): BootstrapPlatform | null {
  if (typeof value !== 'string') return null
  const upper = value.toUpperCase()
  if (upper !== 'ANDROID' && upper !== 'IOS') return null
  return upper
}

/** All four spellings, as the live enum accepts them. */
const APP_TYPE_VALUES = ['PERSONAL', 'BUSINESS', 'personal', 'business'] as const

function normaliseAppType(value: unknown): BootstrapAppType | null {
  if (typeof value !== 'string') return null
  const upper = value.toUpperCase()
  if (upper !== 'PERSONAL' && upper !== 'BUSINESS') return null
  return upper
}

function validationFailure(issues: readonly string[]): Response {
  return errorResponse(400, VALIDATION, issues.join(', '))
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text()
  if (raw.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

export const bootstrapHandlers = [
  /** `GET /admin/bootstrap` — `platform` IS validated here, unlike on write. */
  http.get(`${API_PREFIX}/admin/bootstrap`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const params = new URL(request.url).searchParams
    const rawPlatform = params.get('platform')
    const rawAppType = params.get('appType')

    if (
      rawPlatform !== null &&
      !(PLATFORM_VALUES as readonly string[]).includes(rawPlatform)
    ) {
      return validationFailure([
        `querystring/platform Invalid enum value. Expected 'ANDROID' | 'IOS' | 'android' | 'ios', received '${rawPlatform}'`,
      ])
    }

    if (
      rawAppType !== null &&
      !(APP_TYPE_VALUES as readonly string[]).includes(rawAppType)
    ) {
      return validationFailure([
        `querystring/appType Invalid enum value. Expected 'PERSONAL' | 'BUSINESS' | 'personal' | 'business', received '${rawAppType}'`,
      ])
    }

    /*
     * ⚠️ **The two keys default INDEPENDENTLY**, verified live 2026-10-08
     * (plan.md §2.3): no parameters at all answers 200 with ANDROID/PERSONAL,
     * `?platform=IOS` answers IOS/PERSONAL, `?appType=BUSINESS` answers
     * ANDROID/BUSINESS.
     *
     * Reproduced so that a caller which forgot a parameter is silently wrong
     * here too, rather than failing loudly in a way production would not — the
     * whole point of this mock is that the panel's guards look necessary.
     */
    const platform = normalisePlatform(rawPlatform) ?? 'ANDROID'
    const appType = normaliseAppType(rawAppType) ?? 'PERSONAL'
    return HttpResponse.json({ success: true, data: configs[platform][appType] })
  }),

  /**
   * `PATCH /admin/bootstrap`.
   *
   * ⚠️ `platform` is **not required**, and a body without it writes to ANDROID
   * (§3.3). That is the trap this handler exists to keep reproducible.
   */
  http.patch(`${API_PREFIX}/admin/bootstrap`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    if (!body) {
      return errorResponse(
        400,
        VALIDATION,
        "Body cannot be empty when content-type is set to 'application/json'",
      )
    }

    const issues: string[] = []

    if (
      'platform' in body &&
      !(PLATFORM_VALUES as readonly string[]).includes(String(body['platform']))
    ) {
      issues.push(
        `body/platform Invalid enum value. Expected 'ANDROID' | 'IOS' | 'android' | 'ios', received '${String(body['platform'])}'`,
      )
    }

    if (
      'appType' in body &&
      !(APP_TYPE_VALUES as readonly string[]).includes(String(body['appType']))
    ) {
      issues.push(
        `body/appType Invalid enum value. Expected 'PERSONAL' | 'BUSINESS' | 'personal' | 'business', received '${String(body['appType'])}'`,
      )
    }

    if (body['minAndroidSdk'] !== undefined) {
      const sdk = body['minAndroidSdk']
      if (typeof sdk !== 'number' || !Number.isInteger(sdk)) {
        issues.push(`body/minAndroidSdk Expected number, received ${typeof sdk}`)
      } else if (sdk < 0) {
        issues.push('body/minAndroidSdk Number must be greater than or equal to 0')
      } else if (sdk > 100) {
        issues.push('body/minAndroidSdk Number must be less than or equal to 100')
      }
    }

    if (body['maintenanceMessage'] !== undefined) {
      const message = body['maintenanceMessage']
      if (typeof message === 'string' && message.length > 1000) {
        issues.push(
          'body/maintenanceMessage String must contain at most 1000 character(s)',
        )
      }
    }

    for (const field of ['minSupportedVersion', 'latestVersion'] as const) {
      const value = body[field]
      if (value !== undefined && (typeof value !== 'string' || !SEMVER.test(value))) {
        issues.push(
          `body/${field} Must be a valid Semantic Version (e.g. 1.0.0, 1.2.3-beta.1)`,
        )
      }
    }

    for (const field of ['minBuildNumber', 'latestBuildNumber'] as const) {
      const value = body[field]
      if (value !== undefined && (typeof value !== 'number' || value < 1)) {
        issues.push(`body/${field} Number must be greater than or equal to 1`)
      }
    }

    if (
      body['blockedVersions'] !== undefined &&
      !Array.isArray(body['blockedVersions'])
    ) {
      issues.push(
        `body/blockedVersions Expected array, received ${typeof body['blockedVersions']}`,
      )
    }

    if (
      body['supportEmail'] !== undefined &&
      (typeof body['supportEmail'] !== 'string' ||
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body['supportEmail']))
    ) {
      issues.push('body/supportEmail Must be a valid email address')
    }

    const features = body['features']
    if (features !== undefined) {
      if (
        typeof features !== 'object' ||
        features === null ||
        Array.isArray(features)
      ) {
        issues.push('body/features Expected object, received ' + typeof features)
      } else {
        for (const [key, value] of Object.entries(features)) {
          if (typeof value !== 'boolean') {
            issues.push(
              `body/features/${key} Expected boolean, received ${typeof value}`,
            )
          }
        }
      }
    }

    /*
     * ⚠️ NOT validated, on purpose: `storeUrl`, `privacyPolicyUrl`,
     * `termsUrl` (§3.2) and the CONTENTS of `blockedVersions` (§3.4). The live
     * service accepts `javascript:` and `"garbage"` respectively. Rejecting
     * them here would hide both defects from anyone testing against the mock
     * and make the panel's own guards look unnecessary.
     */

    if (issues.length > 0) return validationFailure(issues)

    /*
     * ⚠️ **`PATCH {}` reaches here and writes.** It is not rejected — the live
     * service answers 200 and records a no-op, burning a `configVersion` and
     * restamping `updatedAt` (plan.md §2.5, verified 2026-10-08 against the
     * real `ANDROID/PERSONAL` record, which moved from 70 to 71).
     *
     * Both keys default independently, so a body missing `appType` lands on
     * PERSONAL — the live app. This is the single most important line of
     * fidelity in this file: a mock that rejected `{}`, or that required
     * `appType`, would make the payload guards in `bootstrapSchemas.ts` look
     * like ceremony and invite someone to delete them.
     */
    const platform = normalisePlatform(body['platform']) ?? 'ANDROID'
    const appType = normaliseAppType(body['appType']) ?? 'PERSONAL'
    const current = configs[platform][appType]

    const scalar = <T>(key: string, fallback: T): T =>
      key in body ? (body[key] as T) : fallback

    configs[platform][appType] = {
      ...current,
      maintenanceMode: scalar('maintenanceMode', current.maintenanceMode),
      /* Both `null` and `""` clear it (§3.7). */
      maintenanceMessage:
        'maintenanceMessage' in body
          ? (body['maintenanceMessage'] as string | null) || null
          : current.maintenanceMessage,
      minSupportedVersion: scalar('minSupportedVersion', current.minSupportedVersion),
      latestVersion: scalar('latestVersion', current.latestVersion),
      minBuildNumber: scalar('minBuildNumber', current.minBuildNumber),
      latestBuildNumber: scalar('latestBuildNumber', current.latestBuildNumber),
      forceUpdate: scalar('forceUpdate', current.forceUpdate),
      storeUrl: scalar('storeUrl', current.storeUrl),
      /* ⚠️ REPLACE, not merge. */
      blockedVersions:
        'blockedVersions' in body
          ? [...(body['blockedVersions'] as string[])]
          : current.blockedVersions,
      forceLogout: scalar('forceLogout', current.forceLogout),
      forceLogoutBeforeVersion: scalar(
        'forceLogoutBeforeVersion',
        current.forceLogoutBeforeVersion,
      ),
      minAndroidSdk: scalar('minAndroidSdk', current.minAndroidSdk),
      privacyPolicyUrl: scalar('privacyPolicyUrl', current.privacyPolicyUrl),
      termsUrl: scalar('termsUrl', current.termsUrl),
      supportEmail: scalar('supportEmail', current.supportEmail),
      /*
       * ⚠️ REPLACE, not merge — the defect most likely to be "fixed" by a
       * well-meaning reader. Sending `{"chat":false}` really does delete
       * `calls` and `signup`, verified live 2026-09-28.
       */
      features:
        'features' in body
          ? { ...(body['features'] as Record<string, boolean>) }
          : current.features,
      /* ⚠️ Increments on EVERY write, including one that changes nothing. */
      configVersion: current.configVersion + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: SUPER_ADMIN_ID,
    }

    /* Unknown keys are silently dropped — never echoed, never an error. */

    return HttpResponse.json({
      success: true,
      message: 'Bootstrap configuration updated successfully',
      data: configs[platform][appType],
    })
  }),
]
