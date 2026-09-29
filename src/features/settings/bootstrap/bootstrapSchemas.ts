import { z } from 'zod'

import {
  BOOTSTRAP_URL_PROTOCOL,
  MIN_BUILD_NUMBER,
  type BootstrapConfig,
  type BootstrapPlatform,
  type UpdateBootstrapPayload,
} from '@/types/bootstrap'

import { isValidSemver } from './semver'

/**
 * Form schemas for the editable bootstrap cards (plan.md §7, phase B2).
 *
 * Each card validates **before** the request, and two of these rules exist
 * only because the server does not enforce them:
 *
 * - **URLs must be `https:`.** `storeUrl`, `privacyPolicyUrl` and `termsUrl`
 *   accept any string — `javascript:alert(1)` was accepted, stored, and served
 *   from the unauthenticated public endpoint (§3.2). The panel refuses to be
 *   the thing that put it there.
 * - **Blocked versions must be real versions.** The server stores
 *   `["garbage","1.2"]` happily (§3.4), and such an entry blocks nobody — an
 *   operator believes a bad build is barred when it is not.
 *
 * The rest mirror the server's own validation, so a field that looks fine here
 * does not come back as a 400.
 */

/** `https:` only, parsed the way a browser would parse it. */
const httpsUrl = z
  .string()
  .trim()
  .min(1, 'Required')
  .refine((value) => {
    try {
      return new URL(value).protocol === BOOTSTRAP_URL_PROTOCOL
    } catch {
      return false
    }
  }, 'Must be a full https:// web address. Mobile clients open this link.')

/** Matches the server: `Must be a valid Semantic Version (e.g. 1.0.0, 1.2.3-beta.1)`. */
const semver = z
  .string()
  .trim()
  .min(1, 'Required')
  .refine(isValidSemver, 'Must be a version number, like 1.2.0 or 1.2.3-beta.1')

/** Matches the server: `Number must be greater than or equal to 1`. */
const buildNumber = z
  .number({ message: 'Must be a whole number' })
  .int('Must be a whole number')
  .min(MIN_BUILD_NUMBER, `Must be ${MIN_BUILD_NUMBER} or greater`)

/* -------------------------------------------------------------------------
 * Release policy
 * ---------------------------------------------------------------------- */

export const releasePolicySchema = z
  .object({
    latestVersion: semver,
    latestBuildNumber: buildNumber,
    minSupportedVersion: semver,
    minBuildNumber: buildNumber,
    storeUrl: httpsUrl,
  })
  /*
   * A cross-field rule the server does not have, and the one most likely to
   * hurt: a minimum above the latest release forces EVERY client to update to
   * a version that does not exist yet. The API accepts it without comment.
   */
  .refine(
    (values) => {
      const compared = compareVersionsForForm(
        values.minSupportedVersion,
        values.latestVersion,
      )
      return compared === null || compared <= 0
    },
    {
      message:
        'The minimum cannot be newer than the latest release — every client would be forced to update to a version that does not exist.',
      path: ['minSupportedVersion'],
    },
  )
  .refine((values) => values.minBuildNumber <= values.latestBuildNumber, {
    message: 'The minimum build cannot be newer than the latest build.',
    path: ['minBuildNumber'],
  })

export type ReleasePolicyValues = z.infer<typeof releasePolicySchema>

/** Local to the schema so the refine above stays readable. */
function compareVersionsForForm(a: string, b: string): number | null {
  if (!isValidSemver(a) || !isValidSemver(b)) return null
  const parse = (value: string) =>
    value
      .split('-')[0]!
      .split('.')
      .map((part) => Number(part))
  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < 3; index += 1) {
    const l = left[index] ?? 0
    const r = right[index] ?? 0
    if (l !== r) return l < r ? -1 : 1
  }
  return 0
}

/* -------------------------------------------------------------------------
 * Legal & platform
 * ---------------------------------------------------------------------- */

export const legalSchema = z.object({
  privacyPolicyUrl: httpsUrl,
  termsUrl: httpsUrl,
  supportEmail: z
    .string()
    .trim()
    .min(1, 'Required')
    /* The server's own words: `Must be a valid email address`. */
    .refine(
      (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
      'Must be a valid email address',
    ),
  /**
   * Android only. `minAndroidSdk` exists on the iOS record and means nothing
   * there (§3.9), so the iOS form omits it entirely rather than sending a
   * value that cannot apply.
   */
  minAndroidSdk: z
    .number({ message: 'Must be a whole number' })
    .int('Must be a whole number')
    .min(1, 'Must be 1 or greater')
    .max(99, 'Android SDK levels are below 99')
    .optional(),
})

export type LegalValues = z.infer<typeof legalSchema>

/* -------------------------------------------------------------------------
 * Maintenance message — the switch itself waits for B3
 * ---------------------------------------------------------------------- */

export const maintenanceMessageSchema = z.object({
  maintenanceMessage: z.string().trim().max(500, 'Keep it under 500 characters'),
})

export type MaintenanceMessageValues = z.infer<typeof maintenanceMessageSchema>

/* -------------------------------------------------------------------------
 * Payload builders
 *
 * ⚠️ Every one of these sets `platform` explicitly. `PATCH {}` returns 200 and
 * writes to ANDROID (§3.3), so a builder that forgot it would silently edit
 * the wrong record — and the operator would see their iOS change appear to do
 * nothing.
 * ---------------------------------------------------------------------- */

export function buildReleasePolicyPayload(
  platform: BootstrapPlatform,
  values: ReleasePolicyValues,
): UpdateBootstrapPayload {
  return {
    platform,
    latestVersion: values.latestVersion.trim(),
    latestBuildNumber: values.latestBuildNumber,
    minSupportedVersion: values.minSupportedVersion.trim(),
    minBuildNumber: values.minBuildNumber,
    storeUrl: values.storeUrl.trim(),
  }
}

export function buildLegalPayload(
  platform: BootstrapPlatform,
  values: LegalValues,
): UpdateBootstrapPayload {
  return {
    platform,
    privacyPolicyUrl: values.privacyPolicyUrl.trim(),
    termsUrl: values.termsUrl.trim(),
    supportEmail: values.supportEmail.trim(),
    /* Omitted on iOS rather than sent as a meaningless number. */
    ...(values.minAndroidSdk === undefined
      ? {}
      : { minAndroidSdk: values.minAndroidSdk }),
  }
}

export function buildMaintenanceMessagePayload(
  platform: BootstrapPlatform,
  values: MaintenanceMessageValues,
): UpdateBootstrapPayload {
  const message = values.maintenanceMessage.trim()
  return {
    platform,
    /*
     * `null` rather than `""`. The server clears on both — verified — so this
     * is a choice about what the panel *means*: an absent message, not an
     * empty one.
     */
    maintenanceMessage: message.length > 0 ? message : null,
  }
}

/**
 * ⚠️ **The whole map, always** (§2.4, §5.4).
 *
 * `features` REPLACES on the server: sending `{"chat":false}` deleted `calls`
 * and `signup`, verified live. The card holds every flag in state and this
 * builder takes every flag — there is no partial form of this call, and the
 * signature is deliberately a complete record rather than a patch.
 */
export function buildFeaturesPayload(
  platform: BootstrapPlatform,
  features: Readonly<Record<string, boolean>>,
): UpdateBootstrapPayload {
  return { platform, features: { ...features } }
}

/** ⚠️ The whole array, always — `blockedVersions` replaces too. */
export function buildBlockedVersionsPayload(
  platform: BootstrapPlatform,
  versions: readonly string[],
): UpdateBootstrapPayload {
  return { platform, blockedVersions: [...versions] }
}

/* -------------------------------------------------------------------------
 * Seeding
 * ---------------------------------------------------------------------- */

export function toReleasePolicyValues(config: BootstrapConfig): ReleasePolicyValues {
  return {
    latestVersion: config.latestVersion,
    latestBuildNumber: config.latestBuildNumber,
    minSupportedVersion: config.minSupportedVersion,
    minBuildNumber: config.minBuildNumber,
    storeUrl: config.storeUrl,
  }
}

export function toLegalValues(config: BootstrapConfig): LegalValues {
  return {
    privacyPolicyUrl: config.privacyPolicyUrl,
    termsUrl: config.termsUrl,
    supportEmail: config.supportEmail,
    ...(config.platform === 'ANDROID' ? { minAndroidSdk: config.minAndroidSdk } : {}),
  }
}
