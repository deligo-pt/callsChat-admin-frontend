import { useMutationState } from '@tanstack/react-query'

import { isAppError } from '@/api/errors'
import { queryKeys } from '@/api/queryKeys'
import { StatusBadge } from '@/components/display'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { TONE_CLASSES } from '@/lib/status'
import type { Feedback } from '@/types/feedback'

import { AssignAction } from './AssignAction'
import { PriorityAction } from './PriorityAction'
import { StatusAction } from './StatusAction'

/**
 * The three things an operator can change about a ticket
 * (feedback_management_plan.md §5.6).
 *
 * One card, three rows, each stating the **current value** beside the control
 * that changes it. That pairing is the point: a control alone would make an
 * operator open a menu to find out where the ticket stands.
 *
 * The three controls are deliberately **not** uniform. Status goes through
 * `ConfirmActionDialog` with a mandatory note, because it asserts something to
 * every colleague who sees the queue afterwards and it writes an audit row.
 * Priority and assignment are plain menus, because both are reversible in one
 * click and invisible to the reporter. Making all three ceremonious would
 * teach an operator to click through the one that matters.
 */

/**
 * Any of the three failing, surfaced once rather than three times.
 *
 * ⚠️ Read through `useMutationState`, **not** by calling the three mutation
 * hooks again here. `useMutation` returns a fresh observer per call site, so a
 * second `useTransitionFeedbackMutation(id)` in this component would watch a
 * mutation that never fires and report `error: null` forever while the dialog
 * inside `StatusAction` failed silently. The mutation *key* is the shared
 * identity; the hook instance is not.
 *
 * ⚠️ The filter is narrowed by a `predicate`, not by the shared prefix alone.
 * Every mutation on this ticket — **including the reply** — is keyed under the
 * same detail prefix, so a prefix-only filter put a failed reply into this
 * card's banner as well as into the composer's own error, showing one failure
 * twice under two different headings. Only the three triage kinds belong here.
 */
const TRIAGE_KINDS = ['status', 'priority', 'assign']

function useTriageError(ticket: Feedback): unknown {
  const prefix = queryKeys.feedback.detail(ticket.id)

  const errors = useMutationState({
    filters: {
      mutationKey: [...prefix],
      status: 'error',
      predicate: (mutation) => {
        const key = mutation.options.mutationKey
        return TRIAGE_KINDS.includes(String(key?.[key.length - 1]))
      },
    },
    select: (mutation) => mutation.state.error,
  })

  // The most recent failure; an older one is not what the operator just did.
  return errors.at(-1) ?? null
}

function TriageRow({
  label,
  value,
  action,
}: {
  label: string
  value: React.ReactNode
  action: React.ReactNode
}) {
  return (
    /*
     * Label + value on one line, the control on its own full-width line below
     * — always, not just below `md`.
     *
     * This card now lives in the detail page's 320px triage rail at `lg` and
     * up (design_improvement_plan.md), not just on a phone. The previous
     * layout put the control BESIDE the label+value in a `flex-wrap` row and
     * relied on the browser wrapping it below when the row ran out of room —
     * which the rail's ~270px content width does on every row. But a single
     * flex item alone on a wrapped line is not re-centered or re-justified by
     * `justify-between`; it just sits at the row's start. The result was a
     * small, left-stranded button — not full-width, not aligned to the row's
     * true right edge — which then threw off where its own dropdown opened
     * (`align="end"` anchors to wherever the button actually ended up).
     *
     * Stacking on purpose, unconditionally, removes the guesswork: the
     * control is always a deliberate full-width row, so its right edge is
     * always the row's real right edge, at every width — a phone, this rail,
     * or the plain full-width card below `lg`.
     */
    <div className="space-y-2 border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-caption text-foreground-muted">{label}</span>
        {value}
      </div>
      {/* `[&>*]:w-full` reaches the actual trigger button `action` renders,
          rather than setting width on this wrapper alone — a block wrapper
          being full-width does not itself stretch an inline-flex child. */}
      <div className="[&>*]:w-full">{action}</div>
    </div>
  )
}

export function TriageCard({ ticket }: { ticket: Feedback }) {
  /*
   * Shared across all three controls, which is why it is read here rather than
   * inside each one. TanStack keys these mutations per ticket, so the hooks
   * below observe the same instances the action components use.
   */
  const error = useTriageError(ticket)

  const assignee =
    ticket.assignedAdmin?.profile?.displayName ?? ticket.assignedAdmin?.email

  return (
    <Card>
      <CardHeader>
        <CardTitle>Triage</CardTitle>
        <CardDescription>
          Status changes are recorded in this ticket&rsquo;s history. Priority and
          assignment are not, and neither is visible to the reporter.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {error ? (
          /*
           * ⚠️ The server's own message, verbatim, and for one specific
           * reason: an illegal transition is rejected with a message that
           * *names the legal successors*. That is more useful than anything
           * the panel could write, and it is the authority on a rule the
           * client only mirrors.
           */
          <Alert variant="destructive">
            <AlertTitle>That change was not applied</AlertTitle>
            <AlertDescription>
              {isAppError(error)
                ? error.message
                : 'The change did not go through. The ticket is unchanged.'}
            </AlertDescription>
          </Alert>
        ) : null}

        <TriageRow
          label="Status"
          value={<StatusBadge domain="feedback" value={ticket.status} />}
          action={<StatusAction ticket={ticket} />}
        />

        <TriageRow
          label="Priority"
          value={<StatusBadge domain="feedbackPriority" value={ticket.priority} />}
          action={<PriorityAction ticket={ticket} />}
        />

        <TriageRow
          label="Assignee"
          value={
            assignee ? (
              <span className="truncate text-body">{assignee}</span>
            ) : (
              /*
               * Same treatment as the queue's column: `warning`, because an
               * unworked ticket is a debt to a waiting user — and built from
               * `TONE_CLASSES` rather than being a `StatusBadge`, since
               * "Unassigned" is the absence of a value and belongs to no
               * backend enum (§3.6).
               */
              <span
                className={cn(
                  'inline-flex items-center rounded-sm px-2 py-1 text-overline whitespace-nowrap uppercase',
                  TONE_CLASSES.warning,
                )}
              >
                Unassigned
              </span>
            )
          }
          action={<AssignAction ticket={ticket} />}
        />
      </CardContent>
    </Card>
  )
}
