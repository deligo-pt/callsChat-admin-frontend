import type { z } from 'zod'

import { apiClient } from '@/api/client'
import type { Pagination } from '@/types/common'
import {
  hostApplicationDetailSchema,
  hostApplicationListSchema,
  hostApplicationStatsSchema,
  liveHostListSchema,
  type HostApplication,
  type HostApplicationStats,
  type HostStatusPayload,
  type LiveHost,
  type ReviewPayload,
} from '@/types/hosts'

/**
 * Host Application Management API (plan.md §2).
 *
 * VALIDATED against `https://test-api.callschat.com/api/v1` on 2026-10-15 with
 * a `SUPER_ADMIN` token. Four rules hold across this file:
 *
 * 1. **`status` is sent upper-case or not at all.** The service is
 *    case-SENSITIVE here — `?status=pending` is a `400` — unlike the bootstrap
 *    enums, which accept four spellings each (plan.md §3.1).
 * 2. **`niche` is never trusted to validate server-side.** `?niche=GARBAGE`
 *    answers `200` (plan.md §3.2), so a typo returns the wrong set rather than
 *    an error. The caller sends only values from a closed list.
 * 3. **Nothing is painted from a write response.** Both writes are followed by
 *    a refetch. Their success shapes have never been observed — the live table
 *    is empty (plan.md §2.1) — so the response is validated as an envelope and
 *    otherwise unused.
 * 4. **The legacy alias is never called.** The doc advertises
 *    `/api/v1/live/host/admin/*` as a backward-compatible mount; it answers
 *    **404** on this deployment (plan.md §3.4).
 *
 * In `api/` rather than `features/hosts/api.ts` to match `api/announcements.ts`
 * and `api/bootstrap.ts`: `eslint.config.js` forbids a layout from importing a
 * feature, and the dashboard may want the stats counters.
 */

const APPLICATIONS = '/admin/live/host-applications'
const HOSTS = '/admin/live/hosts'

/**
 * Both 404s on these routes append `" not found"` to a label that already ends
 * in it:
 *
 *   - `"Host application not found"` + `" not found"`
 *   - `"Live host profile not found for this user"` + `" not found"`
 *
 * ⚠️ The duplication is **not adjacent in the second case**, which is what a
 * naive `/not found not found$/` misses — it repairs the application message
 * and silently leaves the host one doubled. So the rule is: drop one trailing
 * `" not found"` when what remains still says `not found`, and finish the
 * sentence.
 *
 * Reproduced verbatim in the mock so the backend defect stays visible, and
 * repaired here so it can never reach an operator.
 */
export function repairNotFoundMessage(message: string): string {
  const trimmed = message.trim()
  const withoutSuffix = trimmed.replace(/\s+not found$/i, '')

  if (withoutSuffix === trimmed || !/not found/i.test(withoutSuffix)) {
    return message
  }

  return `${withoutSuffix}.`
}

/* ------------------------------------------------------------------ *
 * Applications
 * ------------------------------------------------------------------ */

export interface HostApplicationQuery {
  readonly status?: string | undefined
  readonly niche?: string | undefined
  readonly search?: string | undefined
  readonly startDate?: string | undefined
  readonly endDate?: string | undefined
  readonly page?: number | undefined
  readonly limit?: number | undefined
  readonly [key: string]: string | number | boolean | undefined
}

export interface HostApplicationPage {
  readonly data: readonly HostApplication[]
  readonly pagination: Pagination
}

/**
 * `GET /admin/live/host-applications`.
 *
 * ⚠️ Every bound below is enforced and was measured: `limit` 1–100, `page` ≥ 1,
 * `status` one of three upper-case values, `startDate`/`endDate` parseable as
 * datetimes (`YYYY-MM-DD` is accepted; `13-10-2026` is a `400`).
 *
 * ⚠️ **Returns an empty page on the live service today** — zero applications
 * exist (plan.md §2.1). Callers must treat the empty state as the normal case,
 * not the edge case.
 */
export async function fetchHostApplications(
  query: HostApplicationQuery,
  signal?: AbortSignal,
): Promise<HostApplicationPage> {
  const response = await apiClient.get<z.infer<typeof hostApplicationListSchema>>(
    APPLICATIONS,
    {
      params: query,
      schema: hostApplicationListSchema,
      resource: 'host-applications',
      ...(signal ? { signal } : {}),
    },
  )

  return { data: response.data, pagination: response.pagination }
}

/**
 * `GET /admin/live/host-applications/:id`.
 *
 * An unknown id answers `404 Host application not found not found` — see
 * `repairNotFoundMessage`. A malformed id answers the same 404 rather than a
 * 400, so the panel cannot distinguish "wrong shape" from "gone".
 */
export async function fetchHostApplication(
  id: string,
  signal?: AbortSignal,
): Promise<HostApplication> {
  const response = await apiClient.get<z.infer<typeof hostApplicationDetailSchema>>(
    `${APPLICATIONS}/${encodeURIComponent(id)}`,
    {
      schema: hostApplicationDetailSchema,
      resource: 'host-application',
      ...(signal ? { signal } : {}),
    },
  )

  return response.data
}

/** `GET /admin/live/host-applications/stats` — six counters, all zero today. */
export async function fetchHostApplicationStats(
  signal?: AbortSignal,
): Promise<HostApplicationStats> {
  const response = await apiClient.get<z.infer<typeof hostApplicationStatsSchema>>(
    `${APPLICATIONS}/stats`,
    {
      schema: hostApplicationStatsSchema,
      resource: 'host-application-stats',
      ...(signal ? { signal } : {}),
    },
  )

  return response.data
}

/**
 * `POST /admin/live/host-applications/:id/review`.
 *
 * ⚠️ **`APPROVE` is irreversible from this panel.** It creates or activates the
 * applicant's `LiveHostProfile`, emits `host:application_reviewed` over
 * Socket.io, and fires an in-app plus FCM push notification. There is no
 * un-approve endpoint. Callers confirm before invoking.
 *
 * ⚠️ `REJECT` requires a reason of **at least 5 characters**, verified: a
 * 4-character reason is rejected with
 * `body/rejectionReason A rejection reason of at least 5 characters is required
 * when rejecting an application`. `ReviewPayload` is a discriminated union so
 * the compiler refuses the body the server would.
 *
 * ⚠️ The response shape has never been observed, so it is parsed only as an
 * envelope and the caller refetches rather than painting from it.
 */
export async function reviewHostApplication(
  id: string,
  payload: ReviewPayload,
): Promise<void> {
  await apiClient.post(`${APPLICATIONS}/${encodeURIComponent(id)}/review`, {
    body: { ...payload },
    resource: 'host-application-review',
  })
}

/* ------------------------------------------------------------------ *
 * Hosts
 * ------------------------------------------------------------------ */

export interface LiveHostQuery {
  readonly status?: string | undefined
  readonly search?: string | undefined
  readonly page?: number | undefined
  readonly limit?: number | undefined
  readonly [key: string]: string | number | boolean | undefined
}

export interface LiveHostPage {
  readonly data: readonly LiveHost[]
  readonly pagination: Pagination
}

/** `GET /admin/live/hosts`. Empty on the live service today (plan.md §2.1). */
export async function fetchLiveHosts(
  query: LiveHostQuery,
  signal?: AbortSignal,
): Promise<LiveHostPage> {
  const response = await apiClient.get<z.infer<typeof liveHostListSchema>>(HOSTS, {
    params: query,
    schema: liveHostListSchema,
    resource: 'live-hosts',
    ...(signal ? { signal } : {}),
  })

  return { data: response.data, pagination: response.pagination }
}

/**
 * `PATCH /admin/live/hosts/:userId/status`.
 *
 * ⚠️ **Keyed on `userId`, not on the host profile's own `id`.** Both appear on
 * every roster row and they are different values; sending the profile id
 * answers `404 Live host profile not found for this user not found`, which
 * reads like the host is gone rather than like the caller used the wrong key.
 *
 * ⚠️ **Suspending a live host tears down their running room.** The backend ends
 * the `LiveRoom`, evicts every viewer and broadcasts `live:room_ended` (doc
 * §5.2). The panel cannot see rooms, so it can state this but never confirm it
 * (plan.md O6).
 *
 * ⚠️ `reason` is required for **`BANNED` as well as `SUSPENDED`** — a fact the
 * doc never states and `HostStatusPayload` encodes.
 */
export async function setLiveHostStatus(
  userId: string,
  payload: HostStatusPayload,
): Promise<void> {
  await apiClient.patch(`${HOSTS}/${encodeURIComponent(userId)}/status`, {
    body: { ...payload },
    resource: 'live-host-status',
  })
}
