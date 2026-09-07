import { ChevronDown } from 'lucide-react'
import { useRef, useState } from 'react'

import { ConfirmActionDialog, type ActionSeverity } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { resolveStatus } from '@/lib/status'
import {
  FEEDBACK_NOTE_MIN_LENGTH,
  type Feedback,
  type FeedbackStatus,
} from '@/types/feedback'

import { transitionsFor } from '../transitions'
import { useTransitionFeedbackMutation } from '../useFeedback'

/**
 * Move the ticket to another status — `PATCH /:id/status`
 * (feedback_management_plan.md §5.6).
 *
 * ⚠️ **The menu is `transitionsFor(current)`, never the six values and never
 * the current one.** That exclusion is not cosmetic: the API *accepts* a
 * same-status move and writes a `PENDING → PENDING` row into the audit trail
 * (§3.4), so the only thing standing between an operator and a junk history
 * row is this menu not offering the move.
 *
 * The note is required by the panel and optional to the server — and unlike
 * the staff module, where `reason` vanished into a write-only field
 * (staff_management_plan.md §3.6), **this one is readable afterwards**. It
 * lands in `statusHistory[].note` beside `changedBy`, which `HistoryCard`
 * renders. So the hint is allowed to promise a record, because there is one.
 */

/**
 * How consequential each destination is.
 *
 * `CLOSED` and `RESOLVED` are `warning` because both assert to a colleague —
 * and, through the queue's default filters, to everyone after them — that this
 * user's problem is dealt with. The rest are `info`: they move work along
 * without claiming anything about the outcome.
 */
function severityFor(status: FeedbackStatus): ActionSeverity {
  return status === 'CLOSED' || status === 'RESOLVED' ? 'warning' : 'info'
}

function effectFor(status: FeedbackStatus, reporter: string): string {
  switch (status) {
    case 'REVIEWING':
      return `This ticket is being read. ${reporter} is not notified of the change itself.`
    case 'IN_PROGRESS':
      return `This ticket is being worked on. ${reporter} is not notified of the change itself.`
    case 'RESOLVED':
      return `This marks ${reporter}'s problem as fixed. It stays open for them to reopen, and it leaves the default queue view.`
    case 'CLOSED':
      return `This ends work on ${reporter}'s ticket. It can be reopened later, but it will no longer appear as outstanding.`
    case 'REOPENED':
      return `This puts ${reporter}'s ticket back into the queue as unfinished work.`
    case 'PENDING':
      return `This returns the ticket to the untriaged queue, as if nobody had looked at it yet.`
  }
}

export function StatusAction({ ticket }: { ticket: Feedback }) {
  const [pending, setPending] = useState<FeedbackStatus | null>(null)
  const mutation = useTransitionFeedbackMutation(ticket.id)
  /*
   * ⚠️ Focus has to be sent back here by hand.
   *
   * `ConfirmActionDialog` uses `useReturnFocus`, which restores focus to
   * whatever held it when the dialog opened. That is correct everywhere else
   * in the panel, where a plain button opens the dialog — but this module is
   * the first to open it from a **menu item**, and by the time the dialog
   * closes that element has been unmounted with the menu. Focus then landed on
   * `document.body`, and a keyboard operator who cancelled lost their place on
   * the page entirely.
   */
  const triggerRef = useRef<HTMLButtonElement>(null)

  function closeDialog() {
    setPending(null)
    /*
     * Deferred a frame, deliberately.
     *
     * `ConfirmActionDialog` prevents Radix's default close-focus and calls
     * `useReturnFocus`, which restores focus to whatever held it when the
     * dialog opened — here, a menu item that has since been unmounted. That
     * restore runs *after* this handler, so focusing synchronously would be
     * immediately undone and focus would land on `document.body`.
     *
     * One frame later the dialog has gone and the restore has already failed
     * silently, so this is the last word on where focus ends up.
     */
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const options = transitionsFor(ticket.status)
  const reporter = ticket.user?.profile?.displayName ?? 'the reporter'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/*
           * Never disabled on an empty list, because there is no such state:
           * §2.5 guarantees every one of the six statuses has at least one
           * legal successor. `transitions.test.ts` asserts that there are no
           * dead ends, so an empty menu here would be a contract change rather
           * than a case to render.
           */}
          <Button ref={triggerRef} variant="secondary" size="sm">
            Move to…
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {options.map((status) => (
            <DropdownMenuItem key={status} onSelect={() => setPending(status)}>
              {resolveStatus('feedback', status).label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmActionDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
        title={pending ? `Move to ${resolveStatus('feedback', pending).label}` : ''}
        target={ticket.subject}
        effect={pending ? effectFor(pending, reporter) : ''}
        severity={pending ? severityFor(pending) : 'info'}
        confirmLabel={
          pending ? `Move to ${resolveStatus('feedback', pending).label}` : 'Confirm'
        }
        loading={mutation.isPending}
        /*
         * The truth about where the note goes, and it is a better truth than
         * the staff module could offer. Both halves matter: an operator who
         * thinks the note reaches the reporter writes something different from
         * one who knows it is an internal record.
         */
        reasonHint={`At least ${FEEDBACK_NOTE_MIN_LENGTH} characters. Recorded in this ticket's history against your name, and visible to other staff. It is not sent to ${reporter}.`}
        onConfirm={(note) => {
          if (!pending) return
          mutation.mutate({ status: pending, note }, { onSuccess: closeDialog })
        }}
      />
    </>
  )
}
