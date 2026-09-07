import { Check, ChevronDown, UserMinus } from 'lucide-react'
import { useState } from 'react'

import { isAppError } from '@/api/errors'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/feedback'
import { resolveStatus } from '@/lib/status'
import type { Feedback } from '@/types/feedback'

import { useAssignableStaff } from '../useAssignableStaff'
import { useAssignFeedbackMutation } from '../useFeedback'

/**
 * Assign or unassign a ticket — `PATCH /:id/assign`
 * (feedback_management_plan.md §5.6, §3.11).
 *
 * **No confirmation dialog.** Assignment is reversible in one click and
 * private to staff, like priority beside it.
 *
 * Two things here are not ordinary combobox behaviour:
 *
 * 1. **Unassign is an explicit item that sends `{"adminId": null}`.** The key
 *    cannot be omitted — leaving it out answers `400 body/adminId Required`
 *    (§2.3), which is the opposite of this codebase's usual rule for optional
 *    fields. "None" is a value here, not an absence.
 * 2. **A failure to load the candidate list renders inline.** The list comes
 *    from `GET /admin/staff`, which is `verifySuperAdmin`-guarded and is the
 *    only source of candidates there is (§3.11). The day `FEEDBACK_MANAGEMENT`
 *    becomes grantable, an `ADMIN` opening this control gets a `403` from that
 *    call — and a ticket page that breaks because a dropdown could not
 *    populate would be a far worse outcome than a dropdown that explains
 *    itself.
 */
export function AssignAction({ ticket }: { ticket: Feedback }) {
  const [open, setOpen] = useState(false)
  const candidates = useAssignableStaff()
  const mutation = useAssignFeedbackMutation(ticket.id)

  function apply(adminId: string | null) {
    mutation.mutate(adminId, { onSuccess: () => setOpen(false) })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          disabled={mutation.isPending}
          aria-label="Assign this ticket"
        >
          {ticket.assignedAdminId ? 'Reassign…' : 'Assign…'}
          <ChevronDown aria-hidden="true" />
        </Button>
      </PopoverTrigger>

      {/*
       * `aria-label` because Radix's `PopoverContent` renders `role="dialog"`,
       * and an unnamed dialog is a `serious` axe violation: a screen-reader
       * user is told they have entered a dialog and not what it is for.
       */}
      <PopoverContent
        align="end"
        className="w-72 p-0"
        aria-label="Assign this ticket to a staff member"
      >
        {candidates.isPending ? (
          <div className="flex items-center gap-2 p-4 text-body text-foreground-muted">
            <Spinner />
            Loading staff…
          </div>
        ) : candidates.isError ? (
          /*
           * Inline, and specific about *which* read failed. An operator told
           * only "something went wrong" on a ticket page has no way to know
           * the ticket itself loaded perfectly well.
           */
          <div className="space-y-2 p-4">
            <p className="text-body-strong">Staff list unavailable</p>
            <p className="text-caption text-foreground-muted">
              {isAppError(candidates.error)
                ? candidates.error.message
                : 'The list of people this ticket could be assigned to did not load.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void candidates.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="Search staff…" />
            <CommandList>
              <CommandEmpty>No matching staff member.</CommandEmpty>

              <CommandGroup heading="Active staff">
                {candidates.data.map((member) => {
                  const current = member.id === ticket.assignedAdminId

                  return (
                    <CommandItem
                      key={member.id}
                      value={`${member.displayName} ${member.username} ${member.email}`}
                      onSelect={() => {
                        if (!current) apply(member.id)
                      }}
                    >
                      {current ? (
                        <Check className="size-4" aria-hidden="true" />
                      ) : (
                        <span className="size-4" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {member.displayName}
                      </span>
                      <span className="text-caption text-foreground-muted">
                        {resolveStatus('staffRole', member.role).label}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>

              {ticket.assignedAdminId ? (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="unassign"
                      onSelect={() => apply(null)}
                      className="text-danger-foreground"
                    >
                      <UserMinus className="size-4" aria-hidden="true" />
                      Unassign
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
