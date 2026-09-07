import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { AdminColumn } from '@/components/data'
import { DateTime, StatusBadge } from '@/components/display'
import type { BackupLog } from '@/types/settings'

/**
 * One column definition, rendered as a table at `lg`+ and as record cards
 * below it (plan.md §1C).
 *
 * `triggeredBy` arrives fully expanded on this endpoint — id, email, role,
 * displayName, avatarUrl — unlike `updatedBy` on the settings record, which is
 * a bare ID. So this is the one place in the module that can show *who* did
 * something as a name and a face rather than an opaque string.
 */
export const backupColumns: readonly AdminColumn<BackupLog>[] = [
  {
    id: 'fileName',
    header: 'File',
    card: 'title',
    sticky: true,
    cell: (row) => (
      /*
       * `block`: `truncate-id` sets overflow + text-overflow, which an inline
       * span ignores. Without it the filename pushes the status badge off the
       * card on a phone.
       */
      <span className="block truncate-id font-medium" title={row.fileName}>
        {row.fileName}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    card: 'status',
    cell: (row) => <StatusBadge domain="backup" value={row.status} />,
  },
  {
    id: 'fileSizeFormatted',
    header: 'Size',
    // plan.md §5.4: numeric columns are right-aligned and tabular.
    align: 'right',
    card: 'meta',
    cell: (row) => (
      <span className="tabular">
        {row.fileSizeFormatted ?? <span className="text-foreground-subtle">—</span>}
      </span>
    ),
  },
  {
    id: 'startedAt',
    header: 'Started',
    card: 'meta',
    cell: (row) => <DateTime value={row.startedAt} />,
  },
  {
    id: 'completedAt',
    header: 'Finished',
    card: 'hidden',
    cell: (row) => <DateTime value={row.completedAt} />,
  },
  {
    id: 'triggeredBy',
    header: 'Triggered by',
    card: 'meta',
    cell: (row) => {
      if (!row.triggeredBy) return <span className="text-foreground-subtle">—</span>
      const name = row.triggeredBy.displayName ?? row.triggeredBy.email
      return (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar className="size-6 shrink-0">
            {row.triggeredBy.avatarUrl ? (
              <AvatarImage src={row.triggeredBy.avatarUrl} alt="" />
            ) : null}
            <AvatarFallback className="text-overline">
              {name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">{name}</span>
        </span>
      )
    },
  },
]
