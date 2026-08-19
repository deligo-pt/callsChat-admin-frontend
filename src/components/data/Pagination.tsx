import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'

import { PAGE_SIZE_OPTIONS, type PaginationState } from './columns'

export interface PaginationProps {
  state: PaginationState
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  className?: string
}

/** Page numbers to render, with ellipsis gaps for long ranges. */
function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)

  if (current <= 4) return [1, 2, 3, 4, 5, 'gap', total]
  if (current >= total - 3)
    return [1, 'gap', total - 4, total - 3, total - 2, total - 1, total]

  return [1, 'gap', current - 1, current, current + 1, 'gap', total]
}

/**
 * Server-side pagination control.
 *
 * plan.md §6.2: full control from lg (page size, range, numbered pages);
 * compact prev/next with a position label below it.
 */
export function Pagination({
  state,
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationProps) {
  const { page, pageSize, total, totalPages } = state

  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1
  const lastRow = Math.min(page * pageSize, total)

  const canPrevious = page > 1
  const canNext = page < totalPages

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      {/* Range summary */}
      <p className="order-2 text-caption text-foreground-muted sm:order-1">
        {total === 0
          ? 'No records'
          : `Showing ${formatCount(firstRow)}–${formatCount(lastRow)} of ${formatCount(total)}`}
      </p>

      <div className="order-1 flex items-center justify-between gap-2 sm:order-2 sm:justify-end">
        {/* Page size — desktop only, mobile keeps the control set minimal */}
        {onPageSizeChange ? (
          <div className="hidden items-center gap-2 lg:flex">
            <span className="text-caption text-foreground-muted">Rows</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger
                size="sm"
                className="w-[4.5rem]"
                aria-label="Rows per page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={!canPrevious}
            aria-label="Previous page"
          >
            <ChevronLeft />
            <span className="hidden sm:inline">Previous</span>
          </Button>

          {/* Numbered pages — desktop only (plan.md §6.2) */}
          <ul className="hidden items-center gap-1 lg:flex">
            {pageWindow(page, totalPages).map((entry, index) =>
              entry === 'gap' ? (
                <li
                  key={`gap-${index}`}
                  className="px-1 text-foreground-subtle"
                  aria-hidden="true"
                >
                  …
                </li>
              ) : (
                <li key={entry}>
                  <Button
                    variant={entry === page ? 'primary' : 'ghost'}
                    size="icon-sm"
                    onClick={() => onPageChange(entry)}
                    aria-label={`Page ${entry}`}
                    aria-current={entry === page ? 'page' : undefined}
                  >
                    {entry}
                  </Button>
                </li>
              ),
            )}
          </ul>

          {/* Compact position indicator — mobile and tablet */}
          <span className="px-2 text-caption text-foreground-muted lg:hidden">
            Page {page} of {Math.max(1, totalPages)}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={!canNext}
            aria-label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </nav>
  )
}
