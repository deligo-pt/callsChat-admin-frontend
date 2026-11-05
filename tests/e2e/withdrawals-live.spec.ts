import { expect, test, type APIRequestContext } from '@playwright/test'

import {
  withdrawalDetailEnvelopeSchema,
  withdrawalListSchema,
  withdrawalSettingsEnvelopeSchema,
  withdrawalStatsEnvelopeSchema,
} from '@/types/withdrawals'

/**
 * Real-network smoke for the withdrawal GET endpoints (withdrawals plan W6).
 *
 * Every other spec runs against the MSW mock, which only proves the panel
 * agrees with itself. This one asks the real API and parses the answers with
 * the panel's own schemas, so a renamed field or a number turned string on
 * the server fails here before it blanks a page.
 *
 * **Opt-in and read-only.** It runs only with a token:
 *
 *   LIVE_API_TOKEN=… npx playwright test withdrawals-live --project=desktop-1440
 *
 * `LIVE_API_BASE_URL` defaults to staging. GET requests only — nothing here
 * approves, rejects, pays or changes a setting. The token is read from the
 * environment and never written anywhere.
 */

/* `tests/` compiles with the browser's types, so Node's `process` is reached untyped. */
const ENV =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process
    ?.env ?? {}
const TOKEN = ENV['LIVE_API_TOKEN']
const BASE = `${(ENV['LIVE_API_BASE_URL'] ?? 'https://test-api.callschat.com').replace(/\/$/, '')}/api/v1`

test.skip(!TOKEN, 'Set LIVE_API_TOKEN to run the real-network smoke.')
// One width is enough: nothing here renders.
test.skip(
  ({ viewport }) => (viewport?.width ?? 0) !== 1440,
  'Runs once, at desktop-1440.',
)

async function get(request: APIRequestContext, path: string) {
  const response = await request.get(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN ?? ''}` },
  })
  expect(response.status(), `${path} answered ${response.status()}`).toBe(200)
  return (await response.json()) as unknown
}

test('the real list, stats, settings and a detail parse with the panel’s schemas', async ({
  request,
}) => {
  const list = withdrawalListSchema.safeParse(
    await get(request, '/admin/withdrawals?limit=100&sortOrder=desc'),
  )
  expect(list.error?.issues ?? []).toEqual([])

  for (const status of ['PENDING', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED']) {
    const tab = withdrawalListSchema.safeParse(
      await get(request, `/admin/withdrawals?status=${status}&limit=5`),
    )
    expect(tab.error?.issues ?? [], status).toEqual([])
    for (const row of tab.data?.data ?? []) expect(row.status).toBe(status)
  }

  const stats = withdrawalStatsEnvelopeSchema.safeParse(
    await get(request, '/admin/withdrawals/stats'),
  )
  expect(stats.error?.issues ?? []).toEqual([])

  const settings = withdrawalSettingsEnvelopeSchema.safeParse(
    await get(request, '/admin/withdrawal-settings'),
  )
  expect(settings.error?.issues ?? []).toEqual([])

  const first = list.data?.data[0]
  test.skip(!first, 'No withdrawal requests on this server to open.')
  const detail = withdrawalDetailEnvelopeSchema.safeParse(
    await get(request, `/admin/withdrawals/${encodeURIComponent(first?.id ?? '')}`),
  )
  expect(detail.error?.issues ?? []).toEqual([])
})
