import type { AdminColumn } from '@/components/data'
import { CopyableId, DateTime, StatusBadge } from '@/components/display'
import type { UserSummary } from '@/types/identity'

import { ContactCell, IdentityCell, RestrictionCell } from './cells'

/**
 * Columns for the user directory.
 *
 * plan.md §1C: ONE definition drives both renderers — `DataTable` at `lg` and
 * above, `RecordCardList` below it. The `card` role on each column is what
 * tells the mobile renderer where the value belongs, so the responsive
 * behaviour is a property of the data, not a second hand-built layout.
 *
 * `sortable` is set only on the four fields the API's own `sortBy` allowlist
 * accepts (see `listParams.ts`) — offering a sort control the backend would
 * reject with a 400 would be worse than offering none.
 */
export const userColumns: readonly AdminColumn<UserSummary>[] = [
  {
    id: 'displayName',
    header: 'User',
    card: 'title',
    sortable: true,
    sticky: true,
    width: '14rem',
    cell: (user) => <IdentityCell user={user} />,
  },
  {
    id: 'status',
    header: 'Status',
    card: 'status',
    sortable: true,
    cell: (user) => <StatusBadge domain="user" value={user.status} />,
  },
  {
    id: 'activeRestrictions',
    header: 'Restrictions',
    card: 'meta',
    cell: (user) => <RestrictionCell user={user} />,
  },
  {
    id: 'contact',
    header: 'Contact',
    card: 'meta',
    cell: (user) => <ContactCell user={user} />,
  },
  {
    id: 'id',
    header: 'User ID',
    card: 'meta',
    width: '10rem',
    /*
     * Truncated harder than the default 18 characters: these CUID-style ids are
     * 25 chars and were forcing the column ~200px wide, pushing "Last active"
     * off the right edge at 1440. The full value stays in the tooltip and on
     * the clipboard, which is what an operator actually needs it for.
     */
    cell: (user) => <CopyableId value={user.id} label="User ID" maxLength={12} />,
  },
  {
    id: 'accountType',
    header: 'Type',
    card: 'meta',
    defaultHidden: true,
    cell: (user) => <StatusBadge domain="accountType" value={user.accountType} />,
  },
  {
    id: 'createdAt',
    header: 'Registered',
    card: 'meta',
    sortable: true,
    cell: (user) => (
      <DateTime value={user.createdAt} variant="date" className="whitespace-nowrap" />
    ),
  },
  {
    id: 'lastActiveAt',
    header: 'Last active',
    card: 'meta',
    sortable: true,
    cell: (user) =>
      user.lastActiveAt ? (
        // Relative strings like "2 minutes ago" wrapped and unbalanced the row.
        <DateTime value={user.lastActiveAt} relative className="whitespace-nowrap" />
      ) : (
        <span className="text-caption text-foreground-subtle">Never</span>
      ),
  },
]
