import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ValidationError } from '@/api/errors'
import { setSession, resetSessionForTests } from '@/auth/tokenStore'
import { resetSettingsMocks, mockBackupOutcome } from '@/mocks/handlers/settings'
import { parseFieldErrors } from '@/types/common'

import {
  fetchBackupDownloadUrl,
  fetchBackups,
  fetchDeploymentInfo,
  fetchPublicConfig,
  fetchSettings,
  fetchSmsSettings,
  isBackupRateLimited,
  sendTestSms,
  triggerBackup,
  updateChatSettings,
  updateGeneralSettings,
  updatePlatformSettings,
  updateVersionPolicy,
} from './api'

/**
 * Contract tests against the mock backend.
 *
 * Their real subject is the MOCK: each one asserts that it still reproduces a
 * rejection observed on the live API. The mock is the only thing standing
 * between a permissive test suite and a settings form that ships broken, and
 * these tests are what stop someone loosening it to make a test pass.
 *
 * Every message asserted below was copied from a live response on 2026-09-01.
 */

const BASE = 'http://localhost/api/v1'

beforeEach(() => {
  resetSettingsMocks()
  resetSessionForTests()
  setSession({ accessToken: 'a1', refreshToken: 'r1', expiresAt: null })
})

afterEach(() => {
  resetSettingsMocks()
  resetSessionForTests()
})

/** Bypasses `apiClient` so a deliberately malformed request can be sent. */
async function raw(method: string, path: string, body?: string) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: 'Bearer a1',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body }),
  })
  return { status: response.status, json: (await response.json()) as never }
}

describe('reads', () => {
  it('returns a contract-valid settings bundle', async () => {
    const bundle = await fetchSettings()

    expect(bundle.settings.id).toBe('primary')
    expect(bundle.appVersionPolicies.android.platform).toBe('ANDROID')
    expect(bundle.appVersionPolicies.ios.platform).toBe('IOS')
  })

  it('returns deployment info with both mobile policies', async () => {
    const info = await fetchDeploymentInfo()

    expect(info.backend.nodeVersion).toMatch(/^v\d+/)
    expect(info.mobileApps.android.platform).toBe('ANDROID')
  })

  it('reshapes the public config rather than echoing the admin record', async () => {
    const config = await fetchPublicConfig()

    // The four maintenance columns collapse into one nested object.
    expect(config.general.maintenance.isActive).toBe(false)
    expect(config.platform.paymentPlaceholder.paymentEnabled).toBe(false)
    expect(config).not.toHaveProperty('settings')
  })
})

describe('the mandatory-body trap', () => {
  it.each([
    '/admin/settings/general',
    '/admin/settings/chat',
    '/admin/settings/platform',
    '/admin/settings/deployment/app-versions',
  ])('rejects a bodyless PATCH to %s', async (path) => {
    const { status, json } = await raw('PATCH', path)

    expect(status).toBe(400)
    expect(json).toMatchObject({
      error: { message: 'body/ Expected object, received null' },
    })
  })

  it('accepts {} as a no-op', async () => {
    const settings = await updateGeneralSettings({})

    expect(settings.appName).toBe('CallsChat')
  })
})

describe('the clearing asymmetry', () => {
  it('clears a /general field with "" ', async () => {
    await updateGeneralSettings({ supportPhone: '+12025550199' })
    const cleared = await updateGeneralSettings({ supportPhone: '' })

    expect(cleared.supportPhone).toBeNull()
  })

  it('refuses null for supportEmail on /general', async () => {
    const { status, json } = await raw(
      'PATCH',
      '/admin/settings/general',
      JSON.stringify({ supportEmail: null }),
    )

    expect(status).toBe(400)
    expect(json).toMatchObject({
      error: { message: 'body/supportEmail Expected string, received null' },
    })
  })

  it('clears a /platform store URL with null', async () => {
    await updatePlatformSettings({ playStoreUrl: 'https://example.com/x' })
    const cleared = await updatePlatformSettings({ playStoreUrl: null })

    expect(cleared.playStoreUrl).toBeNull()
  })

  it('refuses "" for a /platform store URL — the exact inverse of /general', async () => {
    const { status, json } = await raw(
      'PATCH',
      '/admin/settings/platform',
      JSON.stringify({ playStoreUrl: '', appStoreUrl: '' }),
    )

    expect(status).toBe(400)
    expect(json).toMatchObject({
      error: {
        message:
          'body/playStoreUrl Invalid Google Play Store URL, body/appStoreUrl Invalid Apple App Store URL',
      },
    })
  })
})

describe('chat settings bounds', () => {
  it('enforces 1–100 MB', async () => {
    await expect(updateChatSettings({ maxMediaFileSizeMB: 500 })).rejects.toThrow(
      /Maximum media file size is 100MB/,
    )
    await expect(updateChatSettings({ maxMediaFileSizeMB: 0 })).rejects.toThrow(
      /Minimum media file size is 1MB/,
    )
  })

  it('refuses an empty file-type list', async () => {
    await expect(updateChatSettings({ allowedFileTypes: [] })).rejects.toThrow(
      /At least one file extension must be allowed/,
    )
  })

  it('normalises but does NOT deduplicate', async () => {
    const settings = await updateChatSettings({
      allowedFileTypes: ['.JPG', ' png ', 'jpg', 'jpg'],
    })

    // Duplicates survive server-side — which is why the client dedupes.
    expect(settings.allowedFileTypes).toEqual(['jpg', 'png', 'jpg', 'jpg'])
  })

  it('reports an array failure with a slash-separated index', async () => {
    const { status, json } = await raw(
      'PATCH',
      '/admin/settings/chat',
      JSON.stringify({ allowedFileTypes: ['.EXE', 1] }),
    )

    expect(status).toBe(400)
    expect(json).toMatchObject({
      error: {
        message: 'body/allowedFileTypes/1 Expected string, received number',
      },
    })
  })
})

describe('the cross-field language error', () => {
  it('arrives as BAD_REQUEST with no field prefix', async () => {
    const { status, json } = await raw(
      'PATCH',
      '/admin/settings/platform',
      JSON.stringify({ defaultLanguage: 'zz', supportedLanguages: ['en', 'bn'] }),
    )

    expect(status).toBe(400)
    const message = (json as { error: { message: string } }).error.message
    expect(message).toBe(
      "Default language 'zz' must be included in supported languages.",
    )

    /*
     * Nothing to map to a control — the form has to render this at card level
     * or the operator sees a failed save with no explanation anywhere.
     */
    expect(parseFieldErrors(message)).toEqual([])
  })
})

describe('app version policy replaces rather than merges', () => {
  it('requires platform, latestVersion and minRequiredVersion', async () => {
    await expect(updateVersionPolicy({})).rejects.toThrow(
      'body/platform Required, body/latestVersion Required, body/minRequiredVersion Required',
    )
  })

  it('accepts only ANDROID and IOS', async () => {
    await expect(
      updateVersionPolicy({
        platform: 'WEB',
        latestVersion: '1.0.0',
        minRequiredVersion: '1.0.0',
      }),
    ).rejects.toThrow(/Expected 'ANDROID' \| 'IOS', received 'WEB'/)
  })

  it('WIPES omitted optional fields — the destructive trap', async () => {
    const policy = await updateVersionPolicy({
      platform: 'IOS',
      latestVersion: '1.0.0',
      minRequiredVersion: '1.0.0',
    })

    // Seeded as "1" and "Initial release". Both gone.
    expect(policy.buildNumber).toBeNull()
    expect(policy.releaseNotes).toBeNull()
  })

  it('rejects a numeric buildNumber', async () => {
    await expect(
      updateVersionPolicy({
        platform: 'ANDROID',
        latestVersion: '2.4.0',
        minRequiredVersion: '2.1.0',
        buildNumber: 45,
      }),
    ).rejects.toThrow('body/buildNumber Expected string, received number')
  })

  it('accepts the soft-brick pair, exactly as the live service does', async () => {
    /*
     * min > latest with no complaint. The mock must stay this permissive or
     * the client-side guard in lib/semver.ts looks like dead code.
     */
    const policy = await updateVersionPolicy({
      platform: 'ANDROID',
      latestVersion: '1.0.0',
      minRequiredVersion: '99.0.0',
      buildNumber: '1',
      forceUpdate: true,
      releaseNotes: '',
    })

    expect(policy.minRequiredVersion).toBe('99.0.0')
  })
})

describe('database backups', () => {
  it('answers 202 RUNNING, then settles to FAILED', async () => {
    const { jobId } = await triggerBackup()

    const running = await fetchBackups({ page: 1, limit: 10 })
    expect(running.items[0]?.status).toBe('RUNNING')

    await new Promise((resolve) => setTimeout(resolve, 1700))

    const settled = await fetchBackups({ page: 1, limit: 10 })
    const row = settled.items.find((entry) => entry.id === jobId)
    expect(row?.status).toBe('FAILED')
    // Verbatim, because this is the string an operator forwards to a developer.
    expect(row?.error).toBe('Failed to spawn pg_dump: spawn pg_dump ENOENT')
  })

  it('rate limits with a 400, not a 429', async () => {
    await triggerBackup()

    const error = await triggerBackup().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).status).toBe(400)
    // A handler keyed on 429 would miss this entirely.
    expect(isBackupRateLimited(error)).toBe(true)
  })

  it('does not mistake an ordinary failure for the cooldown', () => {
    expect(isBackupRateLimited(new Error('Something else went wrong'))).toBe(false)
  })

  it('nests rows under data.items and paging under data.meta', async () => {
    const list = await fetchBackups({ page: 1, limit: 10 })

    // NOT the { data: [], pagination } envelope every other list uses.
    expect(Array.isArray(list.items)).toBe(true)
    expect(list.meta.page).toBe(1)
  })

  it('bounds page and limit, with a querystring/ prefix', async () => {
    const { status, json } = await raw(
      'GET',
      '/admin/settings/database/backups?page=0&limit=999',
    )

    expect(status).toBe(400)
    const message = (json as { error: { message: string } }).error.message
    expect(message).toBe(
      'querystring/page Number must be greater than or equal to 1, querystring/limit Number must be less than or equal to 100',
    )
    // The other prefix parseFieldErrors has to recognise.
    expect(parseFieldErrors(message).map((entry) => entry.field)).toEqual([
      'page',
      'limit',
    ])
  })

  it('refuses to download a failed job', async () => {
    const { jobId } = await triggerBackup()
    await new Promise((resolve) => setTimeout(resolve, 1700))

    await expect(fetchBackupDownloadUrl(jobId)).rejects.toThrow(
      'This backup file is not ready or failed to generate.',
    )
  })

  it('returns a pre-signed URL for a job that succeeded', async () => {
    mockBackupOutcome.set('succeed')
    const { jobId } = await triggerBackup()
    await new Promise((resolve) => setTimeout(resolve, 1700))

    const download = await fetchBackupDownloadUrl(jobId)

    expect(download.downloadUrl).toContain('X-Amz-Signature')
    expect(download.expiresInSeconds).toBe(300)
  })

  it('404s on an unknown id', async () => {
    await expect(fetchBackupDownloadUrl('nope')).rejects.toThrow(
      'Database backup record not found.',
    )
  })
})

describe('sms gateway', () => {
  it('returns the token masked, never in plaintext', async () => {
    const sms = await fetchSmsSettings()

    expect(sms.bulkgate.appTokenMasked).toMatch(/^•+/)
    expect(sms.bulkgate).not.toHaveProperty('appToken')
  })

  it('requires only phoneNumber on a test send', async () => {
    const { status, json } = await raw(
      'POST',
      '/admin/settings/sms/test',
      JSON.stringify({}),
    )

    expect(status).toBe(400)
    expect(json).toMatchObject({ error: { message: 'body/phoneNumber Required' } })
  })

  it('leaks the raw provider body on a bad number, exactly as live', async () => {
    /*
     * There is no local validation on this route. The UI validates before
     * calling — this asserts what happens when something does not.
     */
    await expect(sendTestSms('12345')).rejects.toThrow(
      /BulkGate returned HTTP 400\. Body: \{"type":"invalid_phone_number"/,
    )
  })

  it('records diagnostics after a successful send', async () => {
    const result = await sendTestSms('+8801758250036', 'Gateway test')
    expect(result.status).toBe('SUCCESS')

    const sms = await fetchSmsSettings()
    expect(sms.diagnostics.lastTestStatus).toBe('SUCCESS')
    expect(sms.diagnostics.lastTestedAt).not.toBeNull()
  })
})
