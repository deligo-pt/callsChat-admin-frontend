import { AlertTriangle, Lock, RotateCw } from 'lucide-react'
import { useId, type CSSProperties, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

/**
 * One block of the dashboard (plan.md §3): a card with a title, an optional
 * action, and its **own** loading and error states.
 *
 * Each section reads its own source, so one failing endpoint shows a small
 * error with Retry in its own card and never blanks the page around it.
 */
export function DashboardSection({
  title,
  description,
  action,
  loading = false,
  error,
  errorTone = 'danger',
  onRetry,
  skeleton,
  children,
  className,
  style,
}: {
  title: string
  description?: string | undefined
  action?: ReactNode
  loading?: boolean
  error?: string | null | undefined
  /** `muted` for problems that are not failures, such as no access (DB5). */
  errorTone?: 'danger' | 'muted' | undefined
  onRetry?: (() => void) | undefined
  skeleton?: ReactNode
  children?: ReactNode
  className?: string | undefined
  style?: CSSProperties | undefined
}) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={loading || undefined}
      className={cn(
        'flex min-w-0 flex-col rounded-xl border border-border bg-card p-5 shadow-sm',
        className,
      )}
      style={style}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-h3 text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-caption text-foreground-muted">{description}</p>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 items-center gap-2">{action}</div>
        ) : null}
      </header>

      <div className="min-w-0 flex-1">
        {error ? (
          <SectionError message={error} onRetry={onRetry} tone={errorTone} />
        ) : loading ? (
          (skeleton ?? null)
        ) : (
          children
        )}
      </div>
    </section>
  )
}

export function SectionError({
  message,
  onRetry,
  tone = 'danger',
}: {
  message: string
  onRetry?: (() => void) | undefined
  tone?: 'danger' | 'muted' | undefined
}) {
  const muted = tone === 'muted'
  const Icon = muted ? Lock : AlertTriangle
  return (
    <div
      /* A failure interrupts; a missing permission is just information. */
      role={muted ? 'status' : 'alert'}
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 text-caption',
        muted
          ? 'bg-surface-sunken text-foreground-muted'
          : 'bg-danger-soft text-danger-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> Retry
        </Button>
      ) : null}
    </div>
  )
}
