import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { queryKeys } from '@/api/queryKeys'
import {
  fetchVerification,
  fetchVerifications,
  submitVerificationDecision,
} from '@/api/verifications'
import type {
  VerificationDecisionPayload,
  VerificationListQuery,
} from '@/types/verification'

/**
 * Verification queries (plan.md §7, phase V1).
 *
 * Three rules, all inherited from §3 rather than chosen here:
 *
 * - **`staleTime: 0`.** A compliance queue is worked by more than one person,
 *   and a cached page would show an application as pending that a colleague
 *   decided a minute ago — so two officers would review the same identity
 *   document and the second would overwrite the first (§3.1, and there is no
 *   `If-Match` to stop them).
 * - **No mutation ever seeds this cache.** V4 invalidates
 *   `queryKeys.verifications.all` and refetches. The decision response carries
 *   three keys and describes none of what changed.
 * - **There is deliberately no document hook here.** Every fetch of the
 *   document route writes an audit row naming the acting admin and their IP, so
 *   a document must never be query data: a remount, a window refocus or a
 *   background refetch would each forge a record of a human opening a
 *   stranger's passport (§3.3). V3 fetches it imperatively, on a click.
 */

/**
 * The queue — `GET /admin/verifications`.
 *
 * `keepPreviousData` keeps the current page on screen while the next one loads.
 * Without it, paging or changing a filter blanks the table to a skeleton, which
 * reads as a broken page rather than a loading one.
 *
 * ⚠️ `query` always carries `status` — see `useVerificationListParams`. It is
 * part of the query key for the ordinary reason, and part of the request for a
 * much less ordinary one (§3.8).
 */
export function useVerificationListQuery(query: VerificationListQuery) {
  return useQuery({
    queryKey: queryKeys.verifications.list(query),
    queryFn: ({ signal }) => fetchVerifications(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
}

/**
 * One application — `GET /admin/verifications/:id`.
 *
 * Used by V2. It lives here rather than in the detail folder so the queue and
 * the application share one cache root, and so a decision in V4 can invalidate
 * both with a single key.
 */
export function useVerificationQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.verifications.detail(id ?? ''),
    queryFn: ({ signal }) => fetchVerification(id ?? '', signal),
    enabled: Boolean(id),
    staleTime: 0,
  })
}

/**
 * The decision — `PATCH /admin/verifications/:id/decision` (plan.md §7, V4).
 *
 * ⚠️ **The most consequential write in the panel.** It grants or withdraws a
 * real person's verified status, and it is **not one-way**: `APPROVED` is
 * documented *"Terminal state (Immutable)"* and a `REJECT` against an approved
 * application returns 200 and rejects it (§3.1). There is no `If-Match` and no
 * optimistic-concurrency check of any kind, so the last writer wins silently.
 *
 * Three rules, none of them stylistic:
 *
 * - **`retry: false`.** A blind retry of a decision is a second decision. Even
 *   where the end state would match, it appends another audit row claiming a
 *   human decided twice.
 * - **Nothing is seeded from the response.** It carries three keys —
 *   `{ id, status, reviewedAt }` — and describes none of what changed. A
 *   decision moves the applicant's account, the audit trail and the record
 *   together, so `GET /:id` draws the result and the mutation only confirms it.
 * - **`queryKeys.verifications.all` is invalidated**, not just the detail: a
 *   decision moves the application out of the pending queue the operator came
 *   from, and leaving that list cached would show it still waiting.
 */
export function useVerificationDecisionMutation(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: VerificationDecisionPayload) =>
      submitVerificationDecision(id, payload),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.verifications.all })
    },
    /*
     * `id` is in the key so a remounted page gets a fresh mutation rather than
     * one still holding the previous application's state — which here would mean
     * a pending-looking button for a decision already made about someone else.
     */
    mutationKey: [...queryKeys.verifications.detail(id), 'decision'],
  })
}
