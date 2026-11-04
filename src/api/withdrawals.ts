import type { z } from 'zod'

import { apiClient } from '@/api/client'
import { bangladeshDayBounds } from '@/lib/datetime'
import type { Pagination } from '@/types/common'
import {
  isWithdrawalStatus,
  MAX_WITHDRAWAL_LIMIT,
  WITHDRAWAL_SORTS,
  withdrawalDetailEnvelopeSchema,
  withdrawalListSchema,
  withdrawalSettingsEnvelopeSchema,
  withdrawalStatsEnvelopeSchema,
  withdrawalWriteEnvelopeSchema,
  type Withdrawal,
  type WithdrawalDetail,
  type WithdrawalSettings,
  type WithdrawalSettingsPatch,
  type WithdrawalSort,
  type WithdrawalStats,
} from '@/types/withdrawals'

/**
 * Host withdrawals — admin side (plan.md §0, phase W0).
 *
 * Every query value is checked on the way out: an unknown `status` or
 * `sortBy`, or `limit` over 100, is a `400` for the whole page (measured).
 *
 * ⚠️ No `Idempotency-Key` header: the API's CORS policy does not allow it, so
 * the browser would refuse the request. Repeats are safe anyway — the server
 * only moves a request out of the state it is in, so a second approve fails.
 */

const BASE = '/admin/withdrawals'
const one = (id: string) => `${BASE}/${encodeURIComponent(id)}`

export interface WithdrawalQuery {
  readonly status?: string | undefined
  readonly search?: string | undefined
  readonly userId?: string | undefined
  /** Bangladesh calendar days (`yyyy-MM-dd`). */
  readonly fromDate?: string | undefined
  readonly toDate?: string | undefined
  readonly sortBy?: WithdrawalSort | undefined
  readonly sortOrder?: 'asc' | 'desc' | undefined
  readonly page?: number | undefined
  readonly limit?: number | undefined
}

export function withdrawalParams(
  query: WithdrawalQuery,
): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  if (query.page && Number.isInteger(query.page) && query.page > 1)
    params['page'] = query.page
  if (query.limit && Number.isInteger(query.limit) && query.limit > 0) {
    params['limit'] = Math.min(query.limit, MAX_WITHDRAWAL_LIMIT)
  }
  if (isWithdrawalStatus(query.status)) params['status'] = query.status
  const search = query.search?.trim()
  if (search) params['search'] = search
  const userId = query.userId?.trim()
  if (userId) params['userId'] = userId
  const from = query.fromDate ? bangladeshDayBounds(query.fromDate) : null
  if (from) params['startDate'] = from.start
  const to = query.toDate ? bangladeshDayBounds(query.toDate) : null
  if (to) params['endDate'] = to.end
  if (query.sortBy && (WITHDRAWAL_SORTS as readonly string[]).includes(query.sortBy)) {
    if (query.sortBy !== 'createdAt') params['sortBy'] = query.sortBy
  }
  if (query.sortOrder === 'asc') params['sortOrder'] = 'asc'
  return params
}

export interface WithdrawalPage {
  readonly data: readonly Withdrawal[]
  readonly pagination: Pagination
}

export async function fetchWithdrawals(
  query: WithdrawalQuery,
  signal?: AbortSignal,
): Promise<WithdrawalPage> {
  const response = await apiClient.get<z.infer<typeof withdrawalListSchema>>(BASE, {
    params: withdrawalParams(query),
    schema: withdrawalListSchema,
    resource: 'withdrawals',
    ...(signal ? { signal } : {}),
  })
  return { data: response.data, pagination: response.pagination }
}

/** Unknown id: `404 NOT_FOUND "Withdrawal request not found"`. */
export async function fetchWithdrawal(
  id: string,
  signal?: AbortSignal,
): Promise<WithdrawalDetail> {
  const response = await apiClient.get<z.infer<typeof withdrawalDetailEnvelopeSchema>>(
    one(id),
    {
      schema: withdrawalDetailEnvelopeSchema,
      resource: 'withdrawal',
      ...(signal ? { signal } : {}),
    },
  )
  return response.data
}

/** Platform-wide counters; takes no filters. */
export async function fetchWithdrawalStats(
  signal?: AbortSignal,
): Promise<WithdrawalStats> {
  const response = await apiClient.get<z.infer<typeof withdrawalStatsEnvelopeSchema>>(
    `${BASE}/stats`,
    {
      schema: withdrawalStatsEnvelopeSchema,
      resource: 'withdrawal-stats',
      ...(signal ? { signal } : {}),
    },
  )
  return response.data
}

async function write(path: string, body: object, resource: string): Promise<string> {
  const response = await apiClient.patch<z.infer<typeof withdrawalWriteEnvelopeSchema>>(
    path,
    { body, schema: withdrawalWriteEnvelopeSchema, resource },
  )
  return response.message ?? ''
}

function note(value: string | undefined) {
  const text = value?.trim()
  return text ? { adminNote: text } : {}
}

/**
 * `PATCH /:id/approve` — PENDING → APPROVED.
 * ⚠️ Sent with `{}`: a JSON content type with an empty body is a 400.
 */
export function approveWithdrawal(id: string): Promise<string> {
  return write(`${one(id)}/approve`, {}, 'withdrawal-approve')
}

/** `PATCH /:id/reject` — PENDING or APPROVED → REJECTED; the diamonds go back. */
export function rejectWithdrawal(
  id: string,
  payload: { readonly rejectReason: string; readonly adminNote?: string },
): Promise<string> {
  return write(
    `${one(id)}/reject`,
    { rejectReason: payload.rejectReason.trim(), ...note(payload.adminNote) },
    'withdrawal-reject',
  )
}

/** `PATCH /:id/mark-paid` — APPROVED → PAID with the external TrxID. */
export function markWithdrawalPaid(
  id: string,
  payload: { readonly transactionRef: string; readonly adminNote?: string },
): Promise<string> {
  return write(
    `${one(id)}/mark-paid`,
    { transactionRef: payload.transactionRef.trim(), ...note(payload.adminNote) },
    'withdrawal-mark-paid',
  )
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

const SETTINGS = '/admin/withdrawal-settings'

export async function fetchWithdrawalSettings(
  signal?: AbortSignal,
): Promise<WithdrawalSettings> {
  const response = await apiClient.get<
    z.infer<typeof withdrawalSettingsEnvelopeSchema>
  >(SETTINGS, {
    schema: withdrawalSettingsEnvelopeSchema,
    resource: 'withdrawal-settings',
    ...(signal ? { signal } : {}),
  })
  return response.data
}

/**
 * `PUT` with only the changed fields — the server merges a partial body.
 * ⚠️ The response was not measured (writes to these settings are platform-
 * wide), so only `message` is read and the caller refetches.
 */
export async function updateWithdrawalSettings(
  patch: WithdrawalSettingsPatch,
): Promise<string> {
  const response = await apiClient.put<z.infer<typeof withdrawalWriteEnvelopeSchema>>(
    SETTINGS,
    {
      body: patch,
      schema: withdrawalWriteEnvelopeSchema,
      resource: 'withdrawal-settings-update',
    },
  )
  return response.message ?? ''
}
