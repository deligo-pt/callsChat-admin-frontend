import { type FeedbackStatus } from '@/types/feedback'

/**
 * The server's status transition matrix, as data
 * (feedback_management_plan.md §2.5).
 *
 * Every pair below was executed against the live API on 2026-09-06. The server
 * rejects anything outside it with a message that names the legal successors,
 * e.g.
 *
 *   Invalid status transition from 'CLOSED' to 'PENDING'. Allowed transitions: REOPENED.
 *
 * — which is good enough to render directly, so the panel does not paraphrase
 * it.
 */
const TRANSITIONS: Readonly<Record<FeedbackStatus, readonly FeedbackStatus[]>> = {
  PENDING: ['REVIEWING', 'IN_PROGRESS', 'CLOSED'],
  REVIEWING: ['IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED', 'REOPENED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'REVIEWING', 'RESOLVED', 'CLOSED'],
}

/**
 * Which statuses a ticket may move to from where it is now.
 *
 * ⚠️ **Never includes the current status**, and that omission is the whole
 * mitigation for feedback_management_plan.md §3.4: the live service *accepts*
 * a same-status transition — `{"status":"REOPENED"}` on a ticket already in
 * `REOPENED` answered `200` and appended a `REOPENED → REOPENED` row to the
 * audit trail — even though the documented matrix contains no self-pair. The
 * panel cannot reach that state because this function never offers it.
 *
 * The status control is built from this list rather than from
 * `FEEDBACK_STATUS_VALUES`. A `Select` over the six values would let an
 * operator pick any of them and would generate 400s for twenty-one of the
 * thirty pairs; a menu of legal successors cannot.
 */
export function transitionsFor(status: FeedbackStatus): readonly FeedbackStatus[] {
  return TRANSITIONS[status]
}

/**
 * Whether the server will accept this move.
 *
 * Deliberately answers `false` for `from === to`. See {@link transitionsFor} —
 * the server would answer `true`, and it is wrong.
 */
export function canTransition(from: FeedbackStatus, to: FeedbackStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * Whether entering this status is a closing act.
 *
 * Drives the severity of the confirmation dialog only. `RESOLVED` and `CLOSED`
 * are the two that end the reporter's wait — one claims the problem is fixed,
 * the other ends the conversation without claiming that — so both warrant a
 * heavier confirmation than moving a ticket between working states.
 */
export function isTerminatingStatus(status: FeedbackStatus): boolean {
  return status === 'RESOLVED' || status === 'CLOSED'
}
