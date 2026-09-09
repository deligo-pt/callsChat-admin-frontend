import { Check, ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { resolveStatus } from '@/lib/status'
import { FEEDBACK_PRIORITY_VALUES, type Feedback } from '@/types/feedback'

import { useFeedbackPriorityMutation } from '../useFeedback'

/**
 * Change urgency — `PATCH /:id` with `priority` and nothing else
 * (feedback_management_plan.md §5.6).
 *
 * **A plain menu, no confirmation dialog.** That is a deliberate asymmetry
 * with `StatusAction` beside it: changing a priority is reversible in one
 * click, private to staff, and invisible to the reporter. A confirm step here
 * would be ceremony, and ceremony spent on a harmless action is what teaches
 * an operator to click through the dialog that *does* matter.
 *
 * Optimistic UI is still refused. The mutation invalidates and refetches like
 * everything else in this module (§3.2) — the saving is a dialog, not the
 * re-read.
 *
 * ⚠️ The route also accepts `adminResponse`, and this control never sends it.
 * `POST /:id/reply` overwrites that field silently (§3.3), so the panel keeps
 * exactly one writer for it: the reply composer.
 */
export function PriorityAction({ ticket }: { ticket: Feedback }) {
  const mutation = useFeedbackPriorityMutation(ticket.id)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" disabled={mutation.isPending}>
          Change
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {FEEDBACK_PRIORITY_VALUES.map((priority) => {
          const current = priority === ticket.priority

          return (
            <DropdownMenuItem
              key={priority}
              /*
               * The current value stays in the list, unlike the status menu.
               * Priority is a scale rather than a state machine: seeing where
               * the ticket sits among the four is the point of opening the
               * menu, and re-selecting it is a no-op the API tolerates and
               * that writes nothing to any history.
               */
              onSelect={() => {
                if (!current) mutation.mutate(priority)
              }}
              disabled={current}
            >
              {current ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <span className="size-4" aria-hidden="true" />
              )}
              {resolveStatus('feedbackPriority', priority).label}
              {current ? <span className="sr-only"> (current)</span> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
