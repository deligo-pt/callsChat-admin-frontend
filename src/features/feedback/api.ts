import type { z } from 'zod'

import { apiClient } from '@/api/client'
import type { ItemsPage, ListParams } from '@/types/common'
import {
  feedbackListResponseSchema,
  feedbackReplyResponseSchema,
  feedbackResponseSchema,
  feedbackStatsResponseSchema,
  type AssignFeedbackPayload,
  type Feedback,
  type FeedbackReply,
  type FeedbackStats,
  type ReplyFeedbackPayload,
  type TransitionFeedbackPayload,
  type UpdateFeedbackPayload,
} from '@/types/feedback'

/**
 * Feedback & Support API (feedback_management_plan.md §2.1).
 *
 * All seven routes sit behind
 * `[fastify.authenticate, verifyAdmin, requirePermission('FEEDBACK_MANAGEMENT')]`.
 * In practice that means **Super Admin only**, because the key cannot be
 * granted to anyone else (§3.1).
 *
 * Three rules hold across this file:
 *
 * 1. **No mutation response may be rendered or seed the cache.**
 *    `PATCH /:id/status` answers with one of two different shapes depending on
 *    which backend process handles it (§3.2), and the reply route answers with
 *    the base columns and no relations at all. Every mutation below returns
 *    what it returns so a caller can confirm success and read an id; callers
 *    invalidate and refetch for anything they intend to draw.
 * 2. **One route per intent.** `PATCH /admin/feedbacks/:id` also accepts
 *    `status` and `assignedAdminId` (§3.5), validated identically to the
 *    dedicated routes. The panel does not use it that way: three narrow
 *    mutations give three distinct toasts and three distinct error surfaces,
 *    where one wide one would give a failure message that could be about any
 *    of them.
 * 3. **Every response is contract-validated**, including the ones that are
 *    then discarded — a shape change on a write is exactly the thing that
 *    should surface as an error rather than as a screen quietly missing half
 *    its data.
 */

/* -------------------------------------------------------------------------
 * Reads
 * ---------------------------------------------------------------------- */

export interface FeedbackListParams extends ListParams {
  readonly page?: number | undefined
  readonly limit?: number | undefined
  /** `PENDING` · `REVIEWING` · `IN_PROGRESS` · `RESOLVED` · `CLOSED` · `REOPENED`. */
  readonly status?: string | undefined
  /** `BUG` · `IMPROVEMENT` · `REPORT` · `OTHER`. */
  readonly type?: string | undefined
  /** `LOW` · `MEDIUM` · `HIGH` · `CRITICAL`. */
  readonly priority?: string | undefined
  /**
   * A staff id.
   *
   * ⚠️ There is **no value meaning "unassigned"** — `null` is compared as the
   * literal string and returns nothing (feedback_management_plan.md §3.6). The
   * queue therefore does not offer that filter.
   */
  readonly assignedAdminId?: string | undefined
  /** Case-insensitive; matches subject, description and the reporter's email. */
  readonly search?: string | undefined
  /**
   * ISO date strings.
   *
   * ⚠️ **Not validated server-side** — `fromDate=notadate` answers 200 with the
   * filter silently dropped (§3.7). `listParams.ts` re-validates before a value
   * reaches this call, because a 200 is not proof the filter was applied.
   */
  readonly fromDate?: string | undefined
  readonly toDate?: string | undefined
  /** `createdAt` · `updatedAt` · `priority` · `status` — and honoured, verified. */
  readonly sortBy?: string | undefined
  readonly sortOrder?: 'asc' | 'desc' | undefined
}

/**
 * `GET /admin/feedbacks`.
 *
 * Returns the `{ data: { items, meta } }` envelope, not the project-standard
 * `{ data[], pagination }` — see `itemsEnvelopeSchema`.
 */
export function fetchFeedbackList(
  params: FeedbackListParams,
  signal?: AbortSignal,
): Promise<ItemsPage<Feedback>> {
  return apiClient
    .get<z.infer<typeof feedbackListResponseSchema>>('/admin/feedbacks', {
      params,
      schema: feedbackListResponseSchema,
      resource: 'feedback',
      ...(signal ? { signal } : {}),
    })
    .then((response) => response.data)
}

/**
 * `GET /admin/feedbacks/stats`.
 *
 * ⚠️ Global counters. The route takes no query parameters, so these describe
 * every ticket in the system and never the filtered queue.
 */
export function fetchFeedbackStats(signal?: AbortSignal): Promise<FeedbackStats> {
  return apiClient
    .get<z.infer<typeof feedbackStatsResponseSchema>>('/admin/feedbacks/stats', {
      schema: feedbackStatsResponseSchema,
      resource: 'feedback-stats',
      ...(signal ? { signal } : {}),
    })
    .then((response) => response.data)
}

/**
 * `GET /admin/feedbacks/:id`.
 *
 * The **only** shape a screen is drawn from. Stable across 10 of 10 calls,
 * with the reporter, the assigned staff member, every attachment, the whole
 * reply stream and the complete status history — unlike the write routes.
 */
export function fetchFeedbackTicket(
  id: string,
  signal?: AbortSignal,
): Promise<Feedback> {
  return apiClient
    .get<z.infer<typeof feedbackResponseSchema>>(`/admin/feedbacks/${id}`, {
      schema: feedbackResponseSchema,
      resource: 'feedback-ticket',
      ...(signal ? { signal } : {}),
    })
    .then((response) => response.data)
}

/* -------------------------------------------------------------------------
 * Writes
 * ---------------------------------------------------------------------- */

/**
 * `PATCH /admin/feedbacks/:id` — **priority only**.
 *
 * The route also accepts `adminResponse`, and the panel deliberately never
 * sends it: `POST /:id/reply` overwrites that field without saying so (§3.3),
 * so a second writer would silently destroy whichever wrote first. The reply
 * composer is the single writer.
 */
export function updateFeedbackPriority(
  id: string,
  payload: UpdateFeedbackPayload,
): Promise<Feedback> {
  return apiClient
    .patch<z.infer<typeof feedbackResponseSchema>>(`/admin/feedbacks/${id}`, {
      body: { priority: payload.priority },
      schema: feedbackResponseSchema,
      resource: 'feedback-ticket',
    })
    .then((response) => response.data)
}

/**
 * `PATCH /admin/feedbacks/:id/status`.
 *
 * ⚠️ The response is one of two shapes, non-deterministically (§3.2). It is
 * validated and returned for the caller's `id`, and must not be drawn.
 *
 * The server rejects an illegal move with a message naming the legal
 * successors, which the panel surfaces verbatim. It does **not** reject a
 * same-status move (§3.4) — `transitionsFor` is what prevents one.
 */
export function transitionFeedbackStatus(
  id: string,
  payload: TransitionFeedbackPayload,
): Promise<Feedback> {
  const note = payload.note?.trim()
  return apiClient
    .patch<z.infer<typeof feedbackResponseSchema>>(`/admin/feedbacks/${id}/status`, {
      body: {
        status: payload.status,
        /* Omitted rather than sent empty — the column is nullable. */
        ...(note ? { note } : {}),
      },
      schema: feedbackResponseSchema,
      resource: 'feedback-ticket',
    })
    .then((response) => response.data)
}

/**
 * `PATCH /admin/feedbacks/:id/assign`.
 *
 * ⚠️ `adminId` is required **even to unassign**: omitting the key answers
 * `400 body/adminId Required`, so `null` is sent explicitly rather than the
 * property being dropped. That is the opposite of this codebase's usual rule
 * for optional fields, and it is why this body is built literally.
 *
 * The server refuses a non-`ACTIVE` staff member with `400` and a non-staff id
 * with `404`; `useAssignableStaff` filters the candidate list so neither should
 * be reachable from the UI.
 */
export function assignFeedback(
  id: string,
  payload: AssignFeedbackPayload,
): Promise<Feedback> {
  return apiClient
    .patch<z.infer<typeof feedbackResponseSchema>>(`/admin/feedbacks/${id}/assign`, {
      body: { adminId: payload.adminId },
      schema: feedbackResponseSchema,
      resource: 'feedback-ticket',
    })
    .then((response) => response.data)
}

/**
 * `POST /admin/feedbacks/:id/reply`.
 *
 * Publishes text to a real person, immediately. There is no edit route and no
 * delete route.
 *
 * ⚠️ It also rewrites the ticket's `adminResponse` to this message (§3.3),
 * which is the second reason the caller must invalidate rather than append:
 * the field it changed is on screen and the operator did not knowingly edit it.
 */
export function replyToFeedback(
  id: string,
  payload: ReplyFeedbackPayload,
): Promise<FeedbackReply> {
  return apiClient
    .post<z.infer<typeof feedbackReplyResponseSchema>>(`/admin/feedbacks/${id}/reply`, {
      body: { message: payload.message },
      schema: feedbackReplyResponseSchema,
      resource: 'feedback-reply',
    })
    .then((response) => response.data.reply)
}
