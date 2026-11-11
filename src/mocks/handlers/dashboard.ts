import { http, HttpResponse } from 'msw'

import { currentMockAdmin } from './auth'
import { API_PREFIX, applyScenario, errorResponse, isEmptyScenario } from './shared'

/**
 * Mock of the admin dashboard reads (plan.md §1, DB0).
 *
 * Copied from staging on 2026-11-11, gaps included, so the panel is built
 * against the server it will meet:
 * - the snapshot has no `liveStreamingOverview`, `diamondEconomyOverview` or
 *   `withdrawalOverview` (O1);
 * - trends are three series, and 24h timestamps are `HH:mmZ` with no date (O5);
 *   `timeframe` outside `24h | 7d | 30d` is a 400 worded as staging words it;
 * - `/admin/economy/rates` is a bare object (O3); `/admin/economy/config` and
 *   `/admin/wallet/summary` are 404 `ROUTE_NOT_FOUND` (O2, O3).
 *
 * By default the numbers are staging's: quiet, mostly zeros, which is the
 * normal case the page must look good in. `__mockDashboard.seed()` (or the
 * e2e `seedDashboardFixtures`) switches to a busy platform, for charts and
 * bars with some volume.
 *
 * ⚠️ Moderators get 403 here. Only Super Admin was measured (plan.md O4); this
 * follows the panel's own rule (D2), not a measured server answer.
 */

const BASE = `${API_PREFIX}/admin`
const VALIDATION = 'FST_ERR_VALIDATION' as const
const ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND' as const
const TIMEFRAMES = ['24h', '7d', '30d'] as const
type Timeframe = (typeof TIMEFRAMES)[number]

let busy = false

/* ------------------------------------------------------------------ *
 * Snapshot
 * ------------------------------------------------------------------ */

function snapshot() {
  const quiet = {
    kpis: {
      totalUsers: 33,
      totalUsersDeltaMonthPercent: 3.1,
      activeNow: 1,
      activeNowDeltaHourPercent: 100,
      newToday: 0,
      newTodayOnTrack: true,
      flagged: 11,
      flaggedRequiresAttention: true,
    },
    breakdowns: {
      status: { active: 21, inactive: 0, suspended: 1, pendingVerification: 10 },
      roles: { user: 31, moderator: 1, admin: 0 },
      accountTypes: { personal: 27, business: 6 },
    },
    liveTelemetry: {
      currentActiveSessions: 3,
      activeSessionsByPlatform: { web: 2, android: 1, ios: 0, desktop: 0 },
      ongoingCalls: { total: 0, active1v1: 0, activeGroup: 0 },
    },
    businessOverview: {
      total: 6,
      verified: 0,
      unverified: 6,
      pendingVerificationQueue: 0,
    },
    historicalTotals: {
      totalCallsConnected: 41,
      totalCallDurationMinutes: 62,
      totalMessagesSent: 270,
    },
  }
  const loud = {
    kpis: {
      totalUsers: 12_450,
      totalUsersDeltaMonthPercent: 14.2,
      activeNow: 438,
      activeNowDeltaHourPercent: -8.5,
      newToday: 92,
      newTodayOnTrack: false,
      flagged: 3,
      flaggedRequiresAttention: false,
    },
    breakdowns: {
      status: { active: 12_100, inactive: 280, suspended: 45, pendingVerification: 25 },
      roles: { user: 12_410, moderator: 25, admin: 15 },
      accountTypes: { personal: 11_800, business: 650 },
    },
    liveTelemetry: {
      currentActiveSessions: 890,
      activeSessionsByPlatform: { web: 320, android: 410, ios: 140, desktop: 20 },
      ongoingCalls: { total: 34, active1v1: 28, activeGroup: 6 },
    },
    businessOverview: {
      total: 650,
      verified: 490,
      unverified: 160,
      pendingVerificationQueue: 12,
    },
    historicalTotals: {
      totalCallsConnected: 48_920,
      totalCallDurationMinutes: 185_400,
      totalMessagesSent: 948_200,
    },
  }
  return { ...(busy ? loud : quiet), timestamp: new Date().toISOString() }
}

/* ------------------------------------------------------------------ *
 * Trends
 * ------------------------------------------------------------------ */

/* Staging's 30 days, oldest first — a quiet month with one signup spike. */
const QUIET_SIGNUPS = [
  2, 1, 0, 3, 1, 0, 20, 1, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0,
]
const QUIET_CALLS = [
  9, 3, 0, 4, 2, 0, 6, 1, 0, 0, 2, 0, 1, 3, 0, 0, 1, 0, 0, 1, 2, 0, 0, 0, 10, 1, 6, 4,
  1, 0,
]
const QUIET_SESSIONS = [
  4, 3, 2, 5, 3, 2, 9, 4, 2, 2, 3, 2, 3, 4, 2, 2, 3, 2, 2, 3, 3, 2, 2, 2, 13, 6, 8, 5,
  3, 1,
]

/** A deterministic wave, so the busy charts look alive but test-stable. */
function wave(index: number, base: number, swing: number, period: number): number {
  return Math.max(
    0,
    Math.round(base + swing * Math.sin((index / period) * Math.PI * 2)),
  )
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function labels(timeframe: Timeframe, now: Date): string[] {
  if (timeframe === '24h') {
    /* Staging: 24 hourly "HH:mmZ" labels, the newest one hour before now. */
    return Array.from({ length: 24 }, (_, index) => {
      const at = new Date(now.getTime() - (24 - index) * 3_600_000)
      return `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}Z`
    })
  }
  const days = timeframe === '7d' ? 7 : 30
  return Array.from({ length: days }, (_, index) => {
    const at = new Date(now.getTime() - (days - 1 - index) * 86_400_000)
    return at.toISOString().slice(0, 10)
  })
}

function trends(timeframe: Timeframe, now: Date) {
  const stamps = labels(timeframe, now)
  const n = stamps.length
  const tail = <T>(list: readonly T[]) => list.slice(Math.max(0, list.length - n))

  if (!busy) {
    const hourly = timeframe === '24h'
    const signups = hourly ? stamps.map(() => 0) : tail(QUIET_SIGNUPS)
    const calls = hourly
      ? stamps.map((_, index) => (index === 20 ? 1 : 0))
      : tail(QUIET_CALLS)
    const sessions = hourly
      ? stamps.map((_, index) => (index % 6 === 0 ? 2 : 1))
      : tail(QUIET_SESSIONS)
    return {
      timeframe,
      signups: stamps.map((timestamp, index) => ({
        timestamp,
        count: signups[index] ?? 0,
      })),
      callVolume: stamps.map((timestamp, index) => ({
        timestamp,
        callsCount: calls[index] ?? 0,
        durationMinutes: (calls[index] ?? 0) * 3,
      })),
      activeSessions: stamps.map((timestamp, index) => ({
        timestamp,
        count: sessions[index] ?? 0,
      })),
    }
  }

  const period = timeframe === '24h' ? 24 : 7
  const scale = timeframe === '24h' ? 1 / 12 : 1
  return {
    timeframe,
    signups: stamps.map((timestamp, index) => ({
      timestamp,
      count: Math.round(wave(index, 95, 30, period) * scale),
    })),
    callVolume: stamps.map((timestamp, index) => {
      const callsCount = Math.round(wave(index + 2, 230, 60, period) * scale)
      return { timestamp, callsCount, durationMinutes: callsCount * 4 }
    }),
    activeSessions: stamps.map((timestamp, index) => ({
      timestamp,
      count: Math.round(
        wave(index + 1, 680, 140, period) * (timeframe === '24h' ? 0.6 : 1),
      ),
    })),
  }
}

/* ------------------------------------------------------------------ *
 * Economy rates — bare, as staging returns it
 * ------------------------------------------------------------------ */

const ECONOMY_RATES = {
  id: 'cmw34y6qc007301p6dk1udbpv',
  version: 2,
  payoutRateMinorPer100: 10_000,
  giftHostBps: 7500,
  giftPlatformBps: 2500,
  agencyCommissionSource: 'PLATFORM',
  minWithdrawDiamond: 500,
  maxWithdrawDiamond: 50_000,
  dailyWithdrawLimitDiamond: 100_000,
  withdrawFeeFlatMinor: 0,
  withdrawFeeBps: 100,
  isActive: true,
  effectiveFrom: '2026-11-05T05:59:16.883Z',
  createdByAdminId: 'cmt8orkov00004upco3oifg2v',
  changeReason: 'Q4 2026 Rate Adjustment - 75% Host Share Promotion',
  createdAt: '2026-11-05T05:59:16.885Z',
}

/* ------------------------------------------------------------------ *
 * Seed switch
 * ------------------------------------------------------------------ */

type FailingSource = 'snapshot' | 'trends' | 'rates'
type FailStatus = 403 | 429 | 500

declare global {
  var __mockDashboard:
    | {
        readonly seed: () => void
        readonly reset: () => void
        /**
         * Make one dashboard source fail (plan.md DB5), to see its own state
         * without the page-wide `__mockScenario`. `heal()` undoes it.
         */
        readonly fail: (source: FailingSource, status: FailStatus) => void
        readonly heal: () => void
      }
    | undefined
}

const failing = new Map<FailingSource, FailStatus>()
const FAIL_FLAG = 'callschat.mocks.dashboard.failing'

function rememberFailures(): void {
  try {
    if (failing.size === 0) sessionStorage.removeItem(FAIL_FLAG)
    else sessionStorage.setItem(FAIL_FLAG, JSON.stringify([...failing]))
  } catch {
    /* Blocked storage: the failure lasts until the next reload. */
  }
}

function forcedFailure(source: FailingSource): Response | null {
  const status = failing.get(source)
  if (status === 403) {
    return errorResponse(403, 'FORBIDDEN', 'You do not have permission to do that.')
  }
  if (status === 429) {
    return errorResponse(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.')
  }
  if (status === 500) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Something went wrong on our side.')
  }
  return null
}

const SEED_FLAG = 'callschat.mocks.dashboard.seeded'

export function resetMockDashboard(): void {
  busy = false
  failing.clear()
}

function remember(seeded: boolean): void {
  try {
    if (seeded) sessionStorage.setItem(SEED_FLAG, '1')
    else sessionStorage.removeItem(SEED_FLAG)
  } catch {
    /* Blocked storage: the preference is lost, nothing else. */
  }
}

/** Read the flag at boot and expose the switch, as the live-room mock does. */
export function exposeDashboardFixtureControls(): void {
  try {
    if (sessionStorage.getItem(SEED_FLAG) === '1') busy = true
    const stored = sessionStorage.getItem(FAIL_FLAG)
    if (stored) {
      for (const [source, status] of JSON.parse(stored) as [
        FailingSource,
        FailStatus,
      ][]) {
        failing.set(source, status)
      }
    }
  } catch {
    /* No storage: staging's quiet numbers, the default anyway. */
  }
  globalThis.__mockDashboard = {
    seed: () => {
      busy = true
      remember(true)
    },
    reset: () => {
      busy = false
      remember(false)
    },
    fail: (source, status) => {
      failing.set(source, status)
      rememberFailures()
    },
    heal: () => {
      failing.clear()
      rememberFailures()
    },
  }
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

function moderatorBlocked(): Response | null {
  return currentMockAdmin()?.role === 'MODERATOR'
    ? errorResponse(403, 'FORBIDDEN', 'Access Denied: Requires ADMIN privileges')
    : null
}

function notFound(path: string): Response {
  return errorResponse(
    404,
    ROUTE_NOT_FOUND,
    `Cannot GET /api/v1/admin/${path} – the requested route does not exist.`,
  )
}

export const dashboardHandlers = [
  http.get(`${BASE}/dashboard/snapshot`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const forced = forcedFailure('snapshot')
    if (forced) return forced
    const blocked = moderatorBlocked()
    if (blocked) return blocked
    const data = snapshot()
    if (isEmptyScenario()) {
      /* A brand-new platform: every counter zero. */
      const zero = JSON.parse(
        JSON.stringify(data, (_key, value: unknown) =>
          typeof value === 'number' ? 0 : value,
        ),
      ) as typeof data
      return HttpResponse.json({
        success: true,
        data: { ...zero, timestamp: data.timestamp },
      })
    }
    return HttpResponse.json({ success: true, data })
  }),

  http.get(`${BASE}/dashboard/trends`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const forced = forcedFailure('trends')
    if (forced) return forced
    const blocked = moderatorBlocked()
    if (blocked) return blocked
    const raw = new URL(request.url).searchParams.get('timeframe') ?? '7d'
    if (!(TIMEFRAMES as readonly string[]).includes(raw)) {
      return errorResponse(
        400,
        VALIDATION,
        `querystring/timeframe Invalid enum value. Expected '24h' | '7d' | '30d', received '${raw}'`,
      )
    }
    const data = trends(raw as Timeframe, new Date())
    if (isEmptyScenario()) {
      const zero = (list: { timestamp: string }[]) =>
        list.map((point) =>
          Object.fromEntries(
            Object.entries(point).map(([key, value]) => [
              key,
              key === 'timestamp' ? value : 0,
            ]),
          ),
        )
      return HttpResponse.json({
        success: true,
        data: {
          timeframe: data.timeframe,
          signups: zero(data.signups),
          callVolume: zero(data.callVolume),
          activeSessions: zero(data.activeSessions),
        },
      })
    }
    return HttpResponse.json({ success: true, data })
  }),

  /* Duplicates the snapshot; mocked only so nothing calling it breaks. */
  http.get(`${BASE}/analytics`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const s = snapshot()
    return HttpResponse.json({
      success: true,
      data: {
        summary: {
          totalUsers: s.kpis.totalUsers,
          activeBusinessAccounts: s.businessOverview.verified,
        },
        liveMetrics: {
          currentActiveSessions: s.liveTelemetry.currentActiveSessions,
          ongoingCallsCount: s.liveTelemetry.ongoingCalls.total,
        },
        historicalTotals: {
          totalCallsConnected: s.historicalTotals.totalCallsConnected,
          totalCallDurationMinutes: s.historicalTotals.totalCallDurationMinutes,
        },
      },
    })
  }),

  http.get(`${BASE}/economy/rates`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const forced = forcedFailure('rates')
    if (forced) return forced
    /* ⚠️ Bare object — no `{ success, data }` (plan.md O3). */
    return HttpResponse.json(ECONOMY_RATES)
  }),

  http.get(`${BASE}/economy/config`, () => notFound('economy/config')),
  http.get(`${BASE}/wallet/summary`, () => notFound('wallet/summary')),
]
