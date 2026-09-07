import type { AdminColumn } from '@/components/data'
import { DateTime, StatusBadge } from '@/components/display'
import type { Feedback } from '@/types/feedback'

import { ActivityCell, AssigneeCell, ReporterCell, SubjectCell } from './cells'

/**
 * Columns for the feedback queue (feedback_management_plan.md §5.3).
 *
 * plan.md §1C: ONE definition drives both renderers — `DataTable` at `lg` and
 * above, `RecordCardList` below it.
 *
 * ⚠️ **Four columns are sortable, and they are the API's four exactly**:
 * `createdAt`, `updatedAt`, `priority`, `status` (§2.4). That list is not a
 * guess — `sortBy` is validated strictly here and an unknown field is a `400`
 * naming the legal ones, so a drift would surface immediately rather than
 * silently.
 *
 * This is the opposite situation from the staff directory, where no column is
 * sortable because `/admin/staff` accepts `sortBy` and ignores it. Here the
 * rows genuinely reorder, verified live in both directions.
 *
 * ⚠️ And the enum sorts run in **declaration order, not alphabetical**:
 * `priority` ascending means `LOW → CRITICAL`, so "ascending" reads as *least
 * urgent first*. That is what an operator expects and the opposite of a naive
 * string sort, which is why `FEEDBACK_PRIORITY_VALUES` is declared in the
 * server's order and not sorted for tidiness.
 */
export const feedbackColumns: readonly AdminColumn<Feedback>[] = [
  {
    id: 'subject',
    header: 'Ticket',
    card: 'title',
    sticky: true,
    width: '20rem',
    cell: (ticket) => <SubjectCell ticket={ticket} />,
  },
  {
    id: 'status',
    header: 'Status',
    card: 'status',
    sortable: true,
    cell: (ticket) => <StatusBadge domain="feedback" value={ticket.status} />,
  },
  {
    id: 'priority',
    header: 'Priority',
    card: 'meta',
    sortable: true,
    cell: (ticket) => <StatusBadge domain="feedbackPriority" value={ticket.priority} />,
  },
  {
    id: 'reporter',
    header: 'Reporter',
    card: 'meta',
    width: '13rem',
    cell: (ticket) => <ReporterCell ticket={ticket} />,
  },
  {
    id: 'assignee',
    header: 'Assignee',
    card: 'meta',
    width: '11rem',
    cell: (ticket) => <AssigneeCell ticket={ticket} />,
  },
  {
    id: 'activity',
    header: 'Activity',
    card: 'meta',
    width: '8rem',
    cell: (ticket) => <ActivityCell ticket={ticket} />,
  },
  {
    id: 'updatedAt',
    header: 'Updated',
    card: 'meta',
    sortable: true,
    /*
     * Relative, with the absolute value in the tooltip. "2 hours ago" is the
     * form the question actually takes in a queue — *has anyone touched this
     * today?* — and `DateTime` keeps the exact timestamp reachable so it is
     * never the only thing on offer.
     */
    cell: (ticket) => <DateTime value={ticket.updatedAt} relative />,
  },
  {
    id: 'createdAt',
    header: 'Filed',
    // Desktop only: the card already carries five meta lines.
    card: 'hidden',
    sortable: true,
    cell: (ticket) => <DateTime value={ticket.createdAt} relative />,
  },
]
