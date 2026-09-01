import { http, HttpResponse } from 'msw'

import { API_PREFIX, applyScenario, errorResponse } from './shared'

/**
 * Mock System Settings backend.
 *
 * Every rejection below was observed on the live API on 2026-09-01 and is
 * reproduced here verbatim, message included. The rule from `auth.ts` applies
 * with force in this module: **a mock laxer than the service tests nothing.**
 *
 * Four of the eight traps in system_settings_plan.md §3 are request-shape
 * bugs — a payload that omits a field, or clears it with the wrong sentinel.
 * A permissive mock answers `200` to all of them, the suite goes green, and
 * the defect ships. So this handler is deliberately as hostile as the real
 * service:
 *
 *   - a bodyless PATCH is rejected, `{}` is a valid no-op
 *   - `""` clears on /general; `null` is refused for supportEmail
 *   - `null` clears on /platform; `""` is refused for the store URLs
 *   - file types are lowercased and dot-stripped but NOT deduped
 *   - app-versions REPLACES: omitted optional fields are wiped to null
 *   - the cross-field language error is BAD_REQUEST with no field prefix
 *   - array errors index as `body/allowedFileTypes/1`
 *   - the backup rate limit answers 400, not 429
 */

/* ------------------------------------------------------------------ *
 * Backup behaviour switch
 * ------------------------------------------------------------------ */

/**
 * Which way a triggered backup resolves.
 *
 * Defaults to `'fail'` because that is what production does today
 * (`spawn pg_dump ENOENT` — there is no postgres client on the API host).
 * Developing against a mock that succeeds would mean the failure path — the
 * only path that currently exists — is the one nobody ever sees.
 *
 *   __mockBackupOutcome.set('succeed')   // exercise the download flow
 */
type BackupOutcome = 'fail' | 'succeed'

let backupOutcome: BackupOutcome = 'fail'

export const mockBackupOutcome = {
  get: (): BackupOutcome => backupOutcome,
  set: (outcome: BackupOutcome): void => {
    backupOutcome = outcome
  },
}

declare global {
  var __mockBackupOutcome: typeof mockBackupOutcome | undefined
}

globalThis.__mockBackupOutcome = mockBackupOutcome

/* ------------------------------------------------------------------ *
 * Seed state
 * ------------------------------------------------------------------ */

const ADMIN_ID = 'adm_nadia'

/**
 * Mock state lives in `localStorage`, not in module variables.
 *
 * MSW's browser handlers run in the page, so module state is wiped by every
 * full page load — and a backend that forgets a saved setting on refresh is a
 * backend nobody has. `auth.ts` persists its session for the same reason.
 *
 * It also matters for testing: a maintenance banner is supposed to follow the
 * operator across the whole app, and asserting that requires the mode to
 * survive navigating to another page.
 */
const STATE_KEY = 'callschat.mock.settings'

function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(`${STATE_KEY}.${key}`)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveState(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(`${STATE_KEY}.${key}`, JSON.stringify(value))
  } catch {
    /* Private mode or blocked storage — fall back to in-memory only. */
  }
}

interface MockSettings {
  id: 'primary'
  appName: string
  logoUrl: string | null
  supportEmail: string
  supportPhone: string | null
  maintenanceMode: boolean
  maintenanceMessage: string | null
  maintenanceStartsAt: string | null
  maintenanceEndsAt: string | null
  tosUrl: string | null
  privacyPolicyUrl: string | null
  maxMediaFileSizeMB: number
  allowedFileTypes: string[]
  defaultLanguage: string
  supportedLanguages: string[]
  playStoreUrl: string | null
  appStoreUrl: string | null
  paymentEnabled: boolean
  paymentProvider: string
  subscriptionPlansEnabled: boolean
  updatedAt: string
  updatedBy: string | null
}

/** Seeded from the real production record read on 2026-09-01. */
const DEFAULT_SETTINGS: MockSettings = {
  id: 'primary',
  appName: 'CallsChat',
  logoUrl: null,
  supportEmail: 'support@callschat.com',
  supportPhone: null,
  maintenanceMode: false,
  maintenanceMessage: null,
  maintenanceStartsAt: null,
  maintenanceEndsAt: null,
  tosUrl: null,
  privacyPolicyUrl: null,
  maxMediaFileSizeMB: 25,
  allowedFileTypes: [
    'jpg',
    'jpeg',
    'png',
    'webp',
    'gif',
    'mp4',
    'mov',
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'mp3',
    'm4a',
  ],
  defaultLanguage: 'en',
  supportedLanguages: ['en', 'bn', 'pt', 'de'],
  playStoreUrl: null,
  appStoreUrl: null,
  paymentEnabled: false,
  paymentProvider: 'none',
  subscriptionPlansEnabled: false,
  updatedAt: new Date().toISOString(),
  updatedBy: null,
}

let settings: MockSettings = loadState('settings', DEFAULT_SETTINGS)

interface MockPolicy {
  id: string
  platform: 'ANDROID' | 'IOS'
  latestVersion: string
  buildNumber: string | null
  minRequiredVersion: string
  forceUpdate: boolean
  releaseNotes: string | null
  updatedAt: string
  updatedBy: string | null
}

const DEFAULT_POLICIES: Record<'android' | 'ios', MockPolicy> = {
  android: {
    id: 'pol_android',
    platform: 'ANDROID',
    latestVersion: '1.0.0',
    buildNumber: '1',
    minRequiredVersion: '1.0.0',
    forceUpdate: false,
    releaseNotes: 'Initial release',
    updatedAt: new Date().toISOString(),
    updatedBy: null,
  },
  ios: {
    id: 'pol_ios',
    platform: 'IOS',
    latestVersion: '1.0.0',
    buildNumber: '1',
    minRequiredVersion: '1.0.0',
    forceUpdate: false,
    releaseNotes: 'Initial release',
    updatedAt: new Date().toISOString(),
    updatedBy: null,
  },
}

let policies = loadState('policies', DEFAULT_POLICIES)

interface MockBackup {
  id: string
  fileName: string
  fileSizeBytes: number | null
  fileSizeFormatted: string | null
  storageLocation: string | null
  status: 'RUNNING' | 'SUCCESS' | 'FAILED'
  error: string | null
  startedAt: string
  completedAt: string | null
  triggeredBy: {
    id: string
    email: string
    role: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

let backups: MockBackup[] = loadState<MockBackup[]>('backups', [])
let lastBackupAt = loadState('lastBackupAt', 0)

const DEFAULT_SMS = {
  id: 'primary' as const,
  provider: 'BULKGATE' as 'BULKGATE' | 'TWILIO' | 'DISABLED',
  isEnabled: true,
  bulkgate: {
    appId: '35684',
    appTokenMasked: '••••••••••••FNKl',
    senderId: 'gSystem',
    senderValue: null as string | null,
    isConfigured: true,
  },
  twilio: {
    accountSid: null as string | null,
    authTokenMasked: null as string | null,
    fromNumber: null as string | null,
    isConfigured: false,
  },
  diagnostics: {
    lastTestStatus: null as 'SUCCESS' | 'FAILED' | null,
    lastTestMessage: null as string | null,
    lastTestedAt: null as string | null,
  },
  updatedAt: new Date().toISOString(),
  updatedBy: null as string | null,
}

let smsSettings = loadState('sms', DEFAULT_SMS)

/** Persist everything a handler may have mutated. */
function persist(): void {
  saveState('settings', settings)
  saveState('policies', policies)
  saveState('backups', backups)
  saveState('lastBackupAt', lastBackupAt)
  saveState('sms', smsSettings)
}

/** Restores every mutable seed. Called by tests between cases. */
export function resetSettingsMocks(): void {
  settings = {
    ...settings,
    appName: 'CallsChat',
    logoUrl: null,
    supportEmail: 'support@callschat.com',
    supportPhone: null,
    maintenanceMode: false,
    maintenanceMessage: null,
    maintenanceStartsAt: null,
    maintenanceEndsAt: null,
    tosUrl: null,
    privacyPolicyUrl: null,
    maxMediaFileSizeMB: 25,
    allowedFileTypes: [
      'jpg',
      'jpeg',
      'png',
      'webp',
      'gif',
      'mp4',
      'mov',
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'mp3',
      'm4a',
    ],
    defaultLanguage: 'en',
    supportedLanguages: ['en', 'bn', 'pt', 'de'],
    playStoreUrl: null,
    appStoreUrl: null,
    updatedBy: null,
  }
  policies = {
    android: {
      ...policies.android,
      latestVersion: '1.0.0',
      buildNumber: '1',
      minRequiredVersion: '1.0.0',
      forceUpdate: false,
      releaseNotes: 'Initial release',
    },
    ios: {
      ...policies.ios,
      latestVersion: '1.0.0',
      buildNumber: '1',
      minRequiredVersion: '1.0.0',
      forceUpdate: false,
      releaseNotes: 'Initial release',
    },
  }
  backups = []
  lastBackupAt = 0
  backupOutcome = 'fail'
  smsSettings = {
    ...smsSettings,
    diagnostics: { lastTestStatus: null, lastTestMessage: null, lastTestedAt: null },
  }
  persist()
}

/* ------------------------------------------------------------------ *
 * Validation helpers — the mandatory-body trap and the error grammar
 * ------------------------------------------------------------------ */

const VALIDATION = 'FST_ERR_VALIDATION' as const

/**
 * Read a JSON body the way Fastify does.
 *
 * An absent payload becomes `null`, which every route schema here refuses.
 * Returning the sentinel rather than throwing lets each handler answer with
 * the exact live message.
 */
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

const NULL_BODY = errorResponse.bind(
  null,
  400,
  VALIDATION,
  'body/ Expected object, received null',
) as () => Response

/** Joins field failures the way Fastify concatenates them: `", "`. */
function validationFailure(issues: readonly string[]): Response {
  return errorResponse(400, VALIDATION, issues.join(', '))
}

function isUrl(value: string): boolean {
  try {
    void new URL(value)
    return true
  } catch {
    return false
  }
}

function touch(): void {
  settings.updatedAt = new Date().toISOString()
  settings.updatedBy = ADMIN_ID
  persist()
}

function settingsOk(message: string): Response {
  return HttpResponse.json({ success: true, message, data: settings })
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

export const settingsHandlers = [
  /** `GET /system/config` — public, unauthenticated, reshaped. */
  http.get(`${API_PREFIX}/system/config`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    return HttpResponse.json({
      success: true,
      data: {
        general: {
          appName: settings.appName,
          logoUrl: settings.logoUrl,
          supportEmail: settings.supportEmail,
          supportPhone: settings.supportPhone,
          tosUrl: settings.tosUrl,
          privacyPolicyUrl: settings.privacyPolicyUrl,
          maintenance: {
            isActive: settings.maintenanceMode,
            message: settings.maintenanceMessage,
            startsAt: settings.maintenanceStartsAt,
            endsAt: settings.maintenanceEndsAt,
          },
        },
        chat: {
          maxMediaFileSizeMB: settings.maxMediaFileSizeMB,
          allowedFileTypes: settings.allowedFileTypes,
        },
        platform: {
          defaultLanguage: settings.defaultLanguage,
          supportedLanguages: settings.supportedLanguages,
          playStoreUrl: settings.playStoreUrl,
          appStoreUrl: settings.appStoreUrl,
          paymentPlaceholder: {
            paymentEnabled: settings.paymentEnabled,
            paymentProvider: settings.paymentProvider,
            subscriptionPlansEnabled: settings.subscriptionPlansEnabled,
          },
        },
        appVersionPolicy: {
          android: publicPolicy(policies.android),
          ios: publicPolicy(policies.ios),
        },
      },
    })
  }),

  http.get(`${API_PREFIX}/admin/settings`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    return HttpResponse.json({
      success: true,
      data: {
        settings,
        appVersionPolicies: { android: policies.android, ios: policies.ios },
      },
    })
  }),

  /**
   * `PATCH /admin/settings/general`.
   *
   * `""` clears. `null` is accepted for every nullable field but refused for
   * `supportEmail`, which is the asymmetry `serialize.ts` exists to encode.
   */
  http.patch(`${API_PREFIX}/admin/settings/general`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    if (!body) return NULL_BODY()

    const issues: string[] = []

    if ('appName' in body) {
      if (typeof body['appName'] !== 'string' || body['appName'].trim() === '') {
        issues.push('body/appName App name is required')
      }
    }
    if ('supportEmail' in body) {
      const value = body['supportEmail']
      if (typeof value !== 'string') {
        issues.push(`body/supportEmail Expected string, received ${typeName(value)}`)
      } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
        issues.push('body/supportEmail Invalid support email address')
      }
    }
    if ('maintenanceMode' in body && typeof body['maintenanceMode'] !== 'boolean') {
      issues.push(
        `body/maintenanceMode Expected boolean, received ${typeName(body['maintenanceMode'])}`,
      )
    }
    for (const [key, label] of [
      ['tosUrl', 'Terms of Service URL'],
      ['privacyPolicyUrl', 'Privacy Policy URL'],
    ] as const) {
      const value = body[key]
      if (typeof value === 'string' && value !== '' && !isUrl(value)) {
        issues.push(`body/${key} Invalid ${label}`)
      }
    }
    for (const key of ['maintenanceStartsAt', 'maintenanceEndsAt'] as const) {
      const value = body[key]
      if (typeof value === 'string' && value !== '') {
        // A date alone is rejected: the live schema wants a full instant.
        if (!/\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
          issues.push(`body/${key} Invalid datetime`)
        }
      }
    }

    if (issues.length > 0) return validationFailure(issues)

    // `""` -> null. Unknown keys are silently ignored, exactly as live.
    assignNullable(body, 'supportPhone', (v) => (settings.supportPhone = v))
    assignNullable(body, 'tosUrl', (v) => (settings.tosUrl = v))
    assignNullable(body, 'privacyPolicyUrl', (v) => (settings.privacyPolicyUrl = v))
    assignNullable(body, 'maintenanceMessage', (v) => (settings.maintenanceMessage = v))
    assignNullable(
      body,
      'maintenanceStartsAt',
      (v) => (settings.maintenanceStartsAt = v),
    )
    assignNullable(body, 'maintenanceEndsAt', (v) => (settings.maintenanceEndsAt = v))
    if (typeof body['appName'] === 'string') settings.appName = body['appName']
    if (typeof body['supportEmail'] === 'string') {
      settings.supportEmail = body['supportEmail']
    }
    if (typeof body['maintenanceMode'] === 'boolean') {
      settings.maintenanceMode = body['maintenanceMode']
    }
    // `logoUrl` sent here is silently ignored — only the upload route writes it.

    touch()
    return settingsOk('General system settings updated successfully.')
  }),

  /** `POST /admin/settings/logo` — multipart, and a one-way door. */
  http.post(`${API_PREFIX}/admin/settings/logo`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    if (!request.headers.get('Content-Type')?.includes('multipart/form-data')) {
      return errorResponse(406, 'FST_ERR_VALIDATION', 'the request is not multipart')
    }

    const form = await request.formData()
    // The live service accepts ANY field name — it takes the first file part.
    const file = [...form.values()].find(
      (value): value is File => value instanceof File,
    )

    if (!file || !/^image\//.test(file.type)) {
      return errorResponse(
        400,
        'VALIDATION_ERROR',
        'Invalid logo file format. Please upload a valid image (PNG, JPG, JPEG, GIF, WebP, SVG, ICO, BMP, or AVIF).',
      )
    }

    const extension = file.type.split('/')[1]?.replace('svg+xml', 'svg') ?? 'png'
    settings.logoUrl = `https://media.callschat.com/calls-chat-media/brand/logo-${Date.now()}.${extension}`
    touch()

    return HttpResponse.json({
      success: true,
      message: 'Brand logo uploaded and updated successfully.',
      data: { logoUrl: settings.logoUrl },
    })
  }),

  /** `PATCH /admin/settings/chat`. Normalises but does NOT dedupe. */
  http.patch(`${API_PREFIX}/admin/settings/chat`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    if (!body) return NULL_BODY()

    const issues: string[] = []
    const size = body['maxMediaFileSizeMB']

    if (size !== undefined) {
      if (typeof size !== 'number') {
        issues.push(
          `body/maxMediaFileSizeMB Expected number, received ${typeName(size)}`,
        )
      } else if (size < 1) {
        issues.push('body/maxMediaFileSizeMB Minimum media file size is 1MB')
      } else if (size > 100) {
        issues.push('body/maxMediaFileSizeMB Maximum media file size is 100MB')
      }
    }

    const types = body['allowedFileTypes']
    if (types !== undefined) {
      if (!Array.isArray(types)) {
        issues.push(`body/allowedFileTypes Expected array, received ${typeName(types)}`)
      } else if (types.length === 0) {
        issues.push('body/allowedFileTypes At least one file extension must be allowed')
      } else {
        types.forEach((entry, index) => {
          if (typeof entry !== 'string') {
            // Slash-separated index, not brackets — this is the shape that used
            // to defeat `parseFieldErrors` entirely.
            issues.push(
              `body/allowedFileTypes/${index} Expected string, received ${typeName(entry)}`,
            )
          }
        })
      }
    }

    if (issues.length > 0) return validationFailure(issues)

    if (typeof size === 'number') settings.maxMediaFileSizeMB = size
    if (Array.isArray(types)) {
      /*
       * Lowercase, trim, strip a leading dot — and keep duplicates. The live
       * service stored ["jpg","png","jpg","jpg"] verbatim, so deduping here
       * would hide the client-side dedupe requirement.
       */
      settings.allowedFileTypes = (types as string[]).map((entry) =>
        entry.trim().toLowerCase().replace(/^\.+/, ''),
      )
    }

    touch()
    return settingsOk('Chat and media upload settings updated successfully.')
  }),

  /**
   * `PATCH /admin/settings/platform`.
   *
   * The mirror image of `/general`: `null` clears, `""` is a validation
   * failure, and the cross-field language check answers `BAD_REQUEST` with no
   * `body/` prefix at all — a shape `parseFieldErrors` cannot map and the form
   * must render at card level.
   */
  http.patch(`${API_PREFIX}/admin/settings/platform`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    if (!body) return NULL_BODY()

    const issues: string[] = []

    const languages = body['supportedLanguages']
    if (languages !== undefined) {
      if (!Array.isArray(languages)) {
        issues.push(
          `body/supportedLanguages Expected array, received ${typeName(languages)}`,
        )
      } else {
        languages.forEach((code, index) => {
          if (typeof code !== 'string') {
            issues.push(
              `body/supportedLanguages/${index} Expected string, received ${typeName(code)}`,
            )
          } else if (code.length < 2) {
            issues.push(
              `body/supportedLanguages/${index} String must contain at least 2 character(s)`,
            )
          }
        })
      }
    }

    for (const [key, label] of [
      ['playStoreUrl', 'Google Play Store URL'],
      ['appStoreUrl', 'Apple App Store URL'],
    ] as const) {
      const value = body[key]
      // `""` is NOT an escape hatch here — this is the trap.
      if (value !== undefined && value !== null) {
        if (typeof value !== 'string' || !isUrl(value)) {
          issues.push(`body/${key} Invalid ${label}`)
        }
      }
    }

    for (const key of ['paymentEnabled', 'subscriptionPlansEnabled'] as const) {
      const value = body[key]
      if (value !== undefined && typeof value !== 'boolean') {
        issues.push(`body/${key} Expected boolean, received ${typeName(value)}`)
      }
    }

    if (issues.length > 0) return validationFailure(issues)

    const nextLanguages = Array.isArray(languages)
      ? (languages as string[])
      : settings.supportedLanguages
    const nextDefault =
      typeof body['defaultLanguage'] === 'string'
        ? body['defaultLanguage']
        : settings.defaultLanguage

    if (!nextLanguages.includes(nextDefault)) {
      // Different code, no field prefix, and a trailing full stop.
      return errorResponse(
        400,
        'VALIDATION_ERROR',
        `Default language '${nextDefault}' must be included in supported languages.`,
      )
    }

    settings.supportedLanguages = nextLanguages
    settings.defaultLanguage = nextDefault
    if ('playStoreUrl' in body) {
      settings.playStoreUrl = (body['playStoreUrl'] as string | null) ?? null
    }
    if ('appStoreUrl' in body) {
      settings.appStoreUrl = (body['appStoreUrl'] as string | null) ?? null
    }
    if (typeof body['paymentEnabled'] === 'boolean') {
      settings.paymentEnabled = body['paymentEnabled']
    }
    if (typeof body['paymentProvider'] === 'string') {
      settings.paymentProvider = body['paymentProvider']
    }
    if (typeof body['subscriptionPlansEnabled'] === 'boolean') {
      settings.subscriptionPlansEnabled = body['subscriptionPlansEnabled']
    }

    touch()
    return settingsOk('Platform and localization settings updated successfully.')
  }),

  http.get(`${API_PREFIX}/admin/settings/deployment`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    return HttpResponse.json({
      success: true,
      data: {
        backend: {
          version: 'v1.0.0',
          commitHash: 'prod-release',
          environment: 'development',
          nodeVersion: 'v20.20.2',
          deployedAt: new Date(Date.now() - 40_402_000).toISOString(),
          uptimeSeconds: 40402,
        },
        mobileApps: { android: policies.android, ios: policies.ios },
      },
    })
  }),

  /**
   * `PATCH /admin/settings/deployment/app-versions`.
   *
   * **Replaces, does not merge.** An omitted `buildNumber` or `releaseNotes`
   * is written as `null` — the single most destructive behaviour in this
   * module, and the reason `buildVersionPolicyPayload` always sends all six
   * keys. Reproduced faithfully so a partial payload fails a test here rather
   * than silently wiping a release note in production.
   */
  http.patch(
    `${API_PREFIX}/admin/settings/deployment/app-versions`,
    async ({ request }) => {
      const scenario = await applyScenario()
      if (scenario) return scenario

      const body = await readBody(request)
      if (!body) return NULL_BODY()

      const issues: string[] = []
      const platform = body['platform']
      const latest = body['latestVersion']
      const minimum = body['minRequiredVersion']

      if (platform === undefined) issues.push('body/platform Required')
      else if (platform !== 'ANDROID' && platform !== 'IOS') {
        issues.push(
          `body/platform Invalid enum value. Expected 'ANDROID' | 'IOS', received '${String(platform)}'`,
        )
      }
      if (latest === undefined) issues.push('body/latestVersion Required')
      if (minimum === undefined) issues.push('body/minRequiredVersion Required')

      if (
        body['buildNumber'] !== undefined &&
        typeof body['buildNumber'] !== 'string'
      ) {
        issues.push(
          `body/buildNumber Expected string, received ${typeName(body['buildNumber'])}`,
        )
      }
      if (
        body['forceUpdate'] !== undefined &&
        typeof body['forceUpdate'] !== 'boolean'
      ) {
        issues.push(
          `body/forceUpdate Expected boolean, received ${typeName(body['forceUpdate'])}`,
        )
      }

      if (issues.length > 0) return validationFailure(issues)

      const key = platform === 'ANDROID' ? 'android' : 'ios'
      const updated: MockPolicy = {
        ...policies[key],
        latestVersion: String(latest),
        minRequiredVersion: String(minimum),
        // Omitted -> null. No merge. This is the trap.
        buildNumber:
          typeof body['buildNumber'] === 'string' ? body['buildNumber'] : null,
        forceUpdate: body['forceUpdate'] === true,
        releaseNotes:
          typeof body['releaseNotes'] === 'string' ? body['releaseNotes'] : null,
        updatedAt: new Date().toISOString(),
        updatedBy: ADMIN_ID,
      }
      policies = { ...policies, [key]: updated }
      persist()

      /*
       * No `minRequiredVersion <= latestVersion` check, deliberately. The live
       * service accepts the soft-brick pair, so the mock must too — otherwise
       * the client-side guard in `lib/semver.ts` would look redundant and
       * someone would remove it.
       */
      return HttpResponse.json({
        success: true,
        message: `${String(platform)} app version policy updated successfully.`,
        data: updated,
      })
    },
  ),

  /** `POST /admin/settings/database/backup` — no body, 202, then it fails. */
  http.post(`${API_PREFIX}/admin/settings/database/backup`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const now = Date.now()
    if (now - lastBackupAt < 10 * 60 * 1000) {
      // 400, not 429 — a handler keyed on rate-limit status will miss this.
      return errorResponse(
        400,
        'VALIDATION_ERROR',
        'A database backup was recently triggered. Please wait 10 minutes between manual backup requests.',
      )
    }
    lastBackupAt = now

    const startedAt = new Date(now).toISOString()
    const stamp = startedAt.replace(/[:.]/g, '-')
    const job: MockBackup = {
      id: `bkp_${now.toString(36)}`,
      fileName: `callschat_db_backup_${stamp}.sql.gz`,
      fileSizeBytes: null,
      fileSizeFormatted: null,
      storageLocation: null,
      status: 'RUNNING',
      error: null,
      startedAt,
      completedAt: null,
      triggeredBy: {
        id: ADMIN_ID,
        email: 'nadia@callschat.app',
        role: 'SUPER_ADMIN',
        displayName: 'Nadia Chowdhury',
        avatarUrl: null,
      },
    }
    backups = [job, ...backups]
    persist()

    /*
     * Resolve asynchronously so the UI genuinely observes RUNNING first and
     * the polling path is exercised, rather than the row arriving settled.
     */
    setTimeout(() => {
      const index = backups.findIndex((entry) => entry.id === job.id)
      if (index === -1) return
      const completedAt = new Date().toISOString()
      const settled: MockBackup =
        backupOutcome === 'succeed'
          ? {
              ...job,
              status: 'SUCCESS',
              fileSizeBytes: 45_281_920,
              fileSizeFormatted: '43.18 MB',
              storageLocation: `backups/${job.fileName}`,
              completedAt,
            }
          : {
              ...job,
              status: 'FAILED',
              // Verbatim production failure — an operator pastes this to a dev.
              error: 'Failed to spawn pg_dump: spawn pg_dump ENOENT',
              completedAt,
            }
      backups = backups.map((entry) => (entry.id === job.id ? settled : entry))
      persist()
    }, 1500)

    return HttpResponse.json(
      {
        success: true,
        message: 'Database backup job initiated.',
        data: { jobId: job.id, status: 'RUNNING', startedAt },
      },
      { status: 202 },
    )
  }),

  /** `GET …/database/backups` — `data.items` + `data.meta`, not the usual envelope. */
  http.get(`${API_PREFIX}/admin/settings/database/backups`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '1')
    const limit = Number(url.searchParams.get('limit') ?? '10')

    const issues: string[] = []
    // `querystring/`, not `body/` — the other prefix the parser must handle.
    if (!Number.isInteger(page) || page < 1) {
      issues.push('querystring/page Number must be greater than or equal to 1')
    }
    if (!Number.isInteger(limit) || limit > 100) {
      issues.push('querystring/limit Number must be less than or equal to 100')
    }
    if (issues.length > 0) return validationFailure(issues)

    const start = (page - 1) * limit
    return HttpResponse.json({
      success: true,
      data: {
        items: backups.slice(start, start + limit),
        meta: {
          page,
          limit,
          total: backups.length,
          // Live returns 1 even when total is 0 — reproduced, see §8 O5.
          totalPages: Math.max(1, Math.ceil(backups.length / limit)),
        },
      },
    })
  }),

  http.get(
    `${API_PREFIX}/admin/settings/database/backups/:id/download`,
    async ({ params }) => {
      const scenario = await applyScenario()
      if (scenario) return scenario

      const record = backups.find((entry) => entry.id === params['id'])
      if (!record) {
        // The duplicated suffix is the live message, verbatim (§8 O5).
        return errorResponse(
          404,
          'NOT_FOUND',
          'Database backup record not found. not found',
        )
      }
      if (record.status !== 'SUCCESS') {
        return errorResponse(
          400,
          'VALIDATION_ERROR',
          'This backup file is not ready or failed to generate.',
        )
      }

      return HttpResponse.json({
        success: true,
        data: {
          downloadUrl: `https://media.callschat.com/calls-chat-media/backups/${record.fileName}?X-Amz-Signature=mock`,
          fileName: record.fileName,
          expiresInSeconds: 300,
        },
      })
    },
  ),

  http.get(`${API_PREFIX}/admin/settings/sms`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    return HttpResponse.json({ success: true, data: smsSettings })
  }),

  /**
   * `PATCH /admin/settings/sms`.
   *
   * ⚠️ Modelled from the doc — the live route was never called. Secrets are
   * accepted and immediately replaced by a mask so a test can prove the
   * plaintext never comes back out.
   */
  http.patch(`${API_PREFIX}/admin/settings/sms`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    if (!body) return NULL_BODY()

    if (
      body['provider'] !== undefined &&
      !['BULKGATE', 'TWILIO', 'DISABLED'].includes(String(body['provider']))
    ) {
      return validationFailure([
        `body/provider Invalid enum value. Expected 'BULKGATE' | 'TWILIO' | 'DISABLED', received '${String(body['provider'])}'`,
      ])
    }

    if (typeof body['provider'] === 'string') {
      smsSettings.provider = body['provider'] as typeof smsSettings.provider
    }
    if (typeof body['isEnabled'] === 'boolean')
      smsSettings.isEnabled = body['isEnabled']

    if (typeof body['bulkgateAppId'] === 'string') {
      smsSettings.bulkgate = { ...smsSettings.bulkgate, appId: body['bulkgateAppId'] }
    }
    if (typeof body['bulkgateSenderId'] === 'string') {
      smsSettings.bulkgate = {
        ...smsSettings.bulkgate,
        senderId: body['bulkgateSenderId'],
      }
    }
    if (typeof body['bulkgateAppToken'] === 'string') {
      const token = body['bulkgateAppToken']
      smsSettings.bulkgate = {
        ...smsSettings.bulkgate,
        appTokenMasked: `${'•'.repeat(12)}${token.slice(-4)}`,
        isConfigured: true,
      }
    }
    if (typeof body['twilioAccountSid'] === 'string') {
      smsSettings.twilio = {
        ...smsSettings.twilio,
        accountSid: body['twilioAccountSid'],
      }
    }
    if (typeof body['twilioFromNumber'] === 'string') {
      smsSettings.twilio = {
        ...smsSettings.twilio,
        fromNumber: body['twilioFromNumber'],
      }
    }
    if (typeof body['twilioAuthToken'] === 'string') {
      const token = body['twilioAuthToken']
      smsSettings.twilio = {
        ...smsSettings.twilio,
        authTokenMasked: `${'•'.repeat(12)}${token.slice(-4)}`,
        isConfigured: true,
      }
    }

    smsSettings.updatedAt = new Date().toISOString()
    smsSettings.updatedBy = ADMIN_ID
    persist()

    return HttpResponse.json({
      success: true,
      message: 'SMS gateway configuration updated successfully.',
      data: smsSettings,
    })
  }),

  /**
   * `POST /admin/settings/sms/test`.
   *
   * The live route validates nothing locally and leaks the raw provider body
   * into its own message. Both behaviours are reproduced: only `phoneNumber`
   * is required, and a malformed number comes back wrapped in BulkGate's own
   * JSON so the UI's "Response from BULKGATE" panel has something real to show.
   */
  http.post(`${API_PREFIX}/admin/settings/sms/test`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    if (!body) return NULL_BODY()

    if (typeof body['phoneNumber'] !== 'string') {
      return validationFailure(['body/phoneNumber Required'])
    }

    const recipient = body['phoneNumber']
    const deliveredAt = new Date().toISOString()

    if (!/^\+\d{8,15}$/.test(recipient)) {
      smsSettings.diagnostics = {
        lastTestStatus: 'FAILED',
        lastTestMessage: 'Invalid phone number',
        lastTestedAt: deliveredAt,
      }
      persist()
      return errorResponse(
        400,
        'VALIDATION_ERROR',
        'SMS delivery test failed: BulkGate returned HTTP 400. Body: {"type":"invalid_phone_number","code":400,"error":"Invalid phone number","detail":null}',
      )
    }

    smsSettings.diagnostics = {
      lastTestStatus: 'SUCCESS',
      lastTestMessage: 'Test message delivered successfully.',
      lastTestedAt: deliveredAt,
    }
    persist()

    return HttpResponse.json({
      success: true,
      message: `Test SMS dispatched successfully via ${smsSettings.provider}.`,
      data: {
        provider: smsSettings.provider,
        recipient,
        status: 'SUCCESS',
        deliveredAt,
      },
    })
  }),
]

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/** `""` and `null` both clear; an absent key leaves the stored value alone. */
function assignNullable(
  body: Record<string, unknown>,
  key: string,
  assign: (value: string | null) => void,
): void {
  if (!(key in body)) return
  const value = body[key]
  if (value === null || value === '') assign(null)
  else if (typeof value === 'string') assign(value)
}

function publicPolicy(policy: MockPolicy) {
  return {
    latestVersion: policy.latestVersion,
    buildNumber: policy.buildNumber,
    minRequiredVersion: policy.minRequiredVersion,
    forceUpdate: policy.forceUpdate,
    releaseNotes: policy.releaseNotes,
  }
}
