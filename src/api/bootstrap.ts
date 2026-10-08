import type { z } from 'zod'

import { apiClient } from '@/api/client'
import {
  bootstrapConfigResponseSchema,
  bootstrapUpdateResponseSchema,
  type BootstrapAppType,
  type BootstrapConfig,
  type BootstrapPlatform,
  type UpdateBootstrapPayload,
} from '@/types/bootstrap'

/**
 * Bootstrap Configuration API (plan.md §2.1).
 *
 * Two routes, both `verifyAdmin` + `SYSTEM_SETTINGS_EDIT` per the doc — the
 * permission half is unverified, because the only credential available is a
 * `SUPER_ADMIN`, which bypasses module permissions (plan.md §2.6, §8 R5).
 *
 * In `api/` rather than `features/settings/api.ts` because the maintenance
 * banner in `layouts/` may need to read this, and `eslint.config.js` forbids a
 * layout from importing a feature. Same reason `api/settings.ts` and
 * `api/staff.ts` live here.
 *
 * Three rules hold across this file:
 *
 * 1. **`platform` AND `appType` are always sent, on both routes.** They
 *    default **independently** and silently (plan.md §2.3): no parameters at
 *    all serves `ANDROID`/`PERSONAL`, `?platform=IOS` serves `IOS`/`PERSONAL`,
 *    `?appType=BUSINESS` serves `ANDROID`/`BUSINESS`. On the read route a
 *    missing key shows an operator a record they did not ask for; on the write
 *    route it edits one. `ANDROID`/`PERSONAL` is the live production record,
 *    so `appType` is the more dangerous of the two to omit (plan.md §2.5).
 * 2. **`features` and `blockedVersions` are sent whole or not at all.** The
 *    server replaces them; a partial send deletes the rest (plan.md §2.4).
 *    The payload type enforces this, and callers must not narrow it.
 * 3. **The update response is validated and then used only for
 *    `configVersion`.** It is not rendered and does not seed a cache — not
 *    because this response is unstable, but because `configVersion` is the
 *    only way to notice that somebody else wrote in between (plan.md §3.5),
 *    and the screen is redrawn from a refetch.
 */

/**
 * `GET /admin/bootstrap?platform=…&appType=…`.
 *
 * ⚠️ Both parameters are validated on **read** — `?platform=WEB` answers
 * `400 querystring/platform Invalid enum value` and `?appType=ENTERPRISE`
 * answers the equivalent for `appType` — but omitting either answers `200`
 * with a record the caller did not ask for. A bad value is rejected while a
 * missing one is not, which is why this call never relies on either default.
 */
export function fetchBootstrapConfig(
  platform: BootstrapPlatform,
  appType: BootstrapAppType,
  signal?: AbortSignal,
): Promise<BootstrapConfig> {
  return apiClient
    .get<z.infer<typeof bootstrapConfigResponseSchema>>('/admin/bootstrap', {
      params: { platform, appType },
      schema: bootstrapConfigResponseSchema,
      resource: 'bootstrap-config',
      ...(signal ? { signal } : {}),
    })
    .then((response) => response.data)
}

/**
 * `PATCH /admin/bootstrap`.
 *
 * ⚠️ Every successful call increments `configVersion`, including one that
 * changes nothing. There is no conditional write, no `If-Match` and no way to
 * say "only if it is still version 21" — two operators editing at once means
 * last write wins, silently (plan.md §3.5).
 *
 * ⚠️ **`PATCH {}` answers 200 and writes** (plan.md §2.5, verified 2026-10-08
 * — it moved the live `ANDROID/PERSONAL` record from version 70 to 71). An
 * empty body is not a no-op the server ignores; it is a no-op the server
 * *records*. `UpdateBootstrapPayload` requires both key fields so that body
 * cannot be constructed here.
 *
 * ⚠️ Three fields in this payload can stop the product. `maintenanceMode`
 * blacks out every mobile client, `forceUpdate` hard-blocks every one of them
 * behind an update wall, and `forceLogout` destroys every mobile session — and
 * the change is live on the public endpoint on the very next request. Nothing
 * in the API marks them as different from `minAndroidSdk`; the UI does
 * (plan.md §5.5).
 */
export function updateBootstrapConfig(
  payload: UpdateBootstrapPayload,
): Promise<BootstrapConfig> {
  return apiClient
    .patch<z.infer<typeof bootstrapUpdateResponseSchema>>('/admin/bootstrap', {
      /*
       * Spread as given. Unknown keys are silently dropped by the server
       * rather than rejected (plan.md §2.3), so a typo here would report
       * success and change nothing — the payload type is the only guard, and
       * nothing is added to the body behind the caller's back.
       */
      body: { ...payload },
      schema: bootstrapUpdateResponseSchema,
      resource: 'bootstrap-config',
    })
    .then((response) => response.data)
}
