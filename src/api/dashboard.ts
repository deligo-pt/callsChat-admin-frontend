import type { z } from 'zod'

import { apiClient } from '@/api/client'
import {
  dashboardSnapshotEnvelopeSchema,
  dashboardTrendsEnvelopeSchema,
  economyRatesSchema,
  isDashboardTimeframe,
  DEFAULT_TIMEFRAME,
  type DashboardSnapshot,
  type DashboardTimeframe,
  type DashboardTrends,
  type DashboardTrendsRaw,
  type EconomyRates,
  type TrendPoint,
} from '@/types/dashboard'

/**
 * Admin dashboard reads (plan.md DB0). All GET; nothing here writes.
 *
 * `/admin/analytics` is not called: it repeats the snapshot's numbers. Neither
 * are `/admin/wallet/summary` or `/admin/economy/config`, which are 404 on
 * staging (plan.md O2, O3).
 */

/** `GET /admin/dashboard/snapshot`, polled every 30s by the page (D5). */
export async function fetchDashboardSnapshot(
  signal?: AbortSignal,
): Promise<DashboardSnapshot> {
  const response = await apiClient.get<z.infer<typeof dashboardSnapshotEnvelopeSchema>>(
    '/admin/dashboard/snapshot',
    {
      schema: dashboardSnapshotEnvelopeSchema,
      resource: 'dashboard-snapshot',
      ...(signal ? { signal } : {}),
    },
  )
  return response.data
}

/**
 * `GET /admin/dashboard/trends?timeframe=` — anything but `24h | 7d | 30d` is
 * a 400, so an unknown value falls back to the server's default.
 */
export async function fetchDashboardTrends(
  timeframe: DashboardTimeframe,
  signal?: AbortSignal,
  now: Date = new Date(),
): Promise<DashboardTrends> {
  const safe = isDashboardTimeframe(timeframe) ? timeframe : DEFAULT_TIMEFRAME
  const response = await apiClient.get<z.infer<typeof dashboardTrendsEnvelopeSchema>>(
    '/admin/dashboard/trends',
    {
      params: { timeframe: safe },
      schema: dashboardTrendsEnvelopeSchema,
      resource: 'dashboard-trends',
      ...(signal ? { signal } : {}),
    },
  )
  return toTrends(response.data, now)
}

/**
 * `GET /admin/economy/rates` — ⚠️ a bare object, not `{ success, data }`
 * (plan.md O3). `/admin/economy/config`, the doc's name for it, is a 404.
 */
export async function fetchEconomyRates(signal?: AbortSignal): Promise<EconomyRates> {
  return apiClient.get<EconomyRates>('/admin/economy/rates', {
    schema: economyRatesSchema,
    resource: 'economy-rates',
    ...(signal ? { signal } : {}),
  })
}

/* ------------------------------------------------------------------ *
 * Trends → chart points
 * ------------------------------------------------------------------ */

const HOUR = 3_600_000
const DAY_LABEL = /^\d{4}-\d{2}-\d{2}$/
const HOUR_LABEL = /^(\d{2}):(\d{2})Z?$/

/**
 * Turn the 24h series' `"HH:mmZ"` labels into instants.
 *
 * The server sends no date (plan.md §1.2, O5). Measured: the points run
 * oldest first, an hour apart, and the newest is the most recent `HH:mm` at
 * or before now (UTC). So the last one is anchored to today — or yesterday, if
 * that time is still ahead — and the rest step back an hour each.
 */
export function hourlyInstants(labels: readonly string[], now: Date): string[] {
  const last = labels.at(-1)
  const match = last ? HOUR_LABEL.exec(last) : null
  if (!match) return labels.map(() => '')
  const anchor = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      Number(match[1]),
      Number(match[2]),
    ),
  )
  if (anchor.getTime() > now.getTime()) anchor.setTime(anchor.getTime() - 24 * HOUR)
  const end = anchor.getTime()
  return labels.map((_, index) =>
    new Date(end - (labels.length - 1 - index) * HOUR).toISOString(),
  )
}

/** A `YYYY-MM-DD` day as UTC midnight; anything else is left as it came. */
function dayInstant(label: string): string {
  return DAY_LABEL.test(label) ? `${label}T00:00:00.000Z` : label
}

/**
 * Join the three series by position into chart points.
 *
 * The server returns them the same length and in the same order (measured
 * 24 / 7 / 30). If one is ever shorter, the missing values count as 0 rather
 * than shifting the others out of line.
 */
export function toTrends(
  raw: DashboardTrendsRaw,
  now: Date = new Date(),
): DashboardTrends {
  const length = Math.max(
    raw.signups.length,
    raw.callVolume.length,
    raw.activeSessions.length,
  )
  const labels = Array.from(
    { length },
    (_, index) =>
      raw.signups[index]?.timestamp ??
      raw.callVolume[index]?.timestamp ??
      raw.activeSessions[index]?.timestamp ??
      '',
  )
  const instants =
    raw.timeframe === '24h' ? hourlyInstants(labels, now) : labels.map(dayInstant)

  const points: TrendPoint[] = labels.map((_, index) => ({
    at: instants[index] ?? '',
    signups: raw.signups[index]?.count ?? 0,
    calls: raw.callVolume[index]?.callsCount ?? 0,
    callMinutes: raw.callVolume[index]?.durationMinutes ?? 0,
    activeSessions: raw.activeSessions[index]?.count ?? 0,
  }))

  return { timeframe: raw.timeframe, points }
}
