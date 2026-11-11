import { expect, test, type APIRequestContext } from '@playwright/test'

import {
  DASHBOARD_TIMEFRAMES,
  dashboardSnapshotEnvelopeSchema,
  dashboardTrendsEnvelopeSchema,
  economyRatesSchema,
} from '@/types/dashboard'
import { liveAnalyticsEnvelopeSchema } from '@/types/liveRooms'
import { topUpRequestListSchema } from '@/types/wallet'
import { withdrawalStatsEnvelopeSchema } from '@/types/withdrawals'

/**
 * Real-network smoke for every endpoint the dashboard reads (plan.md DB6).
 *
 * dashboard.spec.ts runs against the MSW mock, which only proves the panel
 * agrees with itself. This one asks the real API and parses each answer with
 * the panel's own schemas, so a renamed field on the server fails here before
 * it blanks a card.
 *
 * **Opt-in and read-only.** It runs only with a token:
 *
 *   LIVE_API_TOKEN=… npx playwright test dashboard-live --project=desktop-1440
 *
 * `LIVE_API_BASE_URL` defaults to staging. GET requests only. The token is
 * read from the environment and never written anywhere.
 *
 * It does not import `src/api/*`: those modules read Vite's `import.meta.env`
 * when they load, which does not exist in Playwright's Node runner. Only the
 * schemas in `src/types` are shared.
 */

/* `tests/` compiles with the browser's types, so Node's `process` is reached untyped. */
const ENV =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process
    ?.env ?? {}
const TOKEN = ENV['LIVE_API_TOKEN']
const BASE = `${(ENV['LIVE_API_BASE_URL'] ?? 'https://test-api.callschat.com').replace(/\/$/, '')}/api/v1/admin`

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
  return { status: response.status(), body: (await response.json()) as unknown }
}

test('the snapshot parses with the panel’s schema', async ({ request }) => {
  const { status, body } = await get(request, '/dashboard/snapshot')
  expect(status).toBe(200)
  const parsed = dashboardSnapshotEnvelopeSchema.safeParse(body)
  expect(parsed.error?.issues ?? []).toEqual([])
})

test('trends parse for every timeframe, one point per bucket', async ({ request }) => {
  const expected = { '24h': 24, '7d': 7, '30d': 30 } as const
  for (const timeframe of DASHBOARD_TIMEFRAMES) {
    const { status, body } = await get(
      request,
      `/dashboard/trends?timeframe=${timeframe}`,
    )
    expect(status, timeframe).toBe(200)
    const parsed = dashboardTrendsEnvelopeSchema.safeParse(body)
    expect(parsed.error?.issues ?? [], timeframe).toEqual([])
    const data = parsed.data?.data
    expect(data?.timeframe).toBe(timeframe)
    for (const series of [data?.signups, data?.callVolume, data?.activeSessions]) {
      expect(series?.length, timeframe).toBe(expected[timeframe])
    }
  }
})

test('24h labels are what the date reconstruction assumes', async ({ request }) => {
  /*
   * `hourlyInstants` (src/api/dashboard.ts) turns "06:11Z" labels into real
   * instants by anchoring the newest to the latest matching UTC time at or
   * before now, one hour apart (plan.md O5). If the server ever sends full
   * timestamps, or another spacing, this fails first.
   */
  const { body } = await get(request, '/dashboard/trends?timeframe=24h')
  const labels =
    dashboardTrendsEnvelopeSchema.parse(body).data.signups.map((p) => p.timestamp) ?? []
  expect(labels.every((label) => /^\d{2}:\d{2}Z$/.test(label))).toBe(true)

  const minutes = labels.map((label) => {
    const [h, m] = label.slice(0, 5).split(':').map(Number) as [number, number]
    return h * 60 + m
  })
  for (let i = 1; i < minutes.length; i++) {
    const step = ((minutes[i] ?? 0) - (minutes[i - 1] ?? 0) + 1440) % 1440
    expect(step, `${labels[i - 1]} → ${labels[i]}`).toBe(60)
  }
  /* The newest bucket starts at most an hour before now. */
  const now = new Date()
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  const lag = (nowMinutes - (minutes.at(-1) ?? 0) + 1440) % 1440
  expect(lag).toBeLessThanOrEqual(65)
})

test('an unsupported timeframe is a 400, which the panel never sends', async ({
  request,
}) => {
  const { status } = await get(request, '/dashboard/trends?timeframe=90d')
  expect(status).toBe(400)
})

test('economy rates parse — a bare object, no envelope (O3)', async ({ request }) => {
  const { status, body } = await get(request, '/economy/rates')
  expect(status).toBe(200)
  const parsed = economyRatesSchema.safeParse(body)
  expect(parsed.error?.issues ?? []).toEqual([])
  /* The split is what the Economy card draws: it must make a whole. */
  expect((parsed.data?.giftHostBps ?? 0) + (parsed.data?.giftPlatformBps ?? 0)).toBe(
    10_000,
  )
})

test('the other sources the dashboard reads parse too', async ({ request }) => {
  const live = await get(request, '/live/rooms/analytics')
  expect(live.status).toBe(200)
  expect(liveAnalyticsEnvelopeSchema.safeParse(live.body).error?.issues ?? []).toEqual(
    [],
  )

  const withdrawals = await get(request, '/withdrawals/stats')
  expect(withdrawals.status).toBe(200)
  expect(
    withdrawalStatsEnvelopeSchema.safeParse(withdrawals.body).error?.issues ?? [],
  ).toEqual([])

  /* The pending top-up count is the `total` of a one-row page. */
  const topUps = await get(request, '/wallet/requests?status=PENDING&page=1&limit=1')
  expect(topUps.status).toBe(200)
  const page = topUpRequestListSchema.safeParse(topUps.body)
  expect(page.error?.issues ?? []).toEqual([])
  expect(typeof page.data?.data.total).toBe('number')
})

test('the routes the doc lists but staging lacks are still missing (O2, O3)', async ({
  request,
}) => {
  /* If either starts answering, the dashboard can use it: see plan.md §5. */
  expect((await get(request, '/wallet/summary')).status).toBe(404)
  expect((await get(request, '/economy/config')).status).toBe(404)
})
