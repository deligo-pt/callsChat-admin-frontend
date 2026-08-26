import { apiClient, downloadFile } from '@/api/client'
import { envelopeSchema, paginatedSchema, type Paginated } from '@/types/common'
import {
  userDetailSchema,
  userSummarySchema,
  type AccountType,
  type UserDetail,
  type UserRole,
  type UserSummary,
} from '@/types/identity'

import type { UserListParams } from './listParams'

const userListSchema = paginatedSchema(userSummarySchema)

/**
 * `GET /admin/users` (plan.md §10.3).
 *
 * The response is contract-validated. A user list is not finance data, but it
 * is the first surface built against the verified contract and a silent shape
 * change here would propagate into every module that copies this pattern —
 * an explicit failure is cheaper to diagnose than a table of blank cells.
 */
export async function fetchUsers(
  params: UserListParams,
  signal?: AbortSignal,
): Promise<Paginated<UserSummary>> {
  /*
   * Undefined entries are dropped rather than passed through. The client would
   * skip them anyway, but under `exactOptionalPropertyTypes` an explicit
   * `search: undefined` is a different type from an absent key — and dropping
   * them here also keeps the query string free of empty parameters.
   */
  const query: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query[key] = value
  }

  return apiClient.get<Paginated<UserSummary>>('/admin/users', {
    params: query,
    schema: userListSchema,
    resource: 'users',
    ...(signal ? { signal } : {}),
  })
}

const userDetailEnvelope = envelopeSchema(userDetailSchema)

/**
 * `GET /admin/users/:id` (plan.md §10.3).
 *
 * The response is contract-validated. Its six groups map 1:1 onto the detail
 * tabs, so the screen binds straight to them with no client-side reshaping.
 */
export async function fetchUser(
  userId: string,
  signal?: AbortSignal,
): Promise<UserDetail> {
  const response = await apiClient.get<{ data: UserDetail }>(
    `/admin/users/${encodeURIComponent(userId)}`,
    {
      schema: userDetailEnvelope,
      resource: 'user',
      ...(signal ? { signal } : {}),
    },
  )
  return response.data
}

/**
 * `GET /admin/users/export` (plan.md §10.3).
 *
 * The export honours the SAME filters as the directory, so what downloads is
 * exactly what the operator is looking at. Passing the live filter set rather
 * than exporting everything is the difference between a useful export and a
 * 22,000-row file nobody asked for.
 *
 * ⚠️ The CSV contains **unmasked** phone numbers and email addresses. That is
 * the backend's decision, not something the client can soften — which is why
 * the action is permission-gated, confirmed, and audited.
 */
export async function exportUsers(
  params: UserListParams,
  format: 'csv' | 'json' = 'csv',
): Promise<void> {
  const query: Record<string, string | number | boolean> = { format }
  for (const [key, value] of Object.entries(params)) {
    // Paging is meaningless for an export — it returns the whole filtered set.
    if (key === 'page' || key === 'limit') continue
    if (value !== undefined && value !== '') query[key] = value
  }

  await downloadFile('/admin/users/export', {
    params: query,
    fallbackFilename: `users_export.${format}`,
  })
}

/** `POST /admin/users` — provisioning. */
export interface CreateUserPayload {
  readonly displayName: string
  readonly phone: string
  readonly email?: string
  readonly password?: string
  readonly role?: UserRole
  readonly accountType?: AccountType
  /** Only these two are accepted at creation time. */
  readonly status?: 'ACTIVE' | 'PENDING_VERIFICATION'
}

export async function createUser(payload: CreateUserPayload): Promise<void> {
  await apiClient.post<unknown>('/admin/users', { body: payload })
}
