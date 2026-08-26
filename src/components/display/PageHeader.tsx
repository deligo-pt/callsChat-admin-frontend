import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export interface Crumb {
  readonly label: string
  readonly to?: string
}

export interface PageHeaderProps {
  /**
   * Omit where the page already names its subject — a record page whose card
   * carries the name would otherwise print it twice, once here and once there.
   * The page still needs exactly one `<h1>`, so whatever replaces this must be
   * promoted to `h1` (see `RecordHeader`'s `as` prop).
   */
  title?: string
  description?: string
  breadcrumbs?: readonly Crumb[]
  /** Primary action cluster, right-aligned on desktop, full-width on mobile. */
  actions?: ReactNode
  /** Filter bar or tabs rendered beneath the title block. */
  toolbar?: ReactNode
  className?: string
}

/**
 * The one page header in the application.
 *
 * plan.md §5.4: breadcrumb above, title left, primary action right, filters
 * below. No page rolls its own header, which is what keeps every module
 * aligned to the same grid.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  toolbar,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('space-y-4', className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-caption text-foreground-muted">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1
              return (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                  {crumb.to && !isLast ? (
                    <Link
                      to={crumb.to}
                      className="rounded-sm underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={isLast ? 'page' : undefined}>
                      {crumb.label}
                    </span>
                  )}
                  {!isLast ? (
                    <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
                  ) : null}
                </li>
              )
            })}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 space-y-1">
          {title ? <h1 className="text-h1 break-words">{title}</h1> : null}
          {description ? (
            <p className="max-w-2xl text-body text-foreground-muted">{description}</p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-initial">
            {actions}
          </div>
        ) : null}
      </div>

      {toolbar ? <div>{toolbar}</div> : null}
    </header>
  )
}
