import { z } from 'zod'

import {
  BOOTSTRAP_URL_PROTOCOL,
  MIN_BUILD_NUMBER,
  type BootstrapConfig,
  type BootstrapRecordKey,
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
    /**
     * Android only. `minAndroidSdk` exists on the iOS record and means nothing
     * there (§3.9), so the iOS form omits it entirely rather than sending a
     * value that cannot apply. `.optional()` is what carries that: on iOS the
     * key is absent from the values object, not zero and not null.
     *
     * ⚠️ Moved here from `legalSchema` on 2026-10-06. It is a floor on which
     * clients may run, which is what this card decides — `minSupportedVersion`
     * is the same question asked about the app instead of the OS. It sat under
     * Platform & legal because it arrived with the URL fields, not because it
     * belonged with them.
     */
    minAndroidSdk: z
      .number({ message: 'Must be a whole number' })
      .int('Must be a whole number')
      .min(1, 'Must be 1 or greater')
      .max(99, 'Android SDK levels are below 99')
      .optional(),
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
 * ⚠️ Every one of these names the target record explicitly, and takes it as a
 * single `BootstrapRecordKey` rather than as a loose `platform` plus a loose
 * `appType`.
 *
 * `PATCH {}` returns **200 and writes** (plan.md §2.5) — it is not rejected.
 * `platform` and `appType` default independently, so a builder that dropped
 * one would silently edit a record nobody asked for, and the operator would
 * watch their change appear to do nothing. Dropping `appType` is the worse
 * half: it targets `PERSONAL`, and `ANDROID/PERSONAL` is the only one of the
 * four that is live in production.
 *
 * Spreading `key` is what makes this unforgeable — a builder cannot name one
 * field and forget the other, because it never names either.
 * ---------------------------------------------------------------------- */

/**
 * Narrow a record down to the two fields that identify it.
 *
 * ⚠️ **Never spread a `BootstrapRecordKey` directly.** Callers pass the whole
 * `BootstrapConfig`, which satisfies the key structurally but carries 21 other
 * fields — `id`, `configVersion`, `createdAt`, and every switch on the screen.
 * Spreading it put the entire record into every payload: saving the legal card
 * would also have written `maintenanceMode` and `forceUpdate` from whatever the
 * form last read, and the server would have answered 200 because it drops keys
 * it does not recognise rather than rejecting them (§2.3).
 *
 * Caught by `edits.test.tsx`'s iOS assertion — `minAndroidSdk` appeared in a
 * payload that had deliberately omitted it — which is the only reason this is a
 * comment and not a production incident.
 */
function recordKey(key: BootstrapRecordKey): BootstrapRecordKey {
  return { platform: key.platform, appType: key.appType }
}

export function buildReleasePolicyPayload(
  key: BootstrapRecordKey,
  values: ReleasePolicyValues,
): UpdateBootstrapPayload {
  return {
    ...recordKey(key),
    latestVersion: values.latestVersion.trim(),
    latestBuildNumber: values.latestBuildNumber,
    minSupportedVersion: values.minSupportedVersion.trim(),
    minBuildNumber: values.minBuildNumber,
    storeUrl: values.storeUrl.trim(),
    /* Omitted on iOS rather than sent as a meaningless number. */
    ...(values.minAndroidSdk === undefined
      ? {}
      : { minAndroidSdk: values.minAndroidSdk }),
  }
}

export function buildLegalPayload(
  key: BootstrapRecordKey,
  values: LegalValues,
): UpdateBootstrapPayload {
  return {
    ...recordKey(key),
    privacyPolicyUrl: values.privacyPolicyUrl.trim(),
    termsUrl: values.termsUrl.trim(),
    supportEmail: values.supportEmail.trim(),
  }
}

export function buildMaintenanceMessagePayload(
  key: BootstrapRecordKey,
  values: MaintenanceMessageValues,
): UpdateBootstrapPayload {
  const message = values.maintenanceMessage.trim()
  return {
    ...recordKey(key),
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
  key: BootstrapRecordKey,
  features: Readonly<Record<string, boolean>>,
): UpdateBootstrapPayload {
  return { ...recordKey(key), features: { ...features } }
}

/** ⚠️ The whole array, always — `blockedVersions` replaces too. */
export function buildBlockedVersionsPayload(
  key: BootstrapRecordKey,
  versions: readonly string[],
): UpdateBootstrapPayload {
  return { ...recordKey(key), blockedVersions: [...versions] }
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
    ...(config.platform === 'ANDROID' ? { minAndroidSdk: config.minAndroidSdk } : {}),
  }
}

export function toLegalValues(config: BootstrapConfig): LegalValues {
  return {
    privacyPolicyUrl: config.privacyPolicyUrl,
    termsUrl: config.termsUrl,
    supportEmail: config.supportEmail,
  }
}
