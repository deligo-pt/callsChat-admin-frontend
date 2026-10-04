import type { AdminColumn } from '@/components/data'
import { DateTime, StatusBadge } from '@/components/display'
import type { Announcement } from '@/types/announcement'

import { AudienceCell, AuthorCell, MediaCell, ReachCell, TitleCell } from './cells'

/**
 * Columns for the announcements queue (plan.md §5, phase B2).
 *
 * ONE definition drives both renderers — `DataTable` at `lg` and above,
 * `RecordCardList` below it.
 *
 * ⚠️ **No column is sortable, and that is a statement about the API.**
 * `GET /admin/announcements` accepts `page`, `limit`, `status`, `priority`,
 * `targetAudience`, `isPinned` and `search` — there is no `sortBy`, and this
 * API *silently ignores* unknown query parameters rather than rejecting them,
 * so a sort control would appear to work and reorder nothing (O4).
 *
 * This is the verification queue's situation, not the feedback queue's.
 * Feedback validates `sortBy` against a real allowlist and its rows genuinely
 * reorder, so it carries live controls; here the page states its order once, in
 * the notice above the table.
 */
export const announcementColumns: readonly AdminColumn<Announcement>[] = [
  {
    id: 'title',
    header: 'Announcement',
    card: 'title',
    sticky: true,
    width: '24rem',
    cell: (record) => <TitleCell record={record} />,
  },
  {
    id: 'status',
    header: 'Status',
    card: 'status',
    cell: (record) => <StatusBadge domain="announcement" value={record.status ?? ''} />,
  },
  {
    id: 'priority',
    header: 'Priority',
    card: 'meta',
    width: '8rem',
    /*
     * A badge rather than text, and in the same glance as the status, because
     * priority here is not a property of our workflow — `URGENT` puts a rose
     * banner on every user's chat list (`broadcast.md` §5.2). An operator
     * scanning the queue needs to see how loud each message is.
     */
    cell: (record) => (
      <StatusBadge domain="announcementPriority" value={record.priority ?? ''} />
    ),
  },
  {
    id: 'targetAudience',
    header: 'Audience',
    card: 'meta',
    width: '9rem',
    cell: (record) => <AudienceCell record={record} />,
  },
  {
    id: 'media',
    header: 'Media',
    card: 'meta',
    width: '11rem',
    cell: (record) => <MediaCell record={record} />,
  },
  {
    id: 'viewsCount',
    header: 'Views',
    card: 'meta',
    width: '7rem',
    /* Right-aligned: it is a count. plan.md §5.4. */
    align: 'right',
    cell: (record) => <ReachCell record={record} />,
  },
  {
    id: 'publishedAt',
    header: 'Published',
    card: 'meta',
    cell: (record) =>
      record.publishedAt ? (
        /*
         * Relative, with the absolute value in the tooltip. "2 days ago" is the
         * form the question takes here — *how long has this been on everyone's
         * phone?* — and `DateTime` keeps the exact timestamp reachable.
         */
        <DateTime value={record.publishedAt} relative />
      ) : (
        /*
         * ⚠️ Not an em dash. A row with no publish date is a draft or an
         * archived record, and "Not published" states that in the one column an
         * operator checks when deciding whether a message has gone out.
         */
        <span className="text-caption text-foreground-subtle">Not published</span>
      ),
  },
  {
    id: 'author',
    header: 'Author',
    /* Desktop only: the card already carries five meta lines. */
    card: 'hidden',
    width: '10rem',
    cell: (record) => <AuthorCell record={record} />,
  },
  {
    id: 'updatedAt',
    header: 'Updated',
    card: 'hidden',
    /*
     * Hidden by default and reachable from the column menu. It matters only
     * when two operators are editing the same copy, which is rare enough that
     * it should not cost a column of width every day.
     */
    defaultHidden: true,
    cell: (record) =>
      record.updatedAt ? (
        <DateTime value={record.updatedAt} relative />
      ) : (
        <span className="text-caption text-foreground-subtle">—</span>
      ),
  },
]
