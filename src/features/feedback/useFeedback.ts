import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { queryKeys } from '@/api/queryKeys'

import {
  assignFeedback,
  fetchFeedbackList,
  fetchFeedbackStats,
  fetchFeedbackTicket,
  replyToFeedback,
  transitionFeedbackStatus,
  updateFeedbackPriority,
  type FeedbackListParams,
} from './api'
import type { FeedbackPriority, TransitionFeedbackPayload } from '@/types/feedback'

/**
 * Feedback queries (feedback_management_plan.md §7, phase F1).
 *
 * Two rules, both inherited from §3 rather than chosen here:
 *
 * - **`staleTime: 0` everywhere.** A support queue is worked by several people
 *   at once. A cached page would show a ticket as unassigned that a colleague
 *   picked up thirty seconds ago, and the operator would reply into a
 *   conversation someone else is already having.
 * - **No mutation ever seeds this cache.** F3 and F4 invalidate
 *   `queryKeys.feedback.all` and refetch; they never write a mutation response
 *   into a query, because `PATCH /:id/status` returns one of two shapes
 *   non-deterministically (§3.2) and `POST /:id/reply` silently rewrites
 *   `adminResponse` (§3.3).
 */

/**
 * The queue — `GET /admin/feedbacks`.
 *
 * `keepPreviousData` keeps the current page on screen while the next one
 * loads. Without it, paging or changing a filter blanks the table to a
 * skeleton, which reads as a broken page rather than a loading one.
 */
export function useFeedbackListQuery(params: FeedbackListParams) {
  return useQuery({
    queryKey: queryKeys.feedback.list(params),
    queryFn: ({ signal }) => fetchFeedbackList(params, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
}

/**
 * The global counters — `GET /admin/feedbacks/stats`.
 *
 * ⚠️ **Not a filtered aggregate.** The route takes no query parameters, so
 * these numbers describe every ticket in the system no matter what the queue
 * below is filtered to. It is therefore keyed *without* the list params: a
 * key that varied with the filters would imply a relationship that does not
 * exist and would refetch an identical response on every filter change.
 *
 * `StatsStrip` says "All tickets" for the same reason.
 */
export function useFeedbackStatsQuery() {
  return useQuery({
    queryKey: queryKeys.feedback.stats(),
    queryFn: ({ signal }) => fetchFeedbackStats(signal),
    staleTime: 0,
  })
}

/**
 * One ticket — `GET /admin/feedbacks/:id`.
 *
 * **The only shape a screen is drawn from** (§3.2). It was stable across 10 of
 * 10 calls with the reporter, the assigned staff member, every attachment, the
 * whole reply stream and the complete status history — unlike
 * `PATCH /:id/status`, which returned two different shapes on 12 identical
 * consecutive requests.
 *
 * `retry: false` because a `404` is a real answer here, not a blip: tickets are
 * linked between colleagues and a stale bookmark is the likeliest way to reach
 * this route. Retrying it three times just delays the not-found page.
 */
export function useFeedbackTicketQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.feedback.detail(id),
    queryFn: ({ signal }) => fetchFeedbackTicket(id, signal),
    staleTime: 0,
    retry: false,
  })
}

/* -------------------------------------------------------------------------
 * Triage mutations (F3)
 *
 * All three share one shape, and it is not boilerplate caution — it is the
 * only safe reading of §3.2 and §3.3:
 *
 * - `retry: false`. None of these is idempotent in a way that survives a
 *   blind retry. A repeated transition would append a second history row; a
 *   repeated assign is harmless but a repeated *failure* should surface, not
 *   be swallowed by two silent attempts.
 * - `invalidateQueries` on `queryKeys.feedback.all`, so the queue, the stats
 *   and the ticket all re-read. A status change moves the ticket between two
 *   of the strip's six counts.
 * - **Nothing is seeded from the response.** `PATCH /:id/status` returned the
 *   full record on 2 of 12 identical consecutive requests and a 15-key record
 *   with no relations on the other 10 (§3.2). Writing either into the cache
 *   would blank the reporter, the attachments and the reply stream at random
 *   on a *successful* write. The mutation's return value exists to confirm
 *   success and read an id; the screen is drawn from `GET /:id`, which was
 *   stable across 10 of 10 calls.
 * ---------------------------------------------------------------------- */

function useTicketMutation<TInput>(
  id: string,
  mutationFn: (input: TInput) => Promise<unknown>,
  kind: string,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all })
    },
    // `id` is not read here; it is in the key so a remounted page gets a fresh
    // mutation rather than one still holding the previous ticket's state.
    mutationKey: [...queryKeys.feedback.detail(id), kind],
  })
}

/**
 * Move the ticket to another status — `PATCH /:id/status`.
 *
 * The server rejects an illegal move with a message naming the legal
 * successors, which the UI surfaces verbatim. It does **not** reject a
 * same-status move (§3.4) — `transitionsFor` is what prevents one, by never
 * offering the current status.
 */
export function useTransitionFeedbackMutation(id: string) {
  return useTicketMutation(
    id,
    (payload: TransitionFeedbackPayload) => transitionFeedbackStatus(id, payload),
    'status',
  )
}

/**
 * Change urgency — `PATCH /:id` with `priority` and nothing else.
 *
 * The route also accepts `adminResponse`, and the panel never sends it: the
 * reply composer is that field's single writer, because `POST /:id/reply`
 * overwrites it silently (§3.3).
 */
export function useFeedbackPriorityMutation(id: string) {
  return useTicketMutation(
    id,
    (priority: FeedbackPriority) => updateFeedbackPriority(id, { priority }),
    'priority',
  )
}

/**
 * Assign or unassign — `PATCH /:id/assign`.
 *
 * ⚠️ `adminId` is required **even to unassign**: omitting the key answers
 * `400 body/adminId Required`, so `null` is sent explicitly (§2.3). That is the
 * opposite of this codebase's usual rule for optional fields, which is why the
 * body is built literally in `api.ts` rather than spread conditionally.
 */
export function useAssignFeedbackMutation(id: string) {
  return useTicketMutation(
    id,
    (adminId: string | null) => assignFeedback(id, { adminId }),
    'assign',
  )
}

/**
 * Send a reply — `POST /:id/reply` (F4).
 *
 * The one write in this module that reaches a person rather than a record: it
 * publishes text to the reporter's phone, immediately, and there is no edit
 * route and no delete route.
 *
 * ⚠️ It also **silently rewrites the ticket's `adminResponse`** to this
 * message (§3.3). That is the second reason it invalidates rather than
 * appending the returned reply optimistically: the field it changed is on
 * screen, in `ReplyStream`'s out-of-band block, and the operator did not
 * knowingly edit it. An optimistic append would leave that block showing the
 * value the reply had just destroyed.
 *
 * `retry: false` is not a preference here. A retried POST that actually
 * succeeded the first time sends the reporter the same message twice, and the
 * route carries no idempotency key.
 */
export function useReplyMutation(id: string) {
  return useTicketMutation(
    id,
    (message: string) => replyToFeedback(id, { message }),
    'reply',
  )
}
