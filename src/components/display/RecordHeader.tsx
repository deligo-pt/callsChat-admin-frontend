import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export interface RecordHeaderProps {
  /** Primary human-readable identifier, e.g. a display name or club title. */
  title: string
  /**
   * Heading level for `title`. Defaults to `h2`, which is right when a
   * `PageHeader` above supplies the `h1`. Pass `'h1'` where this card is the
   * page's only name for its subject, so the document still has exactly one
   * top-level heading.
   */
  as?: 'h1' | 'h2' 
  /** Secondary identifiers — IDs, masked contact, created date. */
  identifiers?: ReactNode
  /** Status and restriction badges. */
  badges?: ReactNode
  /** Restricted action cluster — only rendered when the role allows it. */
  actions?: ReactNode
  className?: string
}

/**
 * Detail-page identity block.
 *
 * plan.md §Recommended Screen Pattern: status and key identifiers on the left,
 * the permitted action cluster on the right. On mobile everything stacks and
 * the actions go full-width so they stay reachable.
 */
export function RecordHeader({
  title,
  as: Heading = 'h2',
  identifiers,
  badges,
  actions,
  className,
}: RecordHeaderProps) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface p-4 sm:p-6', className)}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Heading className="text-h2 break-words">{title}</Heading>
            {badges ? (
              <div className="flex flex-wrap items-center gap-1.5">{badges}</div>
            ) : null}
          </div>

          {identifiers ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-foreground-muted">
              {identifiers}
            </div>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-initial">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}
