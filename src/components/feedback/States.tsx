import { AlertTriangle, FileQuestion, Inbox, RefreshCw, ShieldOff } from 'lucide-react'
import type { ReactNode } from 'react'

import { CopyableId } from '@/components/display/CopyableId'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------
 * Shared shell
 * ---------------------------------------------------------------------- */

interface StateShellProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  tone?: 'neutral' | 'danger' | 'warning'
  className?: string
}

const TONE_ICON = {
  neutral: 'bg-neutral-soft text-neutral-foreground',
  danger: 'bg-danger-soft text-danger-foreground',
  warning: 'bg-warning-soft text-warning-foreground',
} as const

function StateShell({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
}: StateShellProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 px-6 py-12 text-center',
        className,
      )}
    >
      <div
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-lg',
          TONE_ICON[tone],
        )}
        aria-hidden="true"
      >
        {icon}
      </div>

      <div className="max-w-md space-y-1">
        <p className="text-h4">{title}</p>
        {description ? (
          <p className="text-body text-foreground-muted">{description}</p>
        ) : null}
      </div>

      {action}
    </div>
  )
}

/* -------------------------------------------------------------------------
 * Empty
 * ---------------------------------------------------------------------- */

export interface EmptyStateProps {
  title?: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  title = 'No records found',
  description = 'Nothing matches the current filters. Try widening the date range or clearing a filter.',
  action,
  className,
}: EmptyStateProps) {
  return (
    <StateShell
      icon={<Inbox className="size-6" />}
      title={title}
      {...(description ? { description } : {})}
      {...(action ? { action } : {})}
      {...(className ? { className } : {})}
    />
  )
}

/* -------------------------------------------------------------------------
 * Error
 * ---------------------------------------------------------------------- */

export interface ErrorStateProps {
  title?: string
  description?: string
  /** Surfaced so support can trace the failure in backend logs (plan.md §10). */
  correlationId?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'The request could not be completed. This has not changed any data.',
  correlationId,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <StateShell
      tone="danger"
      icon={<AlertTriangle className="size-6" />}
      title={title}
      description={description}
      className={cn(className)}
      action={
        <div className="flex flex-col items-center gap-3">
          {onRetry ? (
            <Button variant="outline" onClick={onRetry}>
              <RefreshCw /> Try again
            </Button>
          ) : null}
          {correlationId ? (
            <CopyableId value={correlationId} label="Correlation ID" maxLength={28} />
          ) : null}
        </div>
      }
    />
  )
}

/* -------------------------------------------------------------------------
 * Forbidden
 * ---------------------------------------------------------------------- */

export interface ForbiddenStateProps {
  /** Optional resource name. Never include record values here (plan.md §3.4). */
  resource?: string
  className?: string
}

/**
 * plan.md §3.4 / §8: a 403 renders a safe message and leaks nothing. It never
 * reveals whether the record exists, what it contains, or who can see it.
 */
export function ForbiddenState({ resource, className }: ForbiddenStateProps) {
  return (
    <StateShell
      tone="warning"
      icon={<ShieldOff className="size-6" />}
      title="You do not have access to this"
      description={
        resource
          ? `Your role does not include permission to view ${resource}. Contact a Super Admin if you believe this is wrong.`
          : 'Your role does not include permission for this area. Contact a Super Admin if you believe this is wrong.'
      }
      {...(className ? { className } : {})}
    />
  )
}

/* -------------------------------------------------------------------------
 * Not found
 * ---------------------------------------------------------------------- */

export function NotFoundState({
  title = 'Record not found',
  description = 'This record does not exist, or it has been removed.',
  action,
  className,
}: EmptyStateProps) {
  return (
    <StateShell
      icon={<FileQuestion className="size-6" />}
      title={title}
      {...(description ? { description } : {})}
      {...(action ? { action } : {})}
      {...(className ? { className } : {})}
    />
  )
}

/* -------------------------------------------------------------------------
 * Loading
 * ---------------------------------------------------------------------- */

export interface LoadingStateProps {
  /**
   * Skeletons are shaped like the content they replace (plan.md §1D) — a
   * spinner tells the operator nothing about what is arriving.
   */
  variant?: 'table' | 'cards' | 'detail' | 'form'
  rows?: number
  className?: string
}

export function LoadingState({
  variant = 'table',
  rows = 6,
  className,
}: LoadingStateProps) {
  const items = Array.from({ length: rows }, (_, index) => index)

  if (variant === 'cards') {
    return (
      <div
        className={cn('grid gap-3 sm:grid-cols-2', className)}
        role="status"
        aria-label="Loading records"
      >
        {items.map((index) => (
          <div key={index} className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16 rounded-sm" />
            </div>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'detail') {
    return (
      <div
        className={cn('space-y-6', className)}
        role="status"
        aria-label="Loading record"
      >
        <div className="space-y-4 rounded-lg border border-border p-6">
          <Skeleton className="h-7 w-64" />
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.slice(0, 6).map((index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'form') {
    return (
      <div
        className={cn('space-y-5', className)}
        role="status"
        aria-label="Loading form"
      >
        {items.slice(0, 4).map((index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn('overflow-hidden rounded-md border border-border', className)}
      role="status"
      aria-label="Loading records"
    >
      <div className="flex gap-4 border-b border-border bg-surface-muted px-4 py-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-3 w-20" />
      </div>
      {items.map((index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="ml-auto h-5 w-16 rounded-sm" />
        </div>
      ))}
    </div>
  )
}
