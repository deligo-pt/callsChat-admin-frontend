import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export interface KeyValueItem {
  readonly label: string
  readonly value: ReactNode
  /** Span the full row — useful for long text such as a rejection reason. */
  readonly full?: boolean
}

export interface KeyValueGridProps {
  items: readonly KeyValueItem[]
  /** Maximum columns at the widest breakpoint. */
  columns?: 2 | 3
  className?: string
}

const COLUMN_CLASSES = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 xl:grid-cols-3',
} as const

/**
 * Aligned metadata grid — 1 column on mobile, 2 from sm, optionally 3 at xl
 * (plan.md §6.2). Labels sit above values so long values never push labels out
 * of alignment.
 */
export function KeyValueGrid({ items, columns = 3, className }: KeyValueGridProps) {
  return (
    <dl
      className={cn(
        'grid grid-cols-1 gap-x-6 gap-y-4',
        COLUMN_CLASSES[columns],
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className={cn(
            'min-w-0 space-y-1',
            item.full ? 'sm:col-span-full' : undefined,
          )}
        >
          <dt className="text-overline text-foreground-subtle uppercase">
            {item.label}
          </dt>
          <dd className="text-body break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
