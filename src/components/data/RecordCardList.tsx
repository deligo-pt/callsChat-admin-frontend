import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { metaColumns, statusColumn, titleColumn, type AdminColumn } from './columns'

export interface RecordCardListProps<TRow> {
  rows: readonly TRow[]
  /** The SAME column definition the DataTable receives. */
  columns: readonly AdminColumn<TRow>[]
  rowKey: (row: TRow) => string
  /**
   * Human-readable name for the record, used as the accessible name of the
   * card's open control. Without it the control reads as "View record".
   */
  rowLabel?: (row: TRow) => string
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
  rowLabel,
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
    <ul className={cn('grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1', className)}>
      {rows.map((row) => {
        const interactive = Boolean(onRowClick)

        return (
          <li key={rowKey(row)}>
            {/*
              The card is NOT `role="button"`.
              
              It contains its own controls — a copy-ID button, row actions — and
              a button inside a button is a serious a11y violation (axe
              `nested-interactive`): assistive tech cannot reliably reach the
              inner control. Instead the card stays a plain container that
              responds to pointer clicks for convenience, and the trailing
              chevron is a real button carrying the accessible name. Keyboard
              and screen-reader users get one unambiguous target.
            */}
            <div
              onClick={
                onRowClick
                  ? (event) => {
                      /*
                       * Ignore clicks that originated on a nested control —
                       * copying an ID must not also navigate away.
                       */
                      if (
                        (event.target as HTMLElement).closest(
                          'button, a, input, [role="button"]',
                        )
                      ) {
                        return
                      }
                      onRowClick(row)
                    }
                  : undefined
              }
              className={cn(
                'min-w-0 rounded-lg border border-border bg-surface p-4',
                interactive
                  ? 'cursor-pointer hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  : undefined,
              )}
            >
              {/*
                `flex-wrap`: a status badge does not wrap its own text (a
                two-word status splitting across lines made table rows ragged),
                so on a narrow card it needs room to drop onto its own line
                instead. Without this the badge overflowed the card and the
                page scrolled sideways at 390px.
              */}
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 text-body font-medium break-words">
                  {title ? title.cell(row) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {status ? status.cell(row) : null}
                  {interactive && !rowActions && onRowClick ? (
                    <button
                      type="button"
                      onClick={() => onRowClick(row)}
                      /*
                       * The accessible name must identify WHICH record this
                       * opens — a list of buttons all called "View" is useless
                       * when read out of context.
                       */
                      aria-label={rowLabel ? `View ${rowLabel(row)}` : 'View record'}
                      className="-m-1 touch-target rounded-sm p-1 text-foreground-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </button>
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
