import type { AdminColumn } from '@/components/data'
import { DateTime, StatusBadge } from '@/components/display'
import type { Verification } from '@/types/verification'

import { DocumentsCell, SubjectCell, TypeCell } from './cells'

/**
 * Columns for the verification queue (plan.md §5.1).
 *
 * plan.md §1C: ONE definition drives both renderers — `DataTable` at `lg` and
 * above, `RecordCardList` below it.
 *
 * ⚠️ **No column is sortable, and that is a statement about the API.**
 * `GET /admin/verifications` accepts `page`, `limit`, `status`, `targetType`
 * and `search` — there is no `sortBy`, and an unknown query parameter is
 * silently ignored rather than rejected, so a sort control would appear to work
 * and reorder nothing.
 *
 * This is the staff directory's situation, not the feedback queue's. Feedback
 * validates `sortBy` against a four-value allowlist and the rows genuinely
 * reorder, so it carries live controls; here the page states its order once, in
 * the notice above the table, and offers no header that lies.
 */
export const verificationColumns: readonly AdminColumn<Verification>[] = [
  {
    id: 'subject',
    header: 'Applicant',
    card: 'title',
    sticky: true,
    width: '18rem',
    cell: (record) => <SubjectCell record={record} />,
  },
  {
    id: 'targetType',
    header: 'Type',
    card: 'meta',
    width: '9rem',
    cell: (record) => <TypeCell record={record} />,
  },
  {
    id: 'status',
    header: 'Status',
    card: 'status',
    cell: (record) => <StatusBadge domain="verification" value={record.status} />,
  },
  {
    id: 'documents',
    header: 'Documents',
    card: 'meta',
    width: '9rem',
    cell: (record) => <DocumentsCell record={record} />,
  },
  {
    id: 'submittedAt',
    header: 'Submitted',
    card: 'meta',
    /*
     * Relative, with the absolute value in the tooltip. "3 days ago" is the
     * form the question takes in a compliance queue — *how long has this person
     * been waiting?* — and `DateTime` keeps the exact timestamp reachable so it
     * is never the only thing on offer.
     */
    cell: (record) => <DateTime value={record.submittedAt} relative />,
  },
  {
    id: 'reviewedAt',
    header: 'Reviewed',
    // Desktop only: the card already carries four meta lines.
    card: 'hidden',
    cell: (record) =>
      record.reviewedAt ? (
        <DateTime value={record.reviewedAt} relative />
      ) : (
        <span className="text-caption text-foreground-subtle">—</span>
      ),
  },
]
