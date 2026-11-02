import { z } from 'zod'

import { idSchema, isoDateTime, paginationSchema } from '@/types/common'

/**
 * Live stream management — `/admin/live/rooms/*` (plan.md §2, phase L0).
 *
 * Measured on staging 2026-11-01 (GET only): 93 rooms, all `ENDED`, all
 * `AUDIO`. **No room was live**, so everything a live room adds — the stage,
 * the audience, live telemetry — is from the guide alone (plan.md L-B6).
 *
 * So the schemas are split by evidence:
 * - **Strict** where a field was seen on every measured row (`id`, `status`,
 *   `title`, `startedAt`, the host's name…): a change there is a contract
 *   break worth surfacing.
 * - **Permissive** (`optional`, `nullable`, open enums) everywhere else, so
 *   the first real live room cannot blank the page over a field the guide
 *   described slightly differently.
 */

/* -------------------------------------------------------------------------
 * Enums — measured from the validator's own error messages
 * ---------------------------------------------------------------------- */

export const LIVE_ROOM_STATUSES = ['LIVE', 'PAUSED', 'ENDED'] as const
export type LiveRoomStatus = (typeof LIVE_ROOM_STATUSES)[number]

/** `status` on the list: the three plus `ALL`. Case-sensitive — `all` is a 400. */
export const LIVE_STATUS_FILTERS = ['LIVE', 'PAUSED', 'ENDED', 'ALL'] as const
export type LiveStatusFilter = (typeof LIVE_STATUS_FILTERS)[number]

export const LIVE_ROOM_TYPES = ['AUDIO', 'VIDEO'] as const
export type LiveRoomType = (typeof LIVE_ROOM_TYPES)[number]

/**
 * ⚠️ **Ten topics, not the guide's four** — read off the validator's 400
 * ("Expected 'TECH' | 'MUSIC' | … received 'chit_chat'"). Upper case only.
 */
export const LIVE_TOPICS = [
  'TECH',
  'MUSIC',
  'TALK',
  'GAMING',
  'BUSINESS',
  'CHIT_CHAT',
  'ENTERTAINMENT',
  'EDUCATION',
  'LIFESTYLE',
  'OTHER',
] as const
export type LiveTopic = (typeof LIVE_TOPICS)[number]

/**
 * Every value the API accepts. ⚠️ Only `recent` and `viewers` are offered in
 * the panel: `diamonds` returned the same order as `recent` and `trending` no
 * readable order (plan.md L-B2).
 */
export const LIVE_SORTS = ['recent', 'viewers', 'diamonds', 'trending'] as const
export type LiveSort = (typeof LIVE_SORTS)[number]
export const OFFERED_LIVE_SORTS = [
  'recent',
  'viewers',
] as const satisfies readonly LiveSort[]

/** `limit` is bounded server-side: `101` and `0` are a `400`. */
export const MAX_LIVE_LIMIT = 100
export const DEFAULT_LIVE_LIMIT = 20

export const VIOLATION_CODES = [
  'COMMUNITY_GUIDELINES',
  'INAPPROPRIATE_CONTENT',
  'COPYRIGHT_INFRINGEMENT',
  'HARASSMENT_HATE_SPEECH',
  'FRAUD_SPAM',
  'OTHER',
] as const
export type ViolationCode = (typeof VIOLATION_CODES)[number]

export const PARTICIPANT_ACTIONS = ['MUTE', 'UNMUTE', 'KICK', 'BLOCK'] as const
export type ParticipantAction = (typeof PARTICIPANT_ACTIONS)[number]

/** Audit-log actions. All but `UNMUTE` / `BLOCK` / `REAP_STALE` were seen live. */
export const MODERATION_ACTIONS = [
  'WARN',
  'TERMINATE',
  'MUTE',
  'UNMUTE',
  'KICK',
  'BLOCK',
  'STAGE_LOCKDOWN',
  'CHAT_PURGED',
  'REAP_STALE',
] as const
export type ModerationAction = (typeof MODERATION_ACTIONS)[number]

export function isOneOf<T extends string>(
  values: readonly T[],
  value: string | null | undefined,
): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}

/* -------------------------------------------------------------------------
 * People
 * ---------------------------------------------------------------------- */

const profileSchema = z.object({
  displayName: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
})

const agencySchema = z
  .object({
    id: z.string().optional(),
    name: z.string().nullable().optional(),
    code: z.string().nullable().optional(),
  })
  .nullable()
  .optional()

/** Host standing. Open: the guide lists `BANNED` on the list but not the detail. */
const liveHostProfileSchema = z
  .object({
    status: z.string().nullable().optional(),
    badgeLevel: z.number().nullable().optional(),
    level: z.number().nullable().optional(),
    totalLiveSessions: z.number().nullable().optional(),
    totalDiamondsEarned: z.number().nullable().optional(),
    withdrawableDiamonds: z.number().nullable().optional(),
    agency: agencySchema,
  })
  .nullable()
  .optional()

export const liveHostSchema = z.object({
  id: idSchema,
  profile: profileSchema.nullable().optional(),
  /** Detail only — measured. The panel never puts it on screen. */
  email: z.string().nullable().optional(),
  /** Detail only — the host's *account* status, e.g. `PENDING_VERIFICATION`. */
  status: z.string().nullable().optional(),
  equippedFrame: z
    .object({ id: z.string(), name: z.string().nullable().optional() })
    .loose()
    .nullable()
    .optional(),
  /** Absent on history rows. */
  liveHostProfile: liveHostProfileSchema,
})
export type LiveHost = z.infer<typeof liveHostSchema>

/* -------------------------------------------------------------------------
 * Rooms
 * ---------------------------------------------------------------------- */

const audioSettingsSchema = z
  .object({
    allowChat: z.boolean().optional(),
    allowGifts: z.boolean().optional(),
    allowStickers: z.boolean().optional(),
    allowReactions: z.boolean().optional(),
    noiseSuppression: z.boolean().optional(),
  })
  .loose()
  .nullable()
  .optional()

/**
 * One row of `GET /admin/live/rooms` **and** of `/history`.
 *
 * ⚠️ History rows are thinner (measured): no `durationSeconds`,
 * `currentViewers`, `activeParticipantsCount`, `host.liveHostProfile` or
 * `_count.participants`. Those are optional here and derived where needed.
 */
export const liveRoomSchema = z.object({
  id: idSchema,
  hostId: z.string().optional(),
  type: z.string(),
  title: z.string(),
  topic: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  status: z.string(),
  maxSeats: z.number().nullable().optional(),
  lockedSeats: z.array(z.number()).nullable().optional(),
  audioSettings: audioSettingsSchema,
  livekitRoomName: z.string().nullable().optional(),
  startedAt: isoDateTime,
  endedAt: isoDateTime.nullable().optional(),
  peakViewers: z.number().nullable().optional(),
  totalViewers: z.number().nullable().optional(),
  durationSeconds: z.number().nullable().optional(),
  activeParticipantsCount: z.number().nullable().optional(),
  currentViewers: z.number().nullable().optional(),
  host: liveHostSchema,
  _count: z
    .object({
      participants: z.number().optional(),
      moderationLogs: z.number().optional(),
      blocks: z.number().optional(),
    })
    .nullable()
    .optional(),
})
export type LiveRoom = z.infer<typeof liveRoomSchema>

export const liveRoomListSchema = z.object({
  success: z.literal(true),
  data: z.array(liveRoomSchema),
  pagination: paginationSchema,
})

/* -------------------------------------------------------------------------
 * The room page
 * ---------------------------------------------------------------------- */

/** ⚠️ Never measured — every ended room has `participants: []`. Guide shape. */
export const stageParticipantSchema = z.object({
  id: z.string().optional(),
  userId: idSchema,
  role: z.string().nullable().optional(),
  /** 1 = host, 2–10 = stage, null = audience. */
  seatSlot: z.number().nullable().optional(),
  isMuted: z.boolean().nullable().optional(),
  joinedAt: isoDateTime.nullable().optional(),
  user: z
    .object({ id: z.string().optional(), profile: profileSchema.nullable().optional() })
    .nullable()
    .optional(),
})
export type StageParticipant = z.infer<typeof stageParticipantSchema>

/** Measured on the one room with a trail (6 entries, 2026-10-31). */
export const moderationLogSchema = z.object({
  id: idSchema,
  roomId: z.string().optional(),
  adminId: z.string().nullable().optional(),
  hostId: z.string().nullable().optional(),
  /** ⚠️ An id only — the name is looked up (plan.md L-B3). */
  targetUserId: z.string().nullable().optional(),
  action: z.string(),
  reason: z.string().nullable().optional(),
  adminNotes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: isoDateTime,
  admin: z
    .object({ id: z.string(), profile: profileSchema.nullable().optional() })
    .nullable()
    .optional(),
})
export type ModerationLog = z.infer<typeof moderationLogSchema>

export const liveRoomDetailSchema = z.object({
  room: liveRoomSchema.extend({
    participants: z.array(stageParticipantSchema).default([]),
    moderationLogs: z.array(moderationLogSchema).default([]),
  }),
  durationSeconds: z.number().nullable().optional(),
  financials: z
    .object({
      diamondsEarned: z.number().nullable().optional(),
      totalDiamondsSpent: z.number().nullable().optional(),
      totalGiftsSent: z.number().nullable().optional(),
      /** ⚠️ `senderId` only — names are looked up (plan.md L-B3). */
      topGifters: z
        .array(
          z.object({
            senderId: z.string(),
            _sum: z.object({ totalPrice: z.number().nullable().optional() }).optional(),
          }),
        )
        .default([]),
    })
    .nullable()
    .optional(),
  telemetry: z
    .object({
      currentLiveViewers: z.number().nullable().optional(),
      pendingSeatRequests: z.number().nullable().optional(),
      isHostOnline: z.boolean().nullable().optional(),
    })
    .nullable()
    .optional(),
})
export type LiveRoomDetail = z.infer<typeof liveRoomDetailSchema>

export const liveRoomDetailEnvelopeSchema = z.object({
  success: z.literal(true),
  data: liveRoomDetailSchema,
})

/* -------------------------------------------------------------------------
 * Analytics and writes
 * ---------------------------------------------------------------------- */

export const liveAnalyticsSchema = z.object({
  activeRoomsTotal: z.number(),
  activeAudioRooms: z.number(),
  activeVideoRooms: z.number(),
  todayEndedRooms: z.number(),
  suspendedHostsCount: z.number(),
  todayModerationActions: z.number(),
  todayDiamondsTurnover: z.number(),
  todayHostEarningsDiamonds: z.number(),
})
export type LiveAnalytics = z.infer<typeof liveAnalyticsSchema>

export const liveAnalyticsEnvelopeSchema = z.object({
  success: z.literal(true),
  data: liveAnalyticsSchema,
})

/** ⚠️ Guide shape — the write was not probed (GET only). */
export const stealthTokenSchema = z.object({
  token: z.string().min(1),
  livekitUrl: z.string().min(1),
  roomName: z.string().optional(),
  participantIdentity: z.string().optional(),
})
export type StealthToken = z.infer<typeof stealthTokenSchema>

export const stealthTokenEnvelopeSchema = z.object({
  success: z.literal(true),
  data: stealthTokenSchema,
})

/** What every moderation write answers, loosely — the panel reads `message` only. */
export const liveWriteEnvelopeSchema = z
  .object({
    success: z.literal(true),
    message: z.string().optional(),
    data: z.unknown().optional(),
  })
  .loose()

export const reapResultEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z
    .object({
      reapedCount: z.number(),
      reapedRoomIds: z.array(z.string()).default([]),
    })
    .optional(),
})

/* -------------------------------------------------------------------------
 * Reading a room honestly
 * ---------------------------------------------------------------------- */

/**
 * Seconds on air. The server's figure when it sends one; otherwise from the
 * two timestamps (history rows carry none), and to now while still live.
 */
export function roomDuration(room: LiveRoom, now: number = Date.now()): number {
  if (room.status === 'LIVE' || room.status === 'PAUSED') {
    return Math.max(0, Math.round((now - Date.parse(room.startedAt)) / 1000))
  }
  if (typeof room.durationSeconds === 'number') return room.durationSeconds
  const end = room.endedAt ? Date.parse(room.endedAt) : Number.NaN
  const start = Date.parse(room.startedAt)
  return Number.isFinite(end) && Number.isFinite(start)
    ? Math.max(0, Math.round((end - start) / 1000))
    : 0
}

export function hostName(host: LiveHost | null | undefined): string {
  return (
    host?.profile?.displayName?.trim() ||
    host?.profile?.username?.trim() ||
    'Unnamed host'
  )
}
