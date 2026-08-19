import type { ReactNode } from 'react'

/**
 * One column definition, consumed by BOTH `DataTable` (lg and up) and
 * `RecordCardList` (below lg).
 *
 * plan.md §1C: "Writing a list means writing one column config, not two UIs."
 * The `card` role tells the mobile renderer where a column belongs in the card
 * layout; everything else describes the desktop table cell.
 */
export interface AdminColumn<TRow> {
  /** Stable key, also used as the sort field sent to the API. */
  readonly id: string
  readonly header: string
  readonly cell: (row: TRow) => ReactNode

  /**
   * plan.md §5.4: numeric, money and Diamond columns are right-aligned;
   * text and status columns are left-aligned.
   */
  readonly align?: 'left' | 'right'

  /**
   * Where this column appears in the mobile card:
   * - `title`  — the card's primary line (usually the record identifier)
   * - `status` — rendered top-right as a badge
   * - `meta`   — a labelled line in the card body
   * - `hidden` — desktop table only
   */
  readonly card?: 'title' | 'status' | 'meta' | 'hidden'

  /** Freeze this column when the table scrolls horizontally (plan.md §6.2). */
  readonly sticky?: boolean

  /** Enables the server-side sort control on this column's header. */
  readonly sortable?: boolean

  /** Fixed width, e.g. "12rem". Omit to let the column size to content. */
  readonly width?: string

  /** Start hidden; the operator can enable it via the column visibility menu. */
  readonly defaultHidden?: boolean
}

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  readonly field: string
  readonly direction: SortDirection
}

/** Server-driven pagination state. plan.md §3.6: never unbounded. */
export interface PaginationState {
  readonly page: number
  readonly pageSize: number
  readonly total: number
  readonly totalPages: number
}

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

export const DEFAULT_PAGE_SIZE = 25

/** Columns the mobile card renderer should treat as body metadata. */
export function metaColumns<TRow>(
  columns: readonly AdminColumn<TRow>[],
): readonly AdminColumn<TRow>[] {
  return columns.filter((column) => (column.card ?? 'meta') === 'meta')
}

export function titleColumn<TRow>(
  columns: readonly AdminColumn<TRow>[],
): AdminColumn<TRow> | undefined {
  return columns.find((column) => column.card === 'title') ?? columns[0]
}

export function statusColumn<TRow>(
  columns: readonly AdminColumn<TRow>[],
): AdminColumn<TRow> | undefined {
  return columns.find((column) => column.card === 'status')
}
