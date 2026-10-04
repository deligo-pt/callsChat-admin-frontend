import type { z } from 'zod'

import { apiClient } from '@/api/client'
import {
  announcementListResponseSchema,
  announcementResponseSchema,
  announcementStatsResponseSchema,
  mediaUploadResponseSchema,
  type Announcement,
  type AnnouncementListQuery,
  type AnnouncementStats,
  type AnnouncementUpdatePayload,
  type AnnouncementWritePayload,
  type MediaUpload,
} from '@/types/announcement'
import type { Pagination } from '@/types/common'

/**
 * Official Announcements API — the admin broadcast surface (plan.md §2.1).
 *
 * ⚠️ **Everything in this file is addressed to the entire userbase.** There is
 * no draft audience, no test segment and no recall: `broadcast.md` §2 has the
 * backend emit `announcement:new` across the global Socket.io cluster and fire
 * a notification toast the moment a record is published. Four rules hold
 * across this module:
 *
 * 1. **Nothing is painted from a write response.** The list is the only source
 *    of truth, because there is no `GET /admin/announcements/:id` to refetch a
 *    single record (plan.md §3.2) and the write shapes are unobserved.
 * 2. **The client routes under `/api/v1/announcements` are never called.**
 *    `broadcast.md` §3.4 has the detail route increment the global impression
 *    counter and write a read receipt for the caller, so an admin opening a
 *    draft would corrupt the one number this module reports.
 * 3. **Media uploads last, never first.** The route has no delete, so every
 *    accepted file is permanent (plan.md §3.4).
 * 4. **All four enum/boolean fields are sent on every write**, because the
 *    server's defaults have never been observed (plan.md §3.7). The payload
 *    type is what enforces it.
 *
 * In `api/` rather than `features/announcements/api.ts` because `/media/upload`
 * is not an announcements route at all — it is a shared platform endpoint that
 * this feature happens to be the second consumer of — and because
 * `eslint.config.js` forbids a sibling feature from importing `features/*`.
 */

/** One page of the queue, plus the counters beside it. */
export interface AnnouncementPage {
  readonly data: readonly Announcement[]
  readonly pagination: Pagination
}

/**
 * `GET /admin/announcements`.
 *
 * Returns the `{ success, data: [], pagination }` envelope — the **first** of
 * this backend's three list shapes. Verified 2026-10-04.
 *
 * ⚠️ Unlike `GET /admin/verifications`, **omitting `status` here does not
 * silently filter.** No default was observed narrowing the result, so the panel
 * may legitimately ask for every announcement by sending no status at all. That
 * is the opposite of the verifications route's behaviour, and the reason this
 * query type makes `status` optional where that one makes it required.
 *
 * ⚠️ `limit` is capped at 100 (`MAX_PAGE_SIZE`); 999 was rejected with
 * `Number must be less than or equal to 100`.
 */
export function fetchAnnouncements(
  query: AnnouncementListQuery = {},
  signal?: AbortSignal,
): Promise<AnnouncementPage> {
  return apiClient
    .get<z.infer<typeof announcementListResponseSchema>>('/admin/announcements', {
      params: {
        ...(query.page !== undefined ? { page: query.page } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.priority !== undefined ? { priority: query.priority } : {}),
        ...(query.targetAudience !== undefined
          ? { targetAudience: query.targetAudience }
          : {}),
        /*
         * ⚠️ Passed as a boolean on purpose, **not** pre-stringified.
         *
         * The service models this as an enum of the two string literals and
         * answers `Invalid enum value. Expected 'true' | 'false'` to anything
         * else. `buildUrl` in `api/client.ts` already does `String(value)`, so
         * a boolean arrives as exactly `true`/`false` and an explicit ternary
         * here is a no-op — proven by mutation-testing one: replacing it
         * changed no behaviour and failed no test, which is how a line that
         * looks load-bearing gets found out.
         *
         * The real hazard is one line up in `buildUrl`: it skips `undefined`,
         * `null` and `''`. `false` survives that filter today, and must — if it
         * were ever widened to skip falsy values, `isPinned=false` would vanish
         * from the query string and the filter would silently return everything.
         * `mockFidelity.test.ts` asserts the wire form for exactly that reason.
         */
        ...(query.isPinned !== undefined ? { isPinned: query.isPinned } : {}),
        ...(query.search ? { search: query.search } : {}),
      },
      schema: announcementListResponseSchema,
      resource: 'announcements',
      ...(signal ? { signal } : {}),
    })
    .then((response) => ({ data: response.data, pagination: response.pagination }))
}

/**
 * `GET /admin/announcements/stats`.
 *
 * Five platform-wide counters, verified 2026-10-04 against the live service
 * (which answered all zeroes — the table is empty).
 *
 * ⚠️ Takes no parameters and ignores every filter. The numbers describe the
 * platform, never the filtered queue, so a screen showing them beside a
 * filtered list must not imply otherwise.
 */
export function fetchAnnouncementStats(
  signal?: AbortSignal,
): Promise<AnnouncementStats> {
  return apiClient
    .get<z.infer<typeof announcementStatsResponseSchema>>(
      '/admin/announcements/stats',
      {
        schema: announcementStatsResponseSchema,
        resource: 'announcement-stats',
        ...(signal ? { signal } : {}),
      },
    )
    .then((response) => response.data)
}

/**
 * `POST /admin/announcements`.
 *
 * ⚠️ **With `status: 'PUBLISHED'` this reaches every user on the platform
 * before the response comes back.** `broadcast.md` §2 emits `announcement:new`
 * across the socket cluster and triggers an in-app toast on publish, and there
 * is no unsend. Callers confirm first, every time.
 *
 * ⚠️ The result is deliberately **not** cache-seeding material. Only
 * {@link fetchAnnouncements} draws a screen (§3.2).
 */
export function createAnnouncement(
  payload: AnnouncementWritePayload,
): Promise<Announcement> {
  return apiClient
    .post<z.infer<typeof announcementResponseSchema>>('/admin/announcements', {
      /* Spread as given — nothing is added behind the caller's back. */
      body: { ...payload },
      schema: announcementResponseSchema,
      resource: 'announcement-create',
    })
    .then((response) => response.data)
}

/**
 * `PATCH /admin/announcements/:id`.
 *
 * Every field is optional server-side: an empty `{}` passes validation and
 * reaches the record lookup, verified by a `404` rather than a `400`. The panel
 * still sends the four enum fields explicitly (plan.md §3.7).
 *
 * ⚠️ **A `PATCH` can publish.** Moving `status` from `DRAFT` to `PUBLISHED`
 * broadcasts exactly as a create does, so an edit form is not a safe surface by
 * virtue of being an edit.
 */
export function updateAnnouncement(
  id: string,
  payload: AnnouncementUpdatePayload,
): Promise<Announcement> {
  return apiClient
    .patch<z.infer<typeof announcementResponseSchema>>(
      `/admin/announcements/${encodeURIComponent(id)}`,
      {
        body: { ...payload },
        schema: announcementResponseSchema,
        resource: 'announcement-update',
      },
    )
    .then((response) => response.data)
}

/**
 * `POST /admin/announcements/:id/pin`.
 *
 * ⚠️ `isPinned` is **required** — an empty body answers
 * `body/isPinned Required`, verified. Despite `broadcast.md` §4 calling this a
 * toggle, the caller states the value it wants rather than asking for an
 * inversion, so a double-click cannot land in the opposite state from the one
 * the operator saw.
 *
 * `PATCH` also accepts `isPinned`, which makes two writers for one field. The
 * split is by gesture (plan.md §3.3): the queue's row toggle comes here, and
 * the editor sends `isPinned` inside its `PATCH`. They are never both in
 * flight for one row.
 */
export function setAnnouncementPin(
  id: string,
  isPinned: boolean,
): Promise<Announcement> {
  return apiClient
    .post<z.infer<typeof announcementResponseSchema>>(
      `/admin/announcements/${encodeURIComponent(id)}/pin`,
      {
        body: { isPinned },
        schema: announcementResponseSchema,
        resource: 'announcement-pin',
      },
    )
    .then((response) => response.data)
}

/**
 * `DELETE /admin/announcements/:id`.
 *
 * ⚠️ **Irreversible, and it destroys the media too.** `broadcast.md` §4 states
 * the handler cleans up the object from RustFS, and since `/media/upload` has
 * no delete route of its own, this is the *only* path that ever removes an
 * uploaded file (plan.md §3.4). Deleting a published announcement therefore
 * destroys bytes that cannot be recovered, for a message every user has
 * already received.
 *
 * Returns nothing useful; the caller refetches.
 */
export function deleteAnnouncement(id: string): Promise<void> {
  return apiClient
    .delete<unknown>(`/admin/announcements/${encodeURIComponent(id)}`, {
      resource: 'announcement-delete',
    })
    .then(() => undefined)
}

/**
 * `POST /api/v1/media/upload` — multipart, field name `file`.
 *
 * ⚠️ **A one-way door onto a public, unauthenticated CDN.** Verified
 * 2026-10-04: the route accepted a `text/plain` file, stored it, and served it
 * back from `https://media.callschat.com/...` with no credentials and full
 * byte-range support. There is **no delete endpoint** — `DELETE /media/...`
 * answers `ROUTE_NOT_FOUND` — so the only cleanup path in existence is deleting
 * the announcement the object ends up attached to.
 *
 * Two obligations on every caller, neither of which this function can enforce:
 *
 * 1. **Validate first** with `isAllowedAnnouncementMedia`. The server performs
 *    no MIME, extension or size check whatsoever (plan.md O1), so this is the
 *    only gate there is — and it is a UX gate, not a security one.
 * 2. **Call this last.** On commit, never on file selection, so an abandoned
 *    draft leaves no permanent public orphan.
 *
 * ⚠️ The field name is `file` per `broadcast.md` §4. The live service accepts
 * *any* field name — a part called `document` worked — but matching the
 * documented contract is free and that tolerance may not survive a backend
 * change. The same reasoning already applies to `uploadBrandLogo`.
 */
export function uploadAnnouncementMedia(file: File): Promise<MediaUpload> {
  const formData = new FormData()
  formData.append('file', file)

  return apiClient
    .postMultipart<z.infer<typeof mediaUploadResponseSchema>>(
      '/media/upload',
      formData,
      { schema: mediaUploadResponseSchema, resource: 'announcement-media' },
    )
    .then((response) => response.data)
}
