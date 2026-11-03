import type { ReactNode } from 'react'

import { EmptyState, ErrorState, LoadingState } from '@/components/feedback'
import { useIsTableViewport } from '@/lib/hooks/useBreakpoint'

import type { AdminColumn, SortState } from './columns'
import { DataTable } from './DataTable'
import { RecordCardList } from './RecordCardList'

export interface DataListProps<TRow> {
  rows: readonly TRow[]
  columns: readonly AdminColumn<TRow>[]
  rowKey: (row: TRow) => string
  /** Accessible name for each row's open control on the card layout. */
  rowLabel?: (row: TRow) => string

  /** Remote state — every list surface must handle all of these. */
  loading?: boolean
  error?: { message?: string; correlationId?: string } | null
  onRetry?: () => void

  sort?: SortState | undefined
  onSortChange?: (sort: SortState) => void
  onRowClick?: (row: TRow) => void
  rowActions?: (row: TRow) => ReactNode
  /**
   * Keep each card's "View <name>" open control even with `rowActions`. Off
   * by default — on most lists the actions replace it. On for a list whose
   * actions are a menu of *other* places, so opening the row stays one tap.
   */
  keepCardOpenControl?: boolean

  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode

  density?: 'comfortable' | 'compact'
  onDensityChange?: (density: 'comfortable' | 'compact') => void

  className?: string
}

/**
 * The list surface every module uses.
 *
 * plan.md §1C: one column definition, two renderers. `useIsTableViewport()`
 * is the single place the `lg` threshold is expressed — features never check
 * the breakpoint themselves.
 *
 * plan.md §3.8: loading, empty and error states are handled here so no module
 * can forget one.
 */
export function DataList<TRow>({
  rows,
  columns,
  rowKey,
  rowLabel,
  loading = false,
  error = null,
  onRetry,
  sort,
  onSortChange,
  onRowClick,
  rowActions,
  keepCardOpenControl = false,
  emptyTitle,
  emptyDescription,
  emptyAction,
  density,
  onDensityChange,
  className,
}: DataListProps<TRow>) {
  const isTableViewport = useIsTableViewport()

  if (loading) {
    return <LoadingState variant={isTableViewport ? 'table' : 'cards'} />
  }

  if (error) {
    return (
      <ErrorState
        {...(error.message ? { description: error.message } : {})}
        {...(error.correlationId ? { correlationId: error.correlationId } : {})}
        {...(onRetry ? { onRetry } : {})}
      />
    )
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        {...(emptyTitle ? { title: emptyTitle } : {})}
        {...(emptyDescription ? { description: emptyDescription } : {})}
        {...(emptyAction ? { action: emptyAction } : {})}
      />
    )
  }

  if (isTableViewport) {
    return (
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={rowKey}
        sort={sort}
        {...(onSortChange ? { onSortChange } : {})}
        {...(onRowClick ? { onRowClick } : {})}
        {...(rowActions ? { rowActions } : {})}
        {...(density ? { density } : {})}
        {...(onDensityChange ? { onDensityChange } : {})}
        {...(className ? { className } : {})}
      />
    )
  }

  return (
    <RecordCardList
      rows={rows}
      columns={columns}
      rowKey={rowKey}
      {...(rowLabel ? { rowLabel } : {})}
      {...(onRowClick ? { onRowClick } : {})}
      {...(rowActions ? { rowActions } : {})}
      keepOpenControl={keepCardOpenControl}
      {...(className ? { className } : {})}
    />
  )
}
