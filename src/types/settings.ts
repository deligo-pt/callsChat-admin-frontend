import { z } from 'zod'

import { idSchema, isoDateTime, itemsEnvelopeSchema } from './common'

/**
 * System Settings contracts.
 *
 * **VERIFIED** against `https://api.callschat.com/api/v1` on 2026-09-01 with a
 * SUPER_ADMIN token — these are measured shapes, not proposals, with two
 * exceptions marked ⚠️ below. See system_settings_plan.md §2 for the probe
 * results these were written from.
 *
 * Where the shipped doc and the live service disagreed, the live service won:
 * the version-policy records carry four keys the doc omits, and uploaded logos
 * land on `media.callschat.com` rather than the documented
 * `storage.callschat.com`.
 */

/* ------------------------------------------------------------------ *
 * Admin settings singleton — GET /admin/settings
 * ------------------------------------------------------------------ */

/**
 * Every optional field is `nullable`, because the API genuinely returns
 * `null` for an unset value rather than omitting the key. `optional()` would
 * type a cleared field as possibly-absent and every consumer would need a
 * second branch for a case that never occurs.
 */
export const systemSettingsSchema = z.object({
  id: z.literal('primary'),
  appName: z.string(),
  logoUrl: z.string().nullable(),
  supportEmail: z.string(),
  supportPhone: z.string().nullable(),
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().nullable(),
  maintenanceStartsAt: isoDateTime.nullable(),
  maintenanceEndsAt: isoDateTime.nullable(),
  tosUrl: z.string().nullable(),
  privacyPolicyUrl: z.string().nullable(),
  maxMediaFileSizeMB: z.number(),
  allowedFileTypes: z.array(z.string()),
  defaultLanguage: z.string(),
  supportedLanguages: z.array(z.string()),
  playStoreUrl: z.string().nullable(),
  appStoreUrl: z.string().nullable(),
  paymentEnabled: z.boolean(),
  /** Free string on the wire, not an enum — `"stripe"` was accepted. */
  paymentProvider: z.string(),
  subscriptionPlansEnabled: z.boolean(),
  updatedAt: isoDateTime,
  /** Bare admin ID with no name or email attached — see §8 O2. */
  updatedBy: idSchema.nullable(),
})

export type SystemSettings = z.infer<typeof systemSettingsSchema>

export const APP_PLATFORMS = ['ANDROID', 'IOS'] as const
export const appPlatformSchema = z.enum(APP_PLATFORMS)
export type AppPlatform = z.infer<typeof appPlatformSchema>

/**
 * The doc documents five keys. The live service returns nine — `id`,
 * `releaseNotes`, `updatedAt` and `updatedBy` are all present.
 *
 * `buildNumber` is a **string**, not a number: sending `45` is rejected with
 * `body/buildNumber Expected string, received number`.
 */
export const appVersionPolicySchema = z.object({
  id: idSchema,
  platform: appPlatformSchema,
  latestVersion: z.string(),
  buildNumber: z.string().nullable(),
  minRequiredVersion: z.string(),
  forceUpdate: z.boolean(),
  releaseNotes: z.string().nullable(),
  updatedAt: isoDateTime,
  updatedBy: idSchema.nullable(),
})

export type AppVersionPolicy = z.infer<typeof appVersionPolicySchema>

export const appVersionPoliciesSchema = z.object({
  android: appVersionPolicySchema,
  ios: appVersionPolicySchema,
})

export type AppVersionPolicies = z.infer<typeof appVersionPoliciesSchema>

export const adminSettingsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    settings: systemSettingsSchema,
    appVersionPolicies: appVersionPoliciesSchema,
  }),
})

/**
 * The four write routes all answer with the settings singleton alongside a
 * `message` — not the bare `{ success, data }` envelope the rest of the API
 * uses. Parsing the returned record is what lets a save seed the form with the
 * server's own normalisation (lowercased file extensions, `""` coerced to
 * `null`) instead of the operator's raw input.
 */
export const settingsMutationResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: systemSettingsSchema,
})

export const versionPolicyMutationResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: appVersionPolicySchema,
})

export const logoUploadResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({ logoUrl: z.string() }),
})

/* ------------------------------------------------------------------ *
 * Deployment — GET /admin/settings/deployment
 * ------------------------------------------------------------------ */

export const deploymentInfoSchema = z.object({
  success: z.literal(true),
  data: z.object({
    backend: z.object({
      version: z.string(),
      commitHash: z.string(),
      environment: z.string(),
      nodeVersion: z.string(),
      deployedAt: isoDateTime,
      uptimeSeconds: z.number().nonnegative(),
    }),
    mobileApps: appVersionPoliciesSchema,
  }),
})

export type DeploymentInfo = z.infer<typeof deploymentInfoSchema>['data']

/* ------------------------------------------------------------------ *
 * Database backups — SUPER_ADMIN
 * ------------------------------------------------------------------ */

export const BACKUP_STATUSES = ['RUNNING', 'SUCCESS', 'FAILED'] as const
export const backupStatusSchema = z.enum(BACKUP_STATUSES)
export type BackupStatus = z.infer<typeof backupStatusSchema>

/**
 * `triggeredBy` arrives fully expanded — id, email, role, displayName,
 * avatarUrl — unlike `updatedBy` on the settings record, which is a bare ID.
 */
export const backupLogSchema = z.object({
  id: idSchema,
  fileName: z.string(),
  fileSizeBytes: z.number().nullable(),
  fileSizeFormatted: z.string().nullable(),
  storageLocation: z.string().nullable(),
  status: backupStatusSchema,
  /** Raw worker failure, e.g. `"Failed to spawn pg_dump: spawn pg_dump ENOENT"`. */
  error: z.string().nullable(),
  startedAt: isoDateTime,
  completedAt: isoDateTime.nullable(),
  triggeredBy: z
    .object({
      id: idSchema,
      email: z.string(),
      role: z.string(),
      displayName: z.string().nullable(),
      avatarUrl: z.string().nullable(),
    })
    .nullable(),
})

export type BackupLog = z.infer<typeof backupLogSchema>

/**
 * ⚠️ NOT the `{ success, data: [], pagination }` envelope the rest of the API
 * uses. This route nests the rows under `data.items` and the page info under
 * `data.meta`. `paginatedSchema` from `types/common` does not fit and must not
 * be forced onto it.
 *
 * The shape was declared inline here while this was the only route that used
 * it. `GET /admin/feedbacks` then shipped with the same envelope
 * (feedback_management_plan.md §2.1), so it moved to
 * {@link itemsEnvelopeSchema} in `types/common` — two occurrences make it a
 * pattern, and a second hand-rolled copy would have been free to drift from
 * this one.
 */
export const backupListResponseSchema = itemsEnvelopeSchema(backupLogSchema)

export type BackupList = z.infer<typeof backupListResponseSchema>['data']

export const backupTriggerResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    jobId: idSchema,
    status: backupStatusSchema,
    startedAt: isoDateTime,
  }),
})

export const backupDownloadResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    downloadUrl: z.string(),
    fileName: z.string(),
    expiresInSeconds: z.number().int().positive(),
  }),
})

/* ------------------------------------------------------------------ *
 * SMS gateway — SUPER_ADMIN
 * ------------------------------------------------------------------ */

export const SMS_PROVIDERS = ['BULKGATE', 'TWILIO', 'DISABLED'] as const
export const smsProviderSchema = z.enum(SMS_PROVIDERS)
export type SmsProvider = z.infer<typeof smsProviderSchema>

export const smsSettingsSchema = z.object({
  id: z.literal('primary'),
  provider: smsProviderSchema,
  isEnabled: z.boolean(),
  bulkgate: z.object({
    appId: z.string().nullable(),
    /** Masked, e.g. `"••••••••••••FNKl"`. Never round-tripped — see §3.9. */
    appTokenMasked: z.string().nullable(),
    senderId: z.string().nullable(),
    senderValue: z.string().nullable(),
    isConfigured: z.boolean(),
  }),
  twilio: z.object({
    accountSid: z.string().nullable(),
    authTokenMasked: z.string().nullable(),
    fromNumber: z.string().nullable(),
    isConfigured: z.boolean(),
  }),
  diagnostics: z.object({
    lastTestStatus: z.enum(['SUCCESS', 'FAILED']).nullable(),
    lastTestMessage: z.string().nullable(),
    lastTestedAt: isoDateTime.nullable(),
  }),
  updatedAt: isoDateTime,
  updatedBy: idSchema.nullable(),
})

export type SmsSettings = z.infer<typeof smsSettingsSchema>

export const smsSettingsResponseSchema = z.object({
  success: z.literal(true),
  data: smsSettingsSchema,
})

/**
 * ⚠️ `PATCH /admin/settings/sms` has **never been called** — the backend owner
 * reported it as not ready and it was deliberately skipped during contract
 * testing. This response shape is taken from the doc alone, which makes it a
 * proposal under plan.md §3.10, not a verified contract. Expect drift and
 * confirm it in Phase S7.
 */
export const smsMutationResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: smsSettingsSchema,
})

export const smsTestResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    provider: smsProviderSchema,
    recipient: z.string(),
    status: z.enum(['SUCCESS', 'FAILED']),
    deliveredAt: isoDateTime,
  }),
})

/* ------------------------------------------------------------------ *
 * Public app config — GET /system/config (unauthenticated)
 * ------------------------------------------------------------------ */

/**
 * A genuinely different shape from the admin record, not a subset: the four
 * maintenance columns collapse into a nested object, and the three payment
 * flags into `platform.paymentPlaceholder`. Two types, deliberately — the
 * whole value of reading this endpoint back is seeing what the mobile client
 * actually receives, which a reshaped admin object would not show.
 */
export const publicConfigSchema = z.object({
  success: z.literal(true),
  data: z.object({
    general: z.object({
      appName: z.string(),
      logoUrl: z.string().nullable(),
      supportEmail: z.string().nullable(),
      supportPhone: z.string().nullable(),
      tosUrl: z.string().nullable(),
      privacyPolicyUrl: z.string().nullable(),
      maintenance: z.object({
        isActive: z.boolean(),
        message: z.string().nullable(),
        startsAt: isoDateTime.nullable(),
        endsAt: isoDateTime.nullable(),
      }),
    }),
    chat: z.object({
      maxMediaFileSizeMB: z.number(),
      allowedFileTypes: z.array(z.string()),
    }),
    platform: z.object({
      defaultLanguage: z.string(),
      supportedLanguages: z.array(z.string()),
      playStoreUrl: z.string().nullable(),
      appStoreUrl: z.string().nullable(),
      paymentPlaceholder: z.object({
        paymentEnabled: z.boolean(),
        paymentProvider: z.string(),
        subscriptionPlansEnabled: z.boolean(),
      }),
    }),
    appVersionPolicy: z.object({
      android: z.object({
        latestVersion: z.string(),
        buildNumber: z.string().nullable(),
        minRequiredVersion: z.string(),
        forceUpdate: z.boolean(),
        releaseNotes: z.string().nullable(),
      }),
      ios: z.object({
        latestVersion: z.string(),
        buildNumber: z.string().nullable(),
        minRequiredVersion: z.string(),
        forceUpdate: z.boolean(),
        releaseNotes: z.string().nullable(),
      }),
    }),
  }),
})

export type PublicConfig = z.infer<typeof publicConfigSchema>['data']

/* ------------------------------------------------------------------ *
 * Documented bounds — stated in the UI, not discovered by rejection
 * ------------------------------------------------------------------ */

/** `body/maxMediaFileSizeMB Minimum media file size is 1MB` / `Maximum … is 100MB`. */
export const MEDIA_SIZE_MIN_MB = 1
export const MEDIA_SIZE_MAX_MB = 100

/** `body/supportedLanguages/N String must contain at least 2 character(s)`. */
export const LANGUAGE_CODE_MIN_LENGTH = 2

/** Doc §3.3. The server checks the declared MIME only, so the UI checks harder. */
export const LOGO_ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/bmp',
  'image/avif',
] as const

export const LOGO_MAX_BYTES = 5 * 1024 * 1024

/** One manual backup per 10 minutes, enforced in Redis and answered as a 400. */
export const BACKUP_RATE_LIMIT_MINUTES = 10

/** Pre-signed download URLs are valid for 5 minutes. */
export const BACKUP_DOWNLOAD_TTL_SECONDS = 300
