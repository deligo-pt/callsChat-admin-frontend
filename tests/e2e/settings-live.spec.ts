import { expect, test } from '@playwright/test'

import {
  adminSettingsResponseSchema,
  RATE_LIMIT_FIELDS,
  RATE_LIMIT_KEYS,
} from '@/types/settings'

/**
 * Real-network smoke for the rate-limit settings (plan.md RL0).
 *
 * **Opt-in and read-only.** It runs only with a token:
 *
 *   LIVE_API_TOKEN=… npx playwright test settings-live --project=desktop-1440
 *
 * `LIVE_API_BASE_URL` defaults to staging. GET requests only — nothing here
 * saves a setting, and nothing calls the OTP routes, which send real SMS.
 */

/* `tests/` compiles with the browser's types, so Node's `process` is reached untyped. */
const ENV =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process
    ?.env ?? {}
const TOKEN = ENV['LIVE_API_TOKEN']
const BASE = `${(ENV['LIVE_API_BASE_URL'] ?? 'https://test-api.callschat.com').replace(/\/$/, '')}/api/v1`

test.skip(!TOKEN, 'Set LIVE_API_TOKEN to run the real-network smoke.')
test.skip(
  ({ viewport }) => (viewport?.width ?? 0) !== 1440,
  'Runs once, at desktop-1440.',
)

const AUTH = { Authorization: `Bearer ${TOKEN ?? ''}` }

test('the eight rate-limit fields are on the record, in range', async ({ request }) => {
  const response = await request.get(`${BASE}/admin/settings`, { headers: AUTH })
  expect(response.status()).toBe(200)

  const parsed = adminSettingsResponseSchema.safeParse(await response.json())
  expect(parsed.error?.issues ?? []).toEqual([])
  const settings = parsed.data?.data.settings

  for (const key of RATE_LIMIT_KEYS) {
    const value = settings?.[key]
    expect(typeof value, key).toBe('number')
    expect(Number.isInteger(value), key).toBe(true)
    expect(value, key).toBeGreaterThanOrEqual(RATE_LIMIT_FIELDS[key].min)
    expect(value, key).toBeLessThanOrEqual(RATE_LIMIT_FIELDS[key].max)
  }

  /* The limit applies live: the header follows `globalRateLimitMax`. */
  expect(Number(response.headers()['x-ratelimit-limit'])).toBe(
    settings?.globalRateLimitMax,
  )
})

test('there is still no GET for the rate-limit route (plan.md O2)', async ({
  request,
}) => {
  const response = await request.get(`${BASE}/admin/settings/rate-limiting`, {
    headers: AUTH,
  })
  expect(response.status()).toBe(404)
})
