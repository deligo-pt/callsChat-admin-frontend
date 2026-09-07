import type { AdminColumn } from '@/components/data'
import { DateTime, StatusBadge } from '@/components/display'
import type { StaffMember } from '@/types/staff'

import {
  PermissionSummaryCell,
  SessionsCell,
  StaffContactCell,
  StaffIdentityCell,
} from './cells'

/**
 * Columns for the staff directory.
 *
 * plan.md §1C: ONE definition drives both renderers — `DataTable` at `lg` and
 * above, `RecordCardList` below it.
 *
 * ⚠️ **No column is `sortable`.** `/admin/staff` accepts `sortBy` and silently
 * ignores it — verified 2026-09-03, `?sortBy=bogusfield` returns 200 with the
 * order unchanged (`listParams.ts`). A sort control that reorders nothing is
 * indistinguishable from an already-sorted column, so there is none. Rows
 * arrive newest-first and the page says so once.
 */
export const staffColumns: readonly AdminColumn<StaffMember>[] = [
  {
    id: 'displayName',
    header: 'Staff',
    card: 'title',
    sticky: true,
    width: '14rem',
    cell: (member) => <StaffIdentityCell member={member} />,
  },
  {
    id: 'status',
    header: 'Status',
    card: 'status',
    /*
     * The `staff` domain, not `user`: it renders `INACTIVE` as **Deleted**.
     * Because the backend leaves soft-deleted rows in this list, this badge is
     * the only thing separating a deleted colleague from a working one.
     */
    cell: (member) => <StatusBadge domain="staff" value={member.status} />,
  },
  {
    id: 'role',
    header: 'Role',
    card: 'meta',
    cell: (member) => <StatusBadge domain="staffRole" value={member.role} />,
  },
  {
    id: 'adminPermissions',
    header: 'Access',
    card: 'meta',
    // Fixed so the dot column lines up down the page and can be scanned.
    width: '9rem',
    cell: (member) => <PermissionSummaryCell member={member} />,
  },
  {
    id: 'email',
    header: 'Email',
    card: 'meta',
    width: '13rem',
    cell: (member) => <StaffContactCell member={member} />,
  },
  {
    id: 'activeSessionsCount',
    header: 'Sessions',
    // plan.md §5.4: numeric columns are right-aligned and tabular.
    align: 'right',
    card: 'meta',
    width: '6rem',
    cell: (member) => <SessionsCell member={member} />,
  },
  {
    id: 'lastActiveAt',
    header: 'Last active',
    card: 'meta',
    cell: (member) =>
      member.lastActiveAt ? (
        <DateTime value={member.lastActiveAt} />
      ) : (
        <span className="text-caption text-foreground-subtle">Never</span>
      ),
  },
  {
    id: 'createdAt',
    header: 'Added',
    // Desktop only: the card already carries five meta lines.
    card: 'hidden',
    cell: (member) => <DateTime value={member.createdAt} />,
  },
]
