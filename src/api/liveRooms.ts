import type { z } from 'zod'

import { apiClient } from '@/api/client'
import { bangladeshDayBounds } from '@/lib/datetime'
import type { Pagination } from '@/types/common'
import {
  isOneOf,
  LIVE_ROOM_TYPES,
  LIVE_SORTS,
  LIVE_STATUS_FILTERS,
  LIVE_TOPICS,
  liveAnalyticsEnvelopeSchema,
  liveRoomDetailEnvelopeSchema,
  liveRoomListSchema,
  liveWriteEnvelopeSchema,
  MAX_LIVE_LIMIT,
  PARTICIPANT_ACTIONS,
  reapResultEnvelopeSchema,
  stealthTokenEnvelopeSchema,
  VIOLATION_CODES,
  type LiveAnalytics,
  type LiveRoom,
  type LiveRoomDetail,
  type ParticipantAction,
  type StealthToken,
  type ViolationCode,
} from '@/types/liveRooms'

/**
 * Live stream management — `/admin/live/rooms/*` (plan.md §2, phase L0).
 *
 * ⚠️ **Strict validation, like the wallet ledger.** A lower-case enum, an
 * empty `status`, `limit` 0 or 101, `page` 0 — each is a `400
 * FST_ERR_VALIDATION`, measured. So every parameter is checked on the way
 * out and left off when it would not be accepted, rather than sent and
 * failing the whole page.
 *
 * ⚠️ **The two lists filter differently** (plan.md §2.2–2.3, L-B4): the live
 * list takes `type` and ignores dates; history takes dates and ignores
 * `status`, `sort`, `topic` and `type`. Each builder sends only what its
 * route reads.
 */

const ROOMS = '/admin/live/rooms'
const room = (id: string) => `${ROOMS}/${encodeURIComponent(id)}`

function positiveInt(value: number | string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined
  const number = typeof value === 'number' ? value : Number(value.trim())
  return Number.isInteger(number) && number >= 1 ? number : undefined
}

function trimmed(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}

function paging(
  query: { page?: number | string | undefined; limit?: number | string | undefined },
  params: Record<string, string | number>,
) {
  const page = positiveInt(query.page)
  if (page) params['page'] = page
  const limit = positiveInt(query.limit)
  if (limit) params['limit'] = Math.min(limit, MAX_LIVE_LIMIT)
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

export interface LiveRoomQuery {
  readonly status?: string | undefined
  readonly search?: string | undefined
  readonly topic?: string | undefined
  readonly type?: string | undefined
  /** ⚠️ Undocumented, measured to work. `search` does not match ids. */
  readonly hostId?: string | undefined
  readonly sort?: string | undefined
  readonly page?: number | string | undefined
  readonly limit?: number | string | undefined
}

export function liveRoomParams(query: LiveRoomQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  paging(query, params)

  const status = trimmed(query.status)?.toUpperCase()
  if (isOneOf(LIVE_STATUS_FILTERS, status)) params['status'] = status
  const search = trimmed(query.search)
  if (search) params['search'] = search
  const topic = trimmed(query.topic)?.toUpperCase()
  if (isOneOf(LIVE_TOPICS, topic)) params['topic'] = topic
  const type = trimmed(query.type)?.toUpperCase()
  if (isOneOf(LIVE_ROOM_TYPES, type)) params['type'] = type
  const hostId = trimmed(query.hostId)
  if (hostId) params['hostId'] = hostId
  const sort = trimmed(query.sort)?.toLowerCase()
  if (isOneOf(LIVE_SORTS, sort)) params['sort'] = sort

  return params
}

export interface LiveHistoryQuery {
  readonly search?: string | undefined
  readonly hostId?: string | undefined
  /** Bangladesh calendar days (`yyyy-MM-dd`) → UTC bounds. */
  readonly fromDate?: string | undefined
  readonly toDate?: string | undefined
  readonly page?: number | string | undefined
  readonly limit?: number | string | undefined
}

export function liveHistoryParams(
  query: LiveHistoryQuery,
): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  paging(query, params)

  const search = trimmed(query.search)
  if (search) params['search'] = search
  const hostId = trimmed(query.hostId)
  if (hostId) params['hostId'] = hostId
  const from = query.fromDate ? bangladeshDayBounds(query.fromDate.trim()) : null
  if (from) params['startDate'] = from.start
  const to = query.toDate ? bangladeshDayBounds(query.toDate.trim()) : null
  if (to) params['endDate'] = to.end

  return params
}

export interface LiveRoomPage {
  readonly data: readonly LiveRoom[]
  readonly pagination: Pagination
}

/** `GET /admin/live/rooms` — `status` defaults to `LIVE` server-side. */
export async function fetchLiveRooms(
  query: LiveRoomQuery,
  signal?: AbortSignal,
): Promise<LiveRoomPage> {
  const response = await apiClient.get<z.infer<typeof liveRoomListSchema>>(ROOMS, {
    params: liveRoomParams(query),
    schema: liveRoomListSchema,
    resource: 'live-rooms',
    ...(signal ? { signal } : {}),
  })
  return { data: response.data, pagination: response.pagination }
}

/** `GET /admin/live/rooms/history` — ended rooms, newest first. */
export async function fetchLiveRoomHistory(
  query: LiveHistoryQuery,
  signal?: AbortSignal,
): Promise<LiveRoomPage> {
  const response = await apiClient.get<z.infer<typeof liveRoomListSchema>>(
    `${ROOMS}/history`,
    {
      params: liveHistoryParams(query),
      schema: liveRoomListSchema,
      resource: 'live-room-history',
      ...(signal ? { signal } : {}),
    },
  )
  return { data: response.data, pagination: response.pagination }
}

/** `GET /admin/live/rooms/:id` — unknown id: `404 NOT_FOUND "Live room not found"`. */
export async function fetchLiveRoom(
  id: string,
  signal?: AbortSignal,
): Promise<LiveRoomDetail> {
  const response = await apiClient.get<z.infer<typeof liveRoomDetailEnvelopeSchema>>(
    room(id),
    {
      schema: liveRoomDetailEnvelopeSchema,
      resource: 'live-room',
      ...(signal ? { signal } : {}),
    },
  )
  return response.data
}

/** `GET /admin/live/rooms/analytics` — eight platform counters. */
export async function fetchLiveAnalytics(signal?: AbortSignal): Promise<LiveAnalytics> {
  const response = await apiClient.get<z.infer<typeof liveAnalyticsEnvelopeSchema>>(
    `${ROOMS}/analytics`,
    {
      schema: liveAnalyticsEnvelopeSchema,
      resource: 'live-analytics',
      ...(signal ? { signal } : {}),
    },
  )
  return response.data
}

/* ------------------------------------------------------------------ *
 * Writes — ⚠️ none probed (GET-only rule); bodies are the guide's, and
 * the audit trail on staging confirms what six of them record.
 * ------------------------------------------------------------------ */

/** The server's own sentence, for the success toast. */
async function write(path: string, body: unknown, resource: string): Promise<string> {
  const response = await apiClient.post<z.infer<typeof liveWriteEnvelopeSchema>>(path, {
    body,
    schema: liveWriteEnvelopeSchema,
    resource,
  })
  return response.message ?? ''
}

/**
 * `POST /:id/stealth-token` — a hidden, listen-only LiveKit grant. Super Admin
 * only in the panel (plan.md decision A).
 */
export async function issueStealthToken(id: string): Promise<StealthToken> {
  const response = await apiClient.post<z.infer<typeof stealthTokenEnvelopeSchema>>(
    `${room(id)}/stealth-token`,
    { schema: stealthTokenEnvelopeSchema, resource: 'live-stealth-token' },
  )
  return response.data
}

export interface WarnPayload {
  readonly message: string
  readonly violationCode: ViolationCode
  readonly adminNotes?: string | undefined
}

export function warnLiveRoom(id: string, payload: WarnPayload): Promise<string> {
  if (!isOneOf(VIOLATION_CODES, payload.violationCode)) {
    return Promise.reject(new Error('Unknown violation code.'))
  }
  return write(
    `${room(id)}/warn`,
    {
      message: payload.message,
      violationCode: payload.violationCode,
      ...(payload.adminNotes?.trim() ? { adminNotes: payload.adminNotes.trim() } : {}),
    },
    'live-warn',
  )
}

export function moderateParticipant(
  id: string,
  userId: string,
  payload: { readonly action: ParticipantAction; readonly reason: string },
): Promise<string> {
  if (!isOneOf(PARTICIPANT_ACTIONS, payload.action)) {
    return Promise.reject(new Error('Unknown participant action.'))
  }
  return write(
    `${room(id)}/participants/${encodeURIComponent(userId)}/moderate`,
    { action: payload.action, reason: payload.reason },
    'live-moderate',
  )
}

export interface LockdownPayload {
  readonly muteAllStage: boolean
  readonly disableChat: boolean
  readonly disableGifts: boolean
  readonly reason: string
}

export function lockdownLiveRoom(
  id: string,
  payload: LockdownPayload,
): Promise<string> {
  return write(`${room(id)}/lockdown`, { ...payload }, 'live-lockdown')
}

export function purgeLiveChat(id: string, reason: string): Promise<string> {
  return write(`${room(id)}/chat/purge`, { reason }, 'live-chat-purge')
}

export interface TerminatePayload {
  readonly reason: string
  readonly adminNotes?: string | undefined
  readonly suspendHost: boolean
  readonly freezeEarnings: boolean
}

export function terminateLiveRoom(
  id: string,
  payload: TerminatePayload,
): Promise<string> {
  return write(
    `${room(id)}/terminate`,
    {
      reason: payload.reason,
      suspendHost: payload.suspendHost,
      freezeEarnings: payload.freezeEarnings,
      ...(payload.adminNotes?.trim() ? { adminNotes: payload.adminNotes.trim() } : {}),
    },
    'live-terminate',
  )
}

/** `POST /reap-stale` — ends rooms whose host has been gone `staleMinutesThreshold` minutes. */
export async function reapStaleRooms(
  staleMinutesThreshold: number,
): Promise<{ message: string; reapedCount: number }> {
  const response = await apiClient.post<z.infer<typeof reapResultEnvelopeSchema>>(
    `${ROOMS}/reap-stale`,
    {
      body: { staleMinutesThreshold },
      schema: reapResultEnvelopeSchema,
      resource: 'live-reap-stale',
    },
  )
  return {
    message: response.message ?? '',
    reapedCount: response.data?.reapedCount ?? 0,
  }
}
