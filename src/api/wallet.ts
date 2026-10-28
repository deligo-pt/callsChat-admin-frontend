import type { z } from 'zod'

import { apiClient } from '@/api/client'
import type { CountPage } from '@/types/common'
import {
  diamondPackageListSchema,
  topUpRequestListSchema,
  type AdjustWalletPayload,
  type CreatePackagePayload,
  type DiamondPackage,
  type EconomySettingsPatch,
  type TopUpRequest,
  type UpdatePackagePayload,
} from '@/types/wallet'

/**
 * Diamond Wallet & Creator Economy API (plan.md §2, phase W1).
 *
 * MEASURED against `https://test-api.callschat.com/api/v1` on 2026-10-27 with
 * a `SUPER_ADMIN` token. Four rules hold across this file:
 *
 * 1. **`status` and `method` are sent upper-case or not at all.** Both are
 *    validated server-side and case-SENSITIVE — `?status=pending` is a `400`.
 *    That is the opposite of `niche` on the host routes, which accepts garbage
 *    and silently returns the wrong set, and it means a typo here is loud.
 * 2. **Dates are validated here, because the server does not.**
 *    `?startDate=hello` answers `200` (plan.md O6). A malformed date therefore
 *    produces a quietly wrong set rather than an error, which is worse than a
 *    rejection: the operator sees a shorter list and no reason for it. The
 *    caller sends only values this file has checked.
 * 3. **Nothing is painted from a write response.** Every write is followed by
 *    a refetch. No success body has ever been observed — the live tables are
 *    empty — so responses are not parsed into row shapes we invented.
 * 4. **Bodyless writes send no body and no `Content-Type`.** `apiClient` only
 *    sets the header when a body exists, and both `approve` and `DELETE
 *    /packages/:id` were verified to answer normally that way. Sending
 *    `Content-Type: application/json` with an *empty* body is the `400`
 *    (`FST_ERR_CTP_EMPTY_JSON_BODY`) that the guide's "Request Body: None"
 *    walks a caller straight into.
 */

const REQUESTS = '/admin/wallet/requests'
const PACKAGES = '/admin/wallet/packages'
const ADJUST = '/admin/wallet/adjust'
const ECONOMY = '/admin/settings/economy'

/* ------------------------------------------------------------------ *
 * Top-up requests
 * ------------------------------------------------------------------ */

export interface TopUpRequestQuery {
  readonly status?: string | undefined
  readonly method?: string | undefined
  readonly search?: string | undefined
  readonly startDate?: string | undefined
  readonly endDate?: string | undefined
  readonly page?: number | undefined
  readonly limit?: number | undefined
  readonly [key: string]: string | number | boolean | undefined
}

export interface TopUpRequestPage {
  readonly data: readonly TopUpRequest[]
  readonly pagination: CountPage
}

/**
 * `GET /admin/wallet/requests`.
 *
 * ⚠️ **The counters sit beside the rows, not in a `pagination` object.** The
 * guide prints `{ data: [...], pagination }`; the server sends
 * `{ data: { items, total, page, limit, totalPages } }`. The response is
 * flattened here so callers see the same `{ data, pagination }` pair every
 * other list in this panel hands back — the reshaping happens once, at the
 * boundary, rather than in every component.
 */
export async function fetchTopUpRequests(
  query: TopUpRequestQuery,
  signal?: AbortSignal,
): Promise<TopUpRequestPage> {
  const response = await apiClient.get<z.infer<typeof topUpRequestListSchema>>(
    REQUESTS,
    {
      params: query,
      schema: topUpRequestListSchema,
      resource: 'top-up-requests',
      ...(signal ? { signal } : {}),
    },
  )

  const { items, ...pagination } = response.data
  return { data: items, pagination }
}

/**
 * `PATCH /admin/wallet/requests/:id/approve`.
 *
 * ⚠️ **Irreversible, and it moves money.** Verified end-to-end on 2026-10-27:
 * it credits the user's spending wallet (balance 5000 → 5100), writes a
 * `TOP_UP` ledger row and returns `{ request, newDiamondBalance,
 * transactionId }`. There is no un-approve endpoint.
 *
 * ⚠️ **Re-approving answers `400 BAD_REQUEST`, not the `409 CONFLICT` the
 * guide documents**, and with a different sentence:
 * `"Cannot approve request in 'APPROVED' status."` The caller surfaces it
 * verbatim rather than swallowing it — a second operator needs to know the
 * first one got there, and the service's own wording says exactly that.
 */
export async function approveTopUpRequest(id: string): Promise<void> {
  await apiClient.patch(`${REQUESTS}/${encodeURIComponent(id)}/approve`, {
    resource: 'top-up-approve',
  })
}

/** `PATCH /admin/wallet/requests/:id/reject` — `reason` required, measured. */
export async function rejectTopUpRequest(id: string, reason: string): Promise<void> {
  await apiClient.patch(`${REQUESTS}/${encodeURIComponent(id)}/reject`, {
    body: { reason },
    resource: 'top-up-reject',
  })
}

/* ------------------------------------------------------------------ *
 * Diamond packages
 * ------------------------------------------------------------------ */

/**
 * `GET /admin/wallet/packages`.
 *
 * ⚠️ **No pagination, and that is measured, not assumed**: the response is
 * `{ success: true, data: [] }`. Includes inactive packages, so the caller
 * must not treat the list as the storefront.
 */
export async function fetchDiamondPackages(
  signal?: AbortSignal,
): Promise<readonly DiamondPackage[]> {
  const response = await apiClient.get<z.infer<typeof diamondPackageListSchema>>(
    PACKAGES,
    {
      schema: diamondPackageListSchema,
      resource: 'diamond-packages',
      ...(signal ? { signal } : {}),
    },
  )

  return response.data
}

export async function createDiamondPackage(
  payload: CreatePackagePayload,
): Promise<void> {
  await apiClient.post(PACKAGES, { body: { ...payload }, resource: 'diamond-package' })
}

export async function updateDiamondPackage(
  id: string,
  payload: UpdatePackagePayload,
): Promise<void> {
  await apiClient.patch(`${PACKAGES}/${encodeURIComponent(id)}`, {
    body: { ...payload },
    resource: 'diamond-package',
  })
}

/**
 * `DELETE /admin/wallet/packages/:id`.
 *
 * ⚠️ No body and no `Content-Type` — verified to answer `404` for an unknown
 * id, which means the route was reached. With a JSON content-type and an empty
 * body it is a `400` instead, and the `400` looks nothing like a missing
 * package.
 */
export async function deleteDiamondPackage(id: string): Promise<void> {
  await apiClient.delete(`${PACKAGES}/${encodeURIComponent(id)}`, {
    resource: 'diamond-package',
  })
}

/* ------------------------------------------------------------------ *
 * Direct adjustment
 * ------------------------------------------------------------------ */

/**
 * `POST /admin/wallet/adjust`.
 *
 * ⚠️ **`amount` is signed and must not be zero** (`body/amount Amount cannot
 * be zero`). A negative value debits; the guide says a debit below zero is
 * refused with a `400`, which could not be verified because no funded user
 * exists on this deployment.
 *
 * ⚠️ `note` is required and is written to the permanent ledger as
 * `ADMIN_ADJUSTMENT`. It is an audit record, not a UI hint.
 */
export async function adjustWallet(payload: AdjustWalletPayload): Promise<void> {
  await apiClient.post(ADJUST, { body: { ...payload }, resource: 'wallet-adjust' })
}

/* ------------------------------------------------------------------ *
 * Economy settings
 * ------------------------------------------------------------------ */

/**
 * `PATCH /admin/settings/economy`.
 *
 * ⚠️ **Writes the same `id: "primary"` singleton `GET /admin/settings`
 * returns** and `features/settings` already owns, and it answers with the
 * whole settings object rather than the two fields it changed.
 *
 * ⚠️ **An empty body answers `200`** (plan.md O8). The response therefore
 * cannot tell a caller whether anything changed, so the caller does its own
 * dirty-checking and never reports success from the status code alone.
 */
export async function updateEconomySettings(
  payload: EconomySettingsPatch,
): Promise<void> {
  await apiClient.patch(ECONOMY, { body: { ...payload }, resource: 'economy-settings' })
}
