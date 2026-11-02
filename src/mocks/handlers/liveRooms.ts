import { http, HttpResponse } from 'msw'

import { STAGING_ROOMS } from '../liveRoomsSeed'
import { users } from '../seed'
import { currentMockAdmin } from './auth'
import { API_PREFIX, applyScenario, errorResponse, isEmptyScenario } from './shared'

/**
 * Mock of `/admin/live/rooms/*` (plan.md §2, phase L0).
 *
 * **By default this is staging: 22 captured rooms, every one ENDED.** Nobody
 * is live, which is the state an operator meets today. The live fixtures —
 * a full audio stage, a small video room, a paused room — are opt-in with
 * `__mockLive.seed()` (or the e2e `seedLiveFixtures`), the same contract as
 * `__mockHosts` and `__mockWallet`.
 *
 * Measured and copied: every validation message on the reads, the 404
 * wording, the history/list filter split, `sort=diamonds` behaving as
 * `recent`. ⚠️ **Not measured** (GET-only rule): the writes' responses and
 * error wordings, and the Moderator 403 — those follow the guide and are
 * marked where they are guesses.
 */

const ROOMS = `${API_PREFIX}/admin/live/rooms`
const VALIDATION = 'FST_ERR_VALIDATION' as const

/* ------------------------------------------------------------------ *
 * Model
 * ------------------------------------------------------------------ */

interface MockProfile {
  displayName: string | null
  username: string | null
  avatarUrl: string | null
}

interface MockParticipant {
  id: string
  userId: string
  role: 'HOST' | 'CO_HOST' | 'SPEAKER' | 'VIEWER'
  seatSlot: number | null
  isMuted: boolean
  joinedAt: string
  user: { id: string; profile: MockProfile }
}

interface MockLog {
  id: string
  roomId: string
  adminId: string
  hostId: string
  targetUserId: string | null
  action: string
  reason: string
  adminNotes: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  admin: {
    id: string
    profile: { displayName: string | null; username: string | null }
  }
}

interface MockRoom {
  id: string
  hostId: string
  type: string
  title: string
  topic: string
  coverImageUrl: string | null
  maxSeats: number
  lockedSeats: number[]
  audioSettings: Record<string, boolean>
  status: string
  livekitRoomName: string
  startedAt: string
  endedAt: string | null
  peakViewers: number
  totalViewers: number
  currentViewers: number
  pendingSeatRequests: number
  isHostOnline: boolean
  blocks: number
  host: {
    id: string
    status: string | null
    profile: MockProfile
    equippedFrame: null
    liveHostProfile: {
      status: string
      badgeLevel: number
      level: number
      totalLiveSessions?: number
      totalDiamondsEarned?: number
      withdrawableDiamonds?: number
      agency: { id: string; name: string; code: string } | null
    } | null
  }
  participants: MockParticipant[]
  moderationLogs: MockLog[]
  financials: {
    diamondsEarned: number
    totalDiamondsSpent: number
    totalGiftsSent: number
    topGifters: { senderId: string; _sum: { totalPrice: number } }[]
  }
}

function stagingRooms(): MockRoom[] {
  return (
    structuredClone(STAGING_ROOMS) as unknown as Omit<
      MockRoom,
      | 'currentViewers'
      | 'pendingSeatRequests'
      | 'isHostOnline'
      | 'blocks'
      | 'participants'
    >[]
  ).map((room) => ({
    ...room,
    currentViewers: 0,
    pendingSeatRequests: 0,
    isHostOnline: false,
    blocks: 0,
    participants: [],
  }))
}

/* ------------------------------------------------------------------ *
 * Live fixtures (opt-in)
 * ------------------------------------------------------------------ */

function directoryProfile(index: number): { id: string; profile: MockProfile } {
  const user = users[index]!
  return {
    id: user.id,
    profile: {
      displayName: user.displayName,
      username: user.username,
      avatarUrl: user.avatarUrl,
    },
  }
}

function participant(
  roomId: string,
  index: number,
  role: MockParticipant['role'],
  seatSlot: number | null,
  isMuted: boolean,
  minutesAgo: number,
): MockParticipant {
  const user = directoryProfile(index)
  return {
    id: `lp_${roomId}_${user.id}`,
    userId: user.id,
    role,
    seatSlot,
    isMuted,
    joinedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    user,
  }
}

const STAGING_ADMIN = {
  id: 'cmv80oug40000b9kzd52qpjds',
  profile: { displayName: 'Super Administrator', username: 'superadmin' },
}

/** Directory hosts first, so the record, the badge and the roster all link up. */
function hostIndexes(): number[] {
  const hosts = users.flatMap((user, index) => (user.isHost ? [index] : []))
  return hosts.length >= 3 ? hosts : [0, 1, 2]
}

function liveHost(index: number): MockRoom['host'] {
  const user = directoryProfile(index)
  return {
    id: user.id,
    status: 'ACTIVE',
    profile: user.profile,
    equippedFrame: null,
    liveHostProfile: {
      status: 'ACTIVE',
      badgeLevel: 3,
      level: 7,
      totalLiveSessions: 41,
      totalDiamondsEarned: 128_400,
      withdrawableDiamonds: 22_150,
      agency: { id: 'agy_1', name: 'Global Creator Agency', code: 'AGY-8821' },
    },
  }
}

function liveFixtures(): MockRoom[] {
  const [hostA, hostB, hostC] = hostIndexes() as [number, number, number]
  const minutes = (n: number) => new Date(Date.now() - n * 60_000).toISOString()
  const others = users
    .map((_, index) => index)
    .filter((index) => ![hostA, hostB, hostC].includes(index))

  const stageId = 'lr_live_stage'
  const stage: MockRoom = {
    id: stageId,
    hostId: users[hostA]!.id,
    type: 'AUDIO',
    title: 'Friday Night Acoustic Stage',
    topic: 'MUSIC',
    coverImageUrl: null,
    maxSeats: 10,
    lockedSeats: [9, 10],
    audioSettings: {
      allowChat: true,
      allowGifts: true,
      allowStickers: true,
      allowReactions: true,
      noiseSuppression: true,
    },
    status: 'LIVE',
    livekitRoomName: `live_${users[hostA]!.id}_mock`,
    startedAt: minutes(37),
    endedAt: null,
    peakViewers: 198,
    totalViewers: 260,
    currentViewers: 142,
    pendingSeatRequests: 3,
    isHostOnline: true,
    blocks: 0,
    host: liveHost(hostA),
    participants: [
      participant(stageId, hostA, 'HOST', 1, false, 37),
      participant(stageId, others[0]!, 'CO_HOST', 2, false, 35),
      participant(stageId, others[1]!, 'SPEAKER', 3, true, 30),
      participant(stageId, others[2]!, 'SPEAKER', 4, false, 22),
      participant(stageId, others[3]!, 'SPEAKER', 5, false, 18),
      participant(stageId, others[4]!, 'SPEAKER', 6, false, 9),
      ...[5, 6, 7, 8, 9, 10, 11, 12].map((offset, n) =>
        participant(stageId, others[offset]!, 'VIEWER', null, true, 30 - n * 3),
      ),
    ],
    moderationLogs: [
      {
        id: 'lml_mock_warn',
        roomId: stageId,
        adminId: STAGING_ADMIN.id,
        hostId: users[hostA]!.id,
        targetUserId: null,
        action: 'WARN',
        reason: 'Please keep song lyrics within the community guidelines.',
        adminNotes: 'Second reminder this month.',
        metadata: { violationCode: 'COMMUNITY_GUIDELINES' },
        createdAt: minutes(12),
        admin: STAGING_ADMIN,
      },
    ],
    financials: {
      diamondsEarned: 3150,
      totalDiamondsSpent: 4500,
      totalGiftsSent: 45,
      topGifters: [
        { senderId: users[others[5]!]!.id, _sum: { totalPrice: 1800 } },
        { senderId: users[others[6]!]!.id, _sum: { totalPrice: 1200 } },
        { senderId: users[others[7]!]!.id, _sum: { totalPrice: 900 } },
      ],
    },
  }

  const talkId = 'lr_live_talk'
  const talk: MockRoom = {
    ...stage,
    id: talkId,
    hostId: users[hostB]!.id,
    type: 'VIDEO',
    title: 'Morning Talk — Career Q&A',
    topic: 'TALK',
    lockedSeats: [],
    livekitRoomName: `live_${users[hostB]!.id}_mock`,
    startedAt: minutes(12),
    peakViewers: 41,
    totalViewers: 57,
    currentViewers: 38,
    pendingSeatRequests: 0,
    host: {
      ...liveHost(hostB),
      liveHostProfile: { ...liveHost(hostB).liveHostProfile!, agency: null },
    },
    participants: [
      participant(talkId, hostB, 'HOST', 1, false, 12),
      participant(talkId, others[13]!, 'SPEAKER', 2, false, 10),
      participant(talkId, others[14]!, 'VIEWER', null, true, 8),
      participant(talkId, others[15]!, 'VIEWER', null, true, 4),
    ],
    moderationLogs: [],
    financials: {
      diamondsEarned: 0,
      totalDiamondsSpent: 0,
      totalGiftsSent: 0,
      topGifters: [],
    },
  }

  const pausedId = 'lr_paused_game'
  const paused: MockRoom = {
    ...talk,
    id: pausedId,
    hostId: users[hostC]!.id,
    type: 'AUDIO',
    title: 'Late-night gaming lobby',
    status: 'PAUSED',
    topic: 'GAMING',
    livekitRoomName: `live_${users[hostC]!.id}_mock`,
    startedAt: minutes(64),
    peakViewers: 12,
    totalViewers: 15,
    currentViewers: 4,
    isHostOnline: false,
    host: {
      ...liveHost(hostC),
      liveHostProfile: { ...liveHost(hostC).liveHostProfile!, agency: null },
    },
    participants: [participant(pausedId, hostC, 'HOST', 1, true, 64)],
  }

  return [stage, talk, paused]
}

let rooms: MockRoom[] = stagingRooms()

export function resetMockLiveRooms(): void {
  rooms = stagingRooms()
}

export function seedMockLiveRooms(): void {
  rooms = [...liveFixtures(), ...stagingRooms()]
}

export function mockLiveRooms(): MockRoom[] {
  return rooms
}

/**
 * Rooms still on air, for the host roster mock (plan.md Live L4): the real
 * roster says `isLive` / `currentLiveRoomId` for whoever is broadcasting, so
 * the two mocks must agree on who that is.
 */
export function mockOnAirHosts(): {
  hostId: string
  roomId: string
  status: string
  profile: { displayName: string | null; username: string | null }
}[] {
  return rooms
    .filter((room) => room.status === 'LIVE' || room.status === 'PAUSED')
    .map((room) => ({
      hostId: room.hostId,
      roomId: room.id,
      status: room.host.liveHostProfile?.status ?? 'ACTIVE',
      profile: {
        displayName: room.host.profile.displayName ?? null,
        username: room.host.profile.username ?? null,
      },
    }))
}

declare global {
  var __mockLive: { readonly seed: () => void; readonly reset: () => void } | undefined
}

const SEED_FLAG = 'callschat.mocks.live.seeded'

function remember(seeded: boolean): void {
  try {
    if (seeded) sessionStorage.setItem(SEED_FLAG, '1')
    else sessionStorage.removeItem(SEED_FLAG)
  } catch {
    /* Blocked storage: the preference is lost, nothing else. */
  }
}

/** Read the flag at boot and expose the switch, as `exposeWalletFixtureControls` does. */
export function exposeLiveFixtureControls(): void {
  try {
    if (sessionStorage.getItem(SEED_FLAG) === '1') seedMockLiveRooms()
  } catch {
    /* No storage: staging's state, which is the default anyway. */
  }
  globalThis.__mockLive = {
    seed: () => {
      seedMockLiveRooms()
      remember(true)
    },
    reset: () => {
      resetMockLiveRooms()
      remember(false)
    },
  }
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

const STATUSES = ['LIVE', 'PAUSED', 'ENDED', 'ALL'] as const
const TOPICS = [
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
const SORTS = ['recent', 'viewers', 'diamonds', 'trending'] as const
const TYPES = ['AUDIO', 'VIDEO'] as const

const quote = (values: readonly string[]) => values.map((v) => `'${v}'`).join(' | ')

/** The measured wording: `querystring/status Invalid enum value. Expected … received 'x'`. */
function enumCheck(field: string, values: readonly string[], raw: string | null) {
  if (raw === null || values.includes(raw)) return null
  return `querystring/${field} Invalid enum value. Expected ${quote(values)}, received '${raw}'`
}

function intCheck(field: string, raw: string | null, max?: number) {
  if (raw === null) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 1)
    return `querystring/${field} Number must be greater than or equal to 1`
  if (max && value > max)
    return `querystring/${field} Number must be less than or equal to ${max}`
  return null
}

function likeMatcher(term: string): RegExp {
  const pattern = term
    .split('')
    .map((char) => {
      if (char === '%') return '.*'
      if (char === '_') return '.'
      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return new RegExp(pattern, 'i')
}

function matchesSearch(room: MockRoom, search: string | null): boolean {
  if (!search?.trim()) return true
  const like = likeMatcher(search.trim())
  return [room.title, room.host.profile.displayName, room.host.profile.username].some(
    (value) => value !== null && like.test(value),
  )
}

function durationOf(room: MockRoom): number {
  const end = room.endedAt ? Date.parse(room.endedAt) : Date.now()
  return Math.max(0, Math.round((end - Date.parse(room.startedAt)) / 1000))
}

/** A row of the live list. */
function listRow(room: MockRoom) {
  const {
    participants,
    moderationLogs,
    financials,
    pendingSeatRequests,
    isHostOnline,
    blocks,
    ...rest
  } = room
  void financials
  void pendingSeatRequests
  void isHostOnline
  void blocks
  return {
    ...rest,
    host: {
      id: room.host.id,
      profile: room.host.profile,
      equippedFrame: null,
      liveHostProfile: room.host.liveHostProfile
        ? {
            status: room.host.liveHostProfile.status,
            badgeLevel: room.host.liveHostProfile.badgeLevel,
            level: room.host.liveHostProfile.level,
            agency: room.host.liveHostProfile.agency,
          }
        : null,
    },
    _count: {
      participants: participants.length,
      moderationLogs: moderationLogs.length,
    },
    durationSeconds: durationOf(room),
    activeParticipantsCount: participants.filter((p) => p.seatSlot !== null).length,
  }
}

/** A row of history — measured thinner: no duration, viewers now, or host standing. */
function historyRow(room: MockRoom) {
  const row = listRow(room)
  const { durationSeconds, activeParticipantsCount, currentViewers, ...rest } = row
  void durationSeconds
  void activeParticipantsCount
  void currentViewers
  return {
    ...rest,
    host: { id: room.host.id, profile: room.host.profile },
    _count: { moderationLogs: room.moderationLogs.length },
  }
}

function page<T>(items: readonly T[], pageNumber: number, limit: number) {
  const start = (pageNumber - 1) * limit
  return {
    success: true,
    data: items.slice(start, start + limit),
    pagination: {
      page: pageNumber,
      limit,
      total: items.length,
      totalPages: Math.ceil(items.length / limit),
    },
  }
}

/**
 * ⚠️ Not measured: no Moderator token exists (plan.md L-B1). The guide says
 * `verifyAdmin` — ADMIN and SUPER_ADMIN — so a Moderator is refused here.
 */
function guard(): Response | null {
  const admin = currentMockAdmin()
  if (!admin) return errorResponse(401, 'UNAUTHORIZED', 'Authentication required.')
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') {
    return errorResponse(403, 'FORBIDDEN', 'Access Denied: Requires ADMIN privileges')
  }
  return null
}

function byRecent(a: MockRoom, b: MockRoom) {
  return b.startedAt.localeCompare(a.startedAt)
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

function log(
  room: MockRoom,
  action: string,
  reason: string,
  extra: {
    adminNotes?: string | null
    targetUserId?: string | null
    metadata?: Record<string, unknown> | null
  },
): MockLog {
  const admin = currentMockAdmin()
  const entry: MockLog = {
    id: `lml_${Date.now().toString(36)}_${room.moderationLogs.length}`,
    roomId: room.id,
    adminId: admin?.id ?? STAGING_ADMIN.id,
    hostId: room.hostId,
    targetUserId: extra.targetUserId ?? null,
    action,
    reason,
    adminNotes: extra.adminNotes ?? null,
    metadata: extra.metadata ?? null,
    createdAt: new Date().toISOString(),
    admin: {
      id: admin?.id ?? STAGING_ADMIN.id,
      profile: {
        displayName: admin?.displayName ?? STAGING_ADMIN.profile.displayName,
        username: admin?.username ?? STAGING_ADMIN.profile.username,
      },
    },
  }
  room.moderationLogs = [entry, ...room.moderationLogs]
  return entry
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** ⚠️ Guessed wording (writes not probed): Zod's "Required" for a missing reason. */
function requireText(body: Record<string, unknown>, field: string): string | Response {
  const value = body[field]
  if (typeof value !== 'string' || !value.trim()) {
    return errorResponse(400, VALIDATION, `body/${field} Required`)
  }
  return value.trim()
}

/** The room a write targets — 404 as measured; a non-live room refused (guessed wording). */
function liveTarget(id: string): MockRoom | Response {
  const room = rooms.find((candidate) => candidate.id === id)
  if (!room) return errorResponse(404, 'NOT_FOUND', 'Live room not found')
  if (room.status === 'ENDED') {
    return errorResponse(400, 'BAD_REQUEST', 'Live room has already ended')
  }
  return room
}

async function prelude(): Promise<Response | null> {
  const scenario = await applyScenario()
  if (scenario) return scenario
  return guard()
}

export const liveRoomHandlers = [
  /* Specific paths before `/:id`, which would otherwise read them as ids. */
  http.get(`${ROOMS}/history`, async ({ request }) => {
    const stop = await prelude()
    if (stop) return stop

    const url = new URL(request.url)
    const params = url.searchParams
    const error =
      intCheck('limit', params.get('limit'), 100) ??
      intCheck('page', params.get('page'))
    if (error) return errorResponse(400, VALIDATION, error)

    /* Measured: status, sort, topic and type are ignored here. */
    const start = params.get('startDate')
    const end = params.get('endDate')
    const hostId = params.get('hostId')
    const matched = (isEmptyScenario() ? [] : rooms)
      .filter((room) => room.status === 'ENDED')
      .filter((room) => matchesSearch(room, params.get('search')))
      .filter((room) => !hostId || room.hostId === hostId)
      .filter((room) => !start || room.startedAt >= start)
      .filter((room) => !end || room.startedAt <= end)
      .sort(byRecent)
      .map(historyRow)

    return HttpResponse.json(
      page(matched, Number(params.get('page') ?? 1), Number(params.get('limit') ?? 20)),
    )
  }),

  http.get(`${ROOMS}/analytics`, async () => {
    const stop = await prelude()
    if (stop) return stop

    const source = isEmptyScenario() ? [] : rooms
    const today = new Date().toISOString().slice(0, 10)
    const active = source.filter((room) => room.status === 'LIVE')
    return HttpResponse.json({
      success: true,
      data: {
        activeRoomsTotal: active.length,
        activeAudioRooms: active.filter((room) => room.type === 'AUDIO').length,
        activeVideoRooms: active.filter((room) => room.type === 'VIDEO').length,
        todayEndedRooms: source.filter(
          (room) => room.status === 'ENDED' && room.endedAt?.startsWith(today),
        ).length,
        suspendedHostsCount: new Set(
          source
            .filter((room) => room.host.liveHostProfile?.status === 'SUSPENDED')
            .map((room) => room.hostId),
        ).size,
        todayModerationActions: source
          .flatMap((room) => room.moderationLogs)
          .filter((entry) => entry.createdAt.startsWith(today)).length,
        todayDiamondsTurnover: active.reduce(
          (sum, room) => sum + room.financials.totalDiamondsSpent,
          0,
        ),
        todayHostEarningsDiamonds: active.reduce(
          (sum, room) => sum + room.financials.diamondsEarned,
          0,
        ),
      },
    })
  }),

  http.post(`${ROOMS}/reap-stale`, async ({ request }) => {
    const stop = await prelude()
    if (stop) return stop

    const body = await readBody(request)
    const threshold = body['staleMinutesThreshold']
    if (
      typeof threshold !== 'number' ||
      !Number.isInteger(threshold) ||
      threshold < 1
    ) {
      return errorResponse(
        400,
        VALIDATION,
        'body/staleMinutesThreshold Number must be greater than or equal to 1',
      )
    }
    /* A room is stale when its host is offline — the paused fixture, here. */
    const stale = rooms.filter((room) => room.status !== 'ENDED' && !room.isHostOnline)
    for (const room of stale) {
      room.status = 'ENDED'
      room.endedAt = new Date().toISOString()
      room.participants = []
      room.currentViewers = 0
      log(room, 'REAP_STALE', `Host absent for more than ${threshold} minutes`, {
        metadata: { staleMinutesThreshold: threshold },
      })
    }
    return HttpResponse.json({
      success: true,
      message: `Zombie reaper completed: ${stale.length} stale streams swept.`,
      data: { reapedCount: stale.length, reapedRoomIds: stale.map((room) => room.id) },
    })
  }),

  http.get(ROOMS, async ({ request }) => {
    const stop = await prelude()
    if (stop) return stop

    const params = new URL(request.url).searchParams
    const error =
      enumCheck('status', STATUSES, params.get('status')) ??
      enumCheck('topic', TOPICS, params.get('topic')) ??
      enumCheck('type', TYPES, params.get('type')) ??
      enumCheck('sort', SORTS, params.get('sort')) ??
      intCheck('limit', params.get('limit'), 100) ??
      intCheck('page', params.get('page'))
    if (error) return errorResponse(400, VALIDATION, error)

    const status = params.get('status') ?? 'LIVE'
    const topic = params.get('topic')
    const type = params.get('type')
    const hostId = params.get('hostId')
    const sort = params.get('sort') ?? 'recent'

    const matched = (isEmptyScenario() ? [] : rooms)
      .filter((room) => status === 'ALL' || room.status === status)
      .filter((room) => matchesSearch(room, params.get('search')))
      .filter((room) => !topic || room.topic === topic)
      .filter((room) => !type || room.type === type)
      .filter((room) => !hostId || room.hostId === hostId)
      /* Measured: `diamonds` orders as `recent` (L-B2); `trending` by viewers now. */
      .sort((a, b) =>
        sort === 'viewers'
          ? b.peakViewers - a.peakViewers || byRecent(a, b)
          : sort === 'trending'
            ? b.currentViewers - a.currentViewers || byRecent(a, b)
            : byRecent(a, b),
      )
      .map(listRow)

    return HttpResponse.json(
      page(matched, Number(params.get('page') ?? 1), Number(params.get('limit') ?? 20)),
    )
  }),

  http.get(`${ROOMS}/:id`, async ({ params }) => {
    const stop = await prelude()
    if (stop) return stop

    const room = rooms.find((candidate) => candidate.id === params['id'])
    if (!room) return errorResponse(404, 'NOT_FOUND', 'Live room not found')

    const {
      financials,
      pendingSeatRequests,
      isHostOnline,
      blocks,
      currentViewers,
      ...rest
    } = room
    return HttpResponse.json({
      success: true,
      data: {
        room: {
          ...rest,
          _count: { participants: room.participants.length, blocks },
        },
        durationSeconds: durationOf(room),
        financials,
        telemetry: {
          currentLiveViewers: room.status === 'ENDED' ? 0 : currentViewers,
          pendingSeatRequests,
          isHostOnline: room.status === 'ENDED' ? false : isHostOnline,
        },
      },
    })
  }),

  http.post(`${ROOMS}/:id/stealth-token`, async ({ params }) => {
    const stop = await prelude()
    if (stop) return stop
    const room = liveTarget(String(params['id']))
    if (room instanceof Response) return room
    const admin = currentMockAdmin()
    return HttpResponse.json({
      success: true,
      message: 'Stealth observer token issued successfully',
      data: {
        token: `mock.stealth.${room.id}`,
        /* `.invalid` never resolves, so nothing connects from a mock session. */
        livekitUrl: 'wss://livekit.mock.invalid',
        roomName: room.livekitRoomName,
        participantIdentity: `admin_stealth_${admin?.id ?? 'unknown'}`,
        role: 'VIEWER',
        stealth: true,
      },
    })
  }),

  http.post(`${ROOMS}/:id/warn`, async ({ params, request }) => {
    const stop = await prelude()
    if (stop) return stop
    const room = liveTarget(String(params['id']))
    if (room instanceof Response) return room

    const body = await readBody(request)
    const message = requireText(body, 'message')
    if (message instanceof Response) return message
    const code = String(body['violationCode'] ?? '')
    const codes = [
      'COMMUNITY_GUIDELINES',
      'INAPPROPRIATE_CONTENT',
      'COPYRIGHT_INFRINGEMENT',
      'HARASSMENT_HATE_SPEECH',
      'FRAUD_SPAM',
      'OTHER',
    ]
    const bad = enumCheck('violationCode', codes, code)
    if (bad) return errorResponse(400, VALIDATION, bad.replace('querystring/', 'body/'))

    const entry = log(room, 'WARN', message, {
      adminNotes: typeof body['adminNotes'] === 'string' ? body['adminNotes'] : null,
      metadata: { violationCode: code },
    })
    return HttpResponse.json({
      success: true,
      message: 'Administrative warning dispatched successfully',
      data: {
        log: {
          id: entry.id,
          action: 'WARN',
          reason: message,
          createdAt: entry.createdAt,
        },
      },
    })
  }),

  http.post(
    `${ROOMS}/:id/participants/:userId/moderate`,
    async ({ params, request }) => {
      const stop = await prelude()
      if (stop) return stop
      const room = liveTarget(String(params['id']))
      if (room instanceof Response) return room

      const body = await readBody(request)
      const action = String(body['action'] ?? '')
      const bad = enumCheck('action', ['MUTE', 'UNMUTE', 'KICK', 'BLOCK'], action)
      if (bad)
        return errorResponse(400, VALIDATION, bad.replace('querystring/', 'body/'))
      const reason = requireText(body, 'reason')
      if (reason instanceof Response) return reason

      const userId = String(params['userId'])
      const target = room.participants.find((p) => p.userId === userId)
      /* ⚠️ Guessed wording — the route was not probed. */
      if (!target)
        return errorResponse(404, 'NOT_FOUND', 'Participant not found in this room')

      if (action === 'MUTE') target.isMuted = true
      if (action === 'UNMUTE') target.isMuted = false
      if (action === 'KICK' || action === 'BLOCK') {
        room.participants = room.participants.filter((p) => p.userId !== userId)
        if (action === 'BLOCK') room.blocks += 1
      }
      const entry = log(room, action, reason, { targetUserId: userId })
      return HttpResponse.json({
        success: true,
        message: `Participant moderation action '${action}' executed successfully`,
        data: { log: { id: entry.id, action, targetUserId: userId } },
      })
    },
  ),

  http.post(`${ROOMS}/:id/lockdown`, async ({ params, request }) => {
    const stop = await prelude()
    if (stop) return stop
    const room = liveTarget(String(params['id']))
    if (room instanceof Response) return room

    const body = await readBody(request)
    const reason = requireText(body, 'reason')
    if (reason instanceof Response) return reason
    const muteAllStage = body['muteAllStage'] === true
    const disableChat = body['disableChat'] === true
    const disableGifts = body['disableGifts'] === true

    if (muteAllStage) {
      for (const p of room.participants) if (p.seatSlot !== null) p.isMuted = true
    }
    if (disableChat) room.audioSettings = { ...room.audioSettings, allowChat: false }
    if (disableGifts) room.audioSettings = { ...room.audioSettings, allowGifts: false }

    log(room, 'STAGE_LOCKDOWN', reason, {
      /* Measured: the metadata repeats the reason beside the three switches. */
      metadata: { reason, disableChat, disableGifts, muteAllStage },
    })
    return HttpResponse.json({
      success: true,
      message: 'Emergency stage lockdown applied successfully',
      data: { log: { action: 'STAGE_LOCKDOWN', reason } },
    })
  }),

  http.post(`${ROOMS}/:id/chat/purge`, async ({ params, request }) => {
    const stop = await prelude()
    if (stop) return stop
    const room = liveTarget(String(params['id']))
    if (room instanceof Response) return room

    const reason = requireText(await readBody(request), 'reason')
    if (reason instanceof Response) return reason
    log(room, 'CHAT_PURGED', reason, {})
    return HttpResponse.json({
      success: true,
      message: 'Live room chat conversation purged successfully',
    })
  }),

  http.post(`${ROOMS}/:id/terminate`, async ({ params, request }) => {
    const stop = await prelude()
    if (stop) return stop
    const room = liveTarget(String(params['id']))
    if (room instanceof Response) return room

    const body = await readBody(request)
    const reason = requireText(body, 'reason')
    if (reason instanceof Response) return reason
    const suspendHost = body['suspendHost'] === true
    const freezeEarnings = body['freezeEarnings'] === true
    const endedAt = new Date().toISOString()

    room.status = 'ENDED'
    room.endedAt = endedAt
    room.participants = []
    room.currentViewers = 0
    room.isHostOnline = false
    if (suspendHost && room.host.liveHostProfile) {
      room.host.liveHostProfile = { ...room.host.liveHostProfile, status: 'SUSPENDED' }
    }
    const entry = log(room, 'TERMINATE', reason, {
      adminNotes: typeof body['adminNotes'] === 'string' ? body['adminNotes'] : null,
      /* Measured shape. */
      metadata: { suspendHost, terminatedAt: endedAt, freezeEarnings },
    })
    return HttpResponse.json({
      success: true,
      message: suspendHost
        ? 'Live room terminated and host account suspended successfully'
        : 'Live room terminated successfully',
      data: {
        room: { id: room.id, status: 'ENDED', endedAt },
        auditLog: { id: entry.id, action: 'TERMINATE', reason },
      },
    })
  }),
]
