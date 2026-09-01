import { apiClient } from '@/api/client'
import { fetchSettings } from '@/api/systemSettings'
import type { ListParams } from '@/types/common'
import {
  appVersionPoliciesSchema,
  backupDownloadResponseSchema,
  backupListResponseSchema,
  backupTriggerResponseSchema,
  deploymentInfoSchema,
  logoUploadResponseSchema,
  publicConfigSchema,
  settingsMutationResponseSchema,
  smsMutationResponseSchema,
  smsSettingsResponseSchema,
  smsTestResponseSchema,
  systemSettingsSchema,
  versionPolicyMutationResponseSchema,
  type AppVersionPolicy,
  type BackupList,
  type DeploymentInfo,
  type PublicConfig,
  type SmsSettings,
  type SystemSettings,
} from '@/types/settings'
import type { z } from 'zod'

/**
 * System Settings API (system_settings_plan.md §2).
 *
 * **Every response is contract-validated.** These endpoints control what the
 * mobile app receives — a silently wrong `allowedFileTypes` or a mistyped
 * `forceUpdate` degrades the product for every user, so a shape change must
 * surface as an explicit error rather than as a blank field in a form that
 * then saves the blank back.
 *
 * Two rules hold across every mutation here:
 *
 * 1. **A body is mandatory.** A bodyless `PATCH` makes Fastify set
 *    `request.body` to `null` and the route schema rejects it with
 *    `400 body/ Expected object, received null`. `{}` is the minimum. This is
 *    the fifth route family on this backend with that trap.
 * 2. **Payloads are built in `serialize.ts`, never inline.** That is where the
 *    per-endpoint clear-sentinel asymmetry lives.
 */

/**
 * The four settings write routes.
 *
 * They share one response shape and one hazard, so they share one function.
 * The `path` is a closed union rather than a string because a typo here would
 * be a 404 at runtime on a screen whose whole job is changing production.
 */
async function patchSettings(
  path: 'general' | 'chat' | 'platform',
  payload: Record<string, unknown>,
): Promise<SystemSettings> {
  const response = await apiClient.patch<
    z.infer<typeof settingsMutationResponseSchema>
  >(`/admin/settings/${path}`, {
    body: payload,
    schema: settingsMutationResponseSchema,
    resource: `system-settings-${path}`,
  })
  return response.data
}

export function updateGeneralSettings(
  payload: Record<string, unknown>,
): Promise<SystemSettings> {
  return patchSettings('general', payload)
}

/** Maintenance mode shares `/general` — it is columns on the same record. */
export function updateMaintenanceSettings(
  payload: Record<string, unknown>,
): Promise<SystemSettings> {
  return patchSettings('general', payload)
}

export function updateChatSettings(
  payload: Record<string, unknown>,
): Promise<SystemSettings> {
  return patchSettings('chat', payload)
}

export function updatePlatformSettings(
  payload: Record<string, unknown>,
): Promise<SystemSettings> {
  return patchSettings('platform', payload)
}

/**
 * `POST /admin/settings/logo` — multipart.
 *
 * The field name is `file` per the doc. The live service accepts any field
 * name (a part called `logo` worked), but matching the documented contract is
 * free and the tolerance may not survive a backend change.
 *
 * ⚠️ This is a **one-way door**. `logoUrl` has no writer on any JSON route and
 * no delete endpoint, so an upload can only ever be replaced by another
 * upload, never undone. Callers must confirm before invoking.
 */
export async function uploadBrandLogo(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await apiClient.postMultipart<
    z.infer<typeof logoUploadResponseSchema>
  >('/admin/settings/logo', formData, {
    schema: logoUploadResponseSchema,
    resource: 'system-settings-logo',
  })
  return response.data.logoUrl
}

/** `GET /admin/settings/deployment` — backend runtime stats + both policies. */
export async function fetchDeploymentInfo(
  signal?: AbortSignal,
): Promise<DeploymentInfo> {
  const response = await apiClient.get<z.infer<typeof deploymentInfoSchema>>(
    '/admin/settings/deployment',
    {
      schema: deploymentInfoSchema,
      resource: 'deployment-info',
      ...(signal ? { signal } : {}),
    },
  )
  return response.data
}

/**
 * `PATCH /admin/settings/deployment/app-versions`.
 *
 * A **replace, not a merge** — see `buildVersionPolicyPayload`, which is the
 * only sanctioned way to construct this payload. Passing a partial object here
 * silently destroys `buildNumber` and `releaseNotes` on the server.
 */
export async function updateVersionPolicy(
  payload: Record<string, unknown>,
): Promise<AppVersionPolicy> {
  const response = await apiClient.patch<
    z.infer<typeof versionPolicyMutationResponseSchema>
  >('/admin/settings/deployment/app-versions', {
    body: payload,
    schema: versionPolicyMutationResponseSchema,
    resource: 'app-version-policy',
  })
  return response.data
}

/* ------------------------------------------------------------------ *
 * Database backups — SUPER_ADMIN
 * ------------------------------------------------------------------ */

/**
 * `POST /admin/settings/database/backup`.
 *
 * Answers `202` with `status: 'RUNNING'`. **That is not success** — the job
 * runs asynchronously and, on production today, fails ~20ms later with
 * `spawn pg_dump ENOENT`. The only way to learn the outcome is to poll the
 * history list; there is no per-job endpoint.
 *
 * Unlike the PATCH routes, this one takes no body at all.
 *
 * Rate limited to one per 10 minutes, rejected with **400**, not 429 — see
 * `isBackupRateLimited`.
 */
export async function triggerBackup(): Promise<{ jobId: string }> {
  const response = await apiClient.post<z.infer<typeof backupTriggerResponseSchema>>(
    '/admin/settings/database/backup',
    {
      schema: backupTriggerResponseSchema,
      resource: 'database-backup',
    },
  )
  return { jobId: response.data.jobId }
}

/**
 * Is this the 10-minute cooldown rather than a real failure?
 *
 * The backend answers the rate limit with `400 BAD_REQUEST`, so it arrives as
 * a `ValidationError` and never as `RateLimitedError`. Any handler keyed on
 * 429 will miss it entirely, and the operator would see a red failure for
 * something that is neither their mistake nor broken.
 */
export function isBackupRateLimited(error: unknown): boolean {
  return (
    error instanceof Error &&
    /wait \d+ minutes between manual backup requests/i.test(error.message)
  )
}

/**
 * `GET /admin/settings/database/backups`.
 *
 * ⚠️ Nests rows under `data.items` and paging under `data.meta` — NOT the
 * `{ data: [], pagination }` envelope every other list endpoint uses. Query
 * bounds are `page >= 1` and `limit <= 100`, and its validation errors are
 * prefixed `querystring/`, not `body/`.
 */
export async function fetchBackups(
  params: ListParams,
  signal?: AbortSignal,
): Promise<BackupList> {
  const query: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query[key] = value
  }

  const response = await apiClient.get<z.infer<typeof backupListResponseSchema>>(
    '/admin/settings/database/backups',
    {
      params: query,
      schema: backupListResponseSchema,
      resource: 'database-backups',
      ...(signal ? { signal } : {}),
    },
  )
  return response.data
}

/**
 * `GET /admin/settings/database/backups/:id/download`.
 *
 * Returns a pre-signed URL valid for 5 minutes rather than the file itself, so
 * this is not a `downloadFile` call — the caller opens the returned URL. A
 * FAILED or still-running job answers `400`, an unknown id `404`.
 */
export async function fetchBackupDownloadUrl(
  backupId: string,
): Promise<{ downloadUrl: string; fileName: string; expiresInSeconds: number }> {
  const response = await apiClient.get<z.infer<typeof backupDownloadResponseSchema>>(
    `/admin/settings/database/backups/${encodeURIComponent(backupId)}/download`,
    {
      schema: backupDownloadResponseSchema,
      resource: 'database-backup-download',
    },
  )
  return response.data
}

/* ------------------------------------------------------------------ *
 * SMS gateway — SUPER_ADMIN
 * ------------------------------------------------------------------ */

/** `GET /admin/settings/sms`. Secrets arrive masked and stay masked. */
export async function fetchSmsSettings(signal?: AbortSignal): Promise<SmsSettings> {
  const response = await apiClient.get<z.infer<typeof smsSettingsResponseSchema>>(
    '/admin/settings/sms',
    {
      schema: smsSettingsResponseSchema,
      resource: 'sms-settings',
      ...(signal ? { signal } : {}),
    },
  )
  return response.data
}

/**
 * `PATCH /admin/settings/sms`.
 *
 * ⚠️ **Never called against the live API** — reported not ready by the backend
 * owner and deliberately skipped during contract testing. Both the request and
 * response shapes here come from the doc alone, making this the one function
 * in this file that is a proposal rather than a measured contract
 * (plan.md §3.10). Confirm in Phase S7.
 */
export async function updateSmsSettings(
  payload: Record<string, unknown>,
): Promise<SmsSettings> {
  const response = await apiClient.patch<z.infer<typeof smsMutationResponseSchema>>(
    '/admin/settings/sms',
    {
      body: payload,
      schema: smsMutationResponseSchema,
      resource: 'sms-settings-update',
    },
  )
  return response.data
}

export interface SmsTestResult {
  readonly provider: string
  readonly recipient: string
  readonly status: 'SUCCESS' | 'FAILED'
  readonly deliveredAt: string
}

/**
 * `POST /admin/settings/sms/test` — sends a **real SMS** and consumes provider
 * credit.
 *
 * The server performs no validation of its own: it forwards straight to the
 * provider and returns the raw upstream error body inside its message. The
 * caller validates the number before getting here.
 */
export async function sendTestSms(
  phoneNumber: string,
  message?: string,
): Promise<SmsTestResult> {
  const body: Record<string, string> = { phoneNumber }
  if (message && message.trim().length > 0) body['message'] = message.trim()

  const response = await apiClient.post<z.infer<typeof smsTestResponseSchema>>(
    '/admin/settings/sms/test',
    { body, schema: smsTestResponseSchema, resource: 'sms-test' },
  )
  return response.data
}

/* ------------------------------------------------------------------ *
 * Public config
 * ------------------------------------------------------------------ */

/**
 * `GET /system/config` — **unauthenticated**, and read here on purpose.
 *
 * This is the module's honesty mechanism (system_settings_plan.md §5.10). The
 * admin record and the public config are different shapes served through a
 * 60-second Redis cache, so the only way to show an operator what the mobile
 * app will actually receive is to read the endpoint the mobile app reads.
 *
 * A stale answer within the TTL is expected, not a bug — the UI says so.
 */
export async function fetchPublicConfig(signal?: AbortSignal): Promise<PublicConfig> {
  const response = await apiClient.get<z.infer<typeof publicConfigSchema>>(
    '/system/config',
    {
      schema: publicConfigSchema,
      resource: 'public-config',
      ...(signal ? { signal } : {}),
    },
  )
  return response.data
}

/*
 * `fetchSettings` lives in `api/systemSettings.ts` — the maintenance banner in
 * `components/` needs the same read, and lint forbids it from importing a
 * feature. Re-exported here so feature code still has one import site.
 */
export { fetchSettings }

/* Re-exported so features import contract types from one place. */
export type { SystemSettings, AppVersionPolicy, BackupList, SmsSettings, PublicConfig }
export { appVersionPoliciesSchema, systemSettingsSchema }
