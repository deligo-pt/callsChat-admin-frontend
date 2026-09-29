import { http, HttpResponse } from 'msw'

import type { BootstrapPlatform } from '@/types/bootstrap'

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

const SEED: Record<BootstrapPlatform, MockConfig> = {
  ANDROID: {
    id: 'cmui6rpcx01or01mm1injp0hu',
    platform: 'ANDROID',
    configVersion: 21,
    maintenanceMode: false,
    maintenanceMessage: null,
    minSupportedVersion: '1.0.0',
    latestVersion: '1.2.0',
    minBuildNumber: 1,
    latestBuildNumber: 12,
    forceUpdate: false,
    /*
     * ⚠️ Seeded POISONED. The live API accepted exactly this value, stored it,
     * and served it from the unauthenticated public endpoint (§3.2). The panel
     * must render it as text with a warning and NO anchor — a test asserts
     * there is no `a[href]` anywhere near it.
     */
    storeUrl: 'javascript:alert(document.domain)',
    /*
     * ⚠️ One real version and one that is not a version at all. The second was
     * accepted and stored live; it matches no client, so an operator believes
     * a bad build is barred when it is not (§3.4).
     */
    blockedVersions: ['1.1.0', 'garbage'],
    forceLogout: false,
    forceLogoutBeforeVersion: null,
    minAndroidSdk: 24,
    privacyPolicyUrl: 'https://callschat.com/privacy',
    termsUrl: 'https://callschat.com/terms',
    supportEmail: 'support@callschat.com',
    features: { chat: true, calls: true, signup: true },
    createdAt: '2026-09-26T09:27:21.633Z',
    updatedAt: '2026-09-28T03:52:10.118Z',
    /* A bare id, never an expanded actor (§3.6). */
    updatedBy: SUPER_ADMIN_ID,
  },
  IOS: {
    id: 'cmukpfoez000401ngwppvo6gz',
    platform: 'IOS',
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
    features: { chat: true, calls: true, signup: true },
    createdAt: '2026-09-24T08:00:00.000Z',
    updatedAt: '2026-09-24T08:00:00.000Z',
    /* `null` until somebody writes — the state of a never-edited record. */
    updatedBy: null,
  },
}

let configs: Record<BootstrapPlatform, MockConfig> = structuredClone(SEED)

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

    const raw = new URL(request.url).searchParams.get('platform')

    if (raw !== null && !(PLATFORM_VALUES as readonly string[]).includes(raw)) {
      return validationFailure([
        `querystring/platform Invalid enum value. Expected 'ANDROID' | 'IOS' | 'android' | 'ios', received '${raw}'`,
      ])
    }

    /*
     * ⚠️ No parameter at all answers 200 with ANDROID — verified live. The
     * panel never relies on this, and the mock reproduces it so that a caller
     * which forgot the parameter is silently wrong here too, rather than
     * failing loudly in a way production would not.
     */
    const platform = normalisePlatform(raw) ?? 'ANDROID'
    return HttpResponse.json({ success: true, data: configs[platform] })
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

    const platform = normalisePlatform(body['platform']) ?? 'ANDROID'
    const current = configs[platform]

    const scalar = <T>(key: string, fallback: T): T =>
      key in body ? (body[key] as T) : fallback

    configs[platform] = {
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
      data: configs[platform],
    })
  }),
]
