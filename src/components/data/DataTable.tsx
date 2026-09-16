import { ArrowDown, ArrowUp, ArrowUpDown, Settings2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/cn'

import type { AdminColumn, SortState } from './columns'

export interface DataTableProps<TRow> {
  rows: readonly TRow[]
  columns: readonly AdminColumn<TRow>[]
  rowKey: (row: TRow) => string

  /** Server-driven sort. Sorting is never performed in the browser. */
  sort?: SortState | undefined
  onSortChange?: (sort: SortState) => void

  /** Navigates to the record detail page. */
  onRowClick?: (row: TRow) => void

  /** Per-row action menu, rendered in a trailing column. */
  rowActions?: (row: TRow) => ReactNode

  /** Compact row height for dense operational lists. */
  density?: 'comfortable' | 'compact'
  onDensityChange?: (density: 'comfortable' | 'compact') => void

  className?: string
}

/**
 * The desktop data table.
 *
 * Every data operation is server-driven (plan.md §1C / §3.6): the browser never
 * sorts, filters or paginates a dataset it holds in memory. Sort headers emit
 * an intent and the feature re-queries the API.
 *
 * The table scrolls on its own axis with a sticky header and a sticky first
 * column, so a wide table never gives the page a horizontal scrollbar
 * (plan.md §6.3). Below `lg`, `DataList` renders `RecordCardList` instead —
 * from this same column definition.
 */
export function DataTable<TRow>({
  rows,
  columns,
  rowKey,
  sort,
  onSortChange,
  onRowClick,
  rowActions,
  density = 'comfortable',
  onDensityChange,
  className,
}: DataTableProps<TRow>) {
  const [hiddenColumns, setHiddenColumns] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        columns.filter((column) => column.defaultHidden).map((column) => column.id),
      ),
  )

  const visibleColumns = useMemo(
    () => columns.filter((column) => !hiddenColumns.has(column.id)),
    [columns, hiddenColumns],
  )

  const cellPadding = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3'
  // An explicit row-height floor so a row of short cells (a bare date, a dash)
  // is the same height as one carrying a badge — plan.md §5.4 vertical rhythm.
  const rowHeight = density === 'compact' ? 'h-10' : 'h-13'

  function toggleColumn(id: string) {
    setHiddenColumns((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSort(column: AdminColumn<TRow>) {
    if (!column.sortable || !onSortChange) return
    const isCurrent = sort?.field === column.id
    const direction = isCurrent && sort.direction === 'asc' ? 'desc' : 'asc'
    onSortChange({ field: column.id, direction })
  }

  return (
    /*
     * `min-w-0` is load-bearing: as a flex or grid child this container would
     * otherwise size to its content (min-width: auto), letting a wide table push
     * its ancestors past the viewport instead of scrolling inside `scroll-x`.
     */
    <div className={cn('min-w-0 space-y-3', className)}>
      {/* Table controls */}
      <div className="flex items-center justify-end gap-2">
        {onDensityChange ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onDensityChange(density === 'compact' ? 'comfortable' : 'compact')
            }
            aria-pressed={density === 'compact'}
          >
            {density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings2 /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {columns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={!hiddenColumns.has(column.id)}
                onCheckedChange={() => toggleColumn(column.id)}
                onSelect={(event) => event.preventDefault()}
              >
                {column.header}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* plan.md §6.3: only this container scrolls horizontally, never the page */}
      {/*
        `relative` matters: an `overflow` container only clips absolutely
        positioned descendants when it is itself their containing block. Without
        it the `sr-only` header label (which is `position: absolute`) escaped the
        clip and widened the document's scroll area, letting the whole page
        scroll sideways by ~124px.
      */}
      <div className="relative w-full max-w-full scroll-x rounded-md border border-border">
        <table className="w-full border-collapse text-left">
          {/*
            Not `sticky`. The wrapper above sets `overflow-x: auto`, which makes
            it a scroll container on BOTH axes — so a `sticky top-0` header
            resolves against a box that never scrolls vertically and simply
            never sticks. It looked deliberate and did nothing.

            A genuinely pinned header needs the table body to own the vertical
            scroll instead of `<main>`; that is a deliberate layout change, not
            a class name, so it is left for the Phase 3B detail work.
          */}
          <thead className="bg-surface-muted">
            <tr>
              {visibleColumns.map((column) => {
                const isSorted = sort?.field === column.id
                const alignRight = column.align === 'right'

                return (
                  <th
                    key={column.id}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    className={cn(
                      'border-b border-border-strong px-4 py-3 align-middle text-overline whitespace-nowrap text-foreground-muted uppercase',
                      alignRight ? 'text-right' : 'text-left',
                      column.sticky ? 'sticky left-0 z-20 bg-surface-muted' : undefined,
                    )}
                    aria-sort={
                      isSorted
                        ? sort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : column.sortable
                          ? 'none'
                          : undefined
                    }
                  >
                    {/*
                      Sortable and non-sortable headers both render an inline-flex
                      row of the same height, so every column label sits on one
                      baseline. Previously a sortable header rendered a button and
                      a plain one rendered bare text, and the two did not line up.
                    */}
                    {column.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => handleSort(column)}
                        className={cn(
                          'inline-flex items-center gap-1 text-overline uppercase hover:text-foreground',
                          alignRight ? 'flex-row-reverse' : undefined,
                        )}
                      >
                        {column.header}
                        {isSorted ? (
                          sort.direction === 'asc' ? (
                            <ArrowUp className="size-3 shrink-0" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="size-3 shrink-0" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown
                            className="size-3 shrink-0 opacity-40"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    ) : (
                      <span className="inline-flex items-center">{column.header}</span>
                    )}
                  </th>
                )
              })}

              {rowActions ? (
                <th scope="col" className="border-b border-border-strong px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter') onRowClick(row)
                      }
                    : undefined
                }
                className={cn(
                  rowHeight,
                  'border-b border-border bg-surface last:border-b-0',
                  onRowClick
                    ? 'cursor-pointer hover:bg-surface-muted focus-visible:bg-surface-muted'
                    : undefined,
                )}
              >
                {visibleColumns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(
                      // `align-middle` keeps short and tall cells on one line;
                      // without it a wrapped badge dragged its neighbours upward.
                      'align-middle text-body',
                      cellPadding,
                      column.align === 'right' ? 'text-right tabular' : 'text-left',
                      column.sticky ? 'sticky left-0 z-10 bg-surface' : undefined,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}

                {rowActions ? (
                  <td
                    className={cn('text-right', cellPadding)}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {rowActions(row)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
