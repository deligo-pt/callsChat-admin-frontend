import { z } from 'zod'

/**
 * Admin dashboard contract (plan.md §1, DB0).
 *
 * Written from the **measured** staging responses of 2026-11-11, not from
 * `Admin Panel Dashboard.md`, which differs in three places:
 * - the snapshot does not return `liveStreamingOverview`,
 *   `diamondEconomyOverview` or `withdrawalOverview` (plan.md O1). They are
 *   optional here, so the day the backend adds them they parse, and the panel
 *   can switch over;
 * - trends are three separate series, not one `series[]` (O5);
 * - `/admin/economy/rates` answers a bare object, with no envelope (O3).
 */

export const DASHBOARD_TIMEFRAMES = ['24h', '7d', '30d'] as const
export type DashboardTimeframe = (typeof DASHBOARD_TIMEFRAMES)[number]
export const DEFAULT_TIMEFRAME: DashboardTimeframe = '7d'

export function isDashboardTimeframe(value: unknown): value is DashboardTimeframe {
  return (
    typeof value === 'string' &&
    (DASHBOARD_TIMEFRAMES as readonly string[]).includes(value)
  )
}

const count = z.number().int().nonnegative()
/* Deltas can be negative, and are already percentages (3.1 means 3.1%). */
const percent = z.number()

/* ------------------------------------------------------------------ *
 * Snapshot
 * ------------------------------------------------------------------ */

export const dashboardKpisSchema = z.object({
  totalUsers: count,
  totalUsersDeltaMonthPercent: percent,
  activeNow: count,
  activeNowDeltaHourPercent: percent,
  newToday: count,
  newTodayOnTrack: z.boolean(),
  flagged: count,
  flaggedRequiresAttention: z.boolean(),
})

export const dashboardBreakdownsSchema = z.object({
  status: z.object({
    active: count,
    inactive: count,
    suspended: count,
    pendingVerification: count,
  }),
  roles: z.object({ user: count, moderator: count, admin: count }),
  accountTypes: z.object({ personal: count, business: count }),
})

export const liveTelemetrySchema = z.object({
  currentActiveSessions: count,
  activeSessionsByPlatform: z.object({
    web: count,
    android: count,
    ios: count,
    desktop: count,
  }),
  ongoingCalls: z.object({ total: count, active1v1: count, activeGroup: count }),
})

/** Documented, not returned on staging (plan.md O1). */
export const liveStreamingOverviewSchema = z.object({
  activeAudioRooms: count,
  activeVideoRooms: count,
  activeBroadcasters: count,
  totalRoomsToday: count,
})

/** Documented, not returned on staging (plan.md O1). */
export const diamondEconomyOverviewSchema = z.object({
  totalCirculatingDiamonds: count,
  todayDiamondVolume: count,
  todayTransactionCount: count,
})

/** Documented, not returned on staging (plan.md O1). */
export const withdrawalOverviewSchema = z.object({
  pendingCount: count,
  pendingDiamonds: count,
  pendingAmountBdt: z.number().nonnegative(),
  paidTodayCount: count,
  requiresAttention: z.boolean(),
})

export const businessOverviewSchema = z.object({
  total: count,
  verified: count,
  unverified: count,
  pendingVerificationQueue: count,
})

export const historicalTotalsSchema = z.object({
  totalCallsConnected: count,
  totalCallDurationMinutes: count,
  totalMessagesSent: count,
})

export const dashboardSnapshotSchema = z.object({
  kpis: dashboardKpisSchema,
  breakdowns: dashboardBreakdownsSchema,
  liveTelemetry: liveTelemetrySchema,
  liveStreamingOverview: liveStreamingOverviewSchema.optional(),
  diamondEconomyOverview: diamondEconomyOverviewSchema.optional(),
  withdrawalOverview: withdrawalOverviewSchema.optional(),
  businessOverview: businessOverviewSchema,
  historicalTotals: historicalTotalsSchema,
  timestamp: z.string(),
})

export const dashboardSnapshotEnvelopeSchema = z.object({
  success: z.literal(true),
  data: dashboardSnapshotSchema,
})

export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>

/* ------------------------------------------------------------------ *
 * Trends
 * ------------------------------------------------------------------ */

/**
 * `timestamp` is `YYYY-MM-DD` for 7d / 30d, and only `HH:mmZ` for 24h (no
 * date). `toTrendPoints` turns both into real instants.
 */
const trendStamp = z.string().min(1)

export const dashboardTrendsSchema = z.object({
  timeframe: z.enum(DASHBOARD_TIMEFRAMES),
  signups: z.array(z.object({ timestamp: trendStamp, count })),
  callVolume: z.array(
    z.object({ timestamp: trendStamp, callsCount: count, durationMinutes: count }),
  ),
  activeSessions: z.array(z.object({ timestamp: trendStamp, count })),
})

export const dashboardTrendsEnvelopeSchema = z.object({
  success: z.literal(true),
  data: dashboardTrendsSchema,
})

export type DashboardTrendsRaw = z.infer<typeof dashboardTrendsSchema>

/** One chart point: the three series joined by position, with a real date. */
export interface TrendPoint {
  /** ISO instant at the start of the bucket. */
  readonly at: string
  readonly signups: number
  readonly calls: number
  readonly callMinutes: number
  readonly activeSessions: number
}

export interface DashboardTrends {
  readonly timeframe: DashboardTimeframe
  readonly points: readonly TrendPoint[]
}

/* ------------------------------------------------------------------ *
 * Economy rates — bare object, no envelope (plan.md O3)
 * ------------------------------------------------------------------ */

export const economyRatesSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  /** Minor units (paisa) paid per 100 diamonds: 10000 = ৳100 per 100 💎. */
  payoutRateMinorPer100: count,
  /** Basis points: 7500 = 75%. */
  giftHostBps: count,
  giftPlatformBps: count,
  agencyCommissionSource: z.string(),
  minWithdrawDiamond: count,
  maxWithdrawDiamond: count,
  dailyWithdrawLimitDiamond: count,
  withdrawFeeFlatMinor: count,
  withdrawFeeBps: count,
  isActive: z.boolean(),
  effectiveFrom: z.string(),
  createdByAdminId: z.string().nullable(),
  changeReason: z.string().nullable(),
  createdAt: z.string(),
})

export type EconomyRates = z.infer<typeof economyRatesSchema>
