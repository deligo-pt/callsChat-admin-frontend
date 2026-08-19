import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { metaColumns, statusColumn, titleColumn, type AdminColumn } from './columns'

export interface RecordCardListProps<TRow> {
  rows: readonly TRow[]
  /** The SAME column definition the DataTable receives. */
  columns: readonly AdminColumn<TRow>[]
  rowKey: (row: TRow) => string
  onRowClick?: (row: TRow) => void
  rowActions?: (row: TRow) => ReactNode
  className?: string
}

/**
 * The mobile counterpart to `DataTable`.
 *
 * plan.md §1C / §6.2: below `lg` a list renders as record cards rather than a
 * cramped table. Crucially it consumes the identical column definition — the
 * `card` role on each column decides whether it becomes the card title, the
 * status badge, or a labelled metadata line.
 */
export function RecordCardList<TRow>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowActions,
  className,
}: RecordCardListProps<TRow>) {
  const title = titleColumn(columns)
  const status = statusColumn(columns)
  const meta = metaColumns(columns).filter(
    (column) => column.id !== title?.id && column.id !== status?.id,
  )

  return (
    <ul className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-1', className)}>
      {rows.map((row) => {
        const interactive = Boolean(onRowClick)

        return (
          <li key={rowKey(row)}>
            <div
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
              className={cn(
                'rounded-lg border border-border bg-surface p-4',
                interactive
                  ? 'cursor-pointer hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  : undefined,
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-body font-medium break-words">
                  {title ? title.cell(row) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {status ? status.cell(row) : null}
                  {interactive && !rowActions ? (
                    <ChevronRight
                      className="size-4 text-foreground-subtle"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              </div>

              {meta.length > 0 ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                  {meta.map((column) => (
                    <div key={column.id} className="min-w-0">
                      <dt className="text-overline text-foreground-subtle uppercase">
                        {column.header}
                      </dt>
                      <dd
                        className={cn(
                          'mt-0.5 text-caption break-words',
                          column.align === 'right' ? 'tabular' : undefined,
                        )}
                      >
                        {column.cell(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {rowActions ? (
                <div
                  className="mt-3 flex justify-end border-t border-border pt-3"
                  onClick={(event) => event.stopPropagation()}
                >
                  {rowActions(row)}
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
