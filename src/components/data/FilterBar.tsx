import { SlidersHorizontal, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/cn'
import { useIsTableViewport } from '@/lib/hooks/useBreakpoint'

export interface AppliedFilter {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface FilterBarProps {
  /** The filter controls themselves — selects, inputs, date pickers. */
  children: ReactNode
  /** Chips summarising what is currently applied. */
  applied?: readonly AppliedFilter[]
  onRemove?: (id: string) => void
  onClearAll?: () => void
  /** Search input rendered inline, always visible at every breakpoint. */
  search?: ReactNode
  className?: string
}

/**
 * Filter surface for list pages.
 *
 * plan.md §6.2: inline on desktop; below `lg` the controls move into a
 * bottom sheet behind a button that carries the applied-filter count, so a
 * mobile list keeps its full screen for records.
 *
 * Filter state itself is owned by the feature and synced to the URL search
 * params (plan.md §1C) so filters survive refresh and can be shared.
 */
export function FilterBar({
  children,
  applied = [],
  onRemove,
  onClearAll,
  search,
  className,
}: FilterBarProps) {
  const isDesktop = useIsTableViewport()
  const [sheetOpen, setSheetOpen] = useState(false)

  const chips =
    applied.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2">
        {applied.map((filter) => (
          <span
            key={filter.id}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary-soft py-1 pr-1 pl-2 text-caption text-primary-700"
          >
            <span className="text-foreground-subtle">{filter.label}:</span>
            <span className="font-medium">{filter.value}</span>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(filter.id)}
                aria-label={`Remove ${filter.label} filter`}
                className="rounded-sm p-0.5 hover:bg-primary-100 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        ))}
        {onClearAll ? (
          <Button variant="link" size="sm" onClick={onClearAll} className="h-auto p-0">
            Clear all
          </Button>
        ) : null}
      </div>
    ) : null

  if (isDesktop) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex flex-wrap items-end gap-3">
          {search ? <div className="min-w-[16rem] flex-1">{search}</div> : null}
          {children}
        </div>
        {chips}
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        {search ? <div className="min-w-0 flex-1">{search}</div> : null}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="shrink-0">
              <SlidersHorizontal />
              Filters
              {applied.length > 0 ? (
                <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-overline text-primary-foreground">
                  {applied.length}
                </span>
              ) : null}
            </Button>
          </SheetTrigger>

          <SheetContent side="bottom" className="max-h-[85dvh]">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>
                Narrow the list. Filters are kept in the page URL so you can share or
                bookmark this view.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 scroll-x overflow-y-auto px-4">
              {children}
            </div>

            <SheetFooter>
              {onClearAll ? (
                <Button variant="ghost" onClick={onClearAll}>
                  Clear all
                </Button>
              ) : null}
              <Button onClick={() => setSheetOpen(false)}>Show results</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      {chips}
    </div>
  )
}
