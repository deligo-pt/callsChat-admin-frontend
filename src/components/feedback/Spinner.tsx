import { cn } from '@/lib/cn'

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  /** Announced to screen readers. Set to null for a purely decorative spinner. */
  label?: string | null
  className?: string
}

const SIZE_CLASSES = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-8 border-[3px]',
} as const

/**
 * Minimal indeterminate spinner in the project's primary blue.
 *
 * Used where there is no content shape to imitate — route transitions, the
 * session bootstrap, inline button states. Data surfaces inside a page still
 * use the content-shaped skeletons in `LoadingState` (plan.md §1D), because
 * there a spinner tells the operator nothing about what is arriving.
 */
export function Spinner({ size = 'md', label = 'Loading', className }: SpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-live={label ? 'polite' : undefined}
      className={cn('inline-flex items-center justify-center', className)}
    >
      <span
        className={cn(
          'animate-spin rounded-full border-border-strong border-t-primary',
          SIZE_CLASSES[size],
        )}
        aria-hidden="true"
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  )
}

export interface RouteFallbackProps {
  /** Fill the viewport — used for the session bootstrap before the shell exists. */
  fullscreen?: boolean
  className?: string
}

/**
 * Fallback for route transitions and the auth bootstrap.
 *
 * Deliberately small and centred: this renders in wildly different containers
 * — the full viewport, the admin content area, and the 28rem login card — so
 * it must not assume a page-sized layout.
 */
export function RouteFallback({ fullscreen = false, className }: RouteFallbackProps) {
  return (
    <div
      className={cn(
        'flex w-full items-center justify-center',
        fullscreen ? 'min-h-dvh' : 'min-h-60 py-12',
        className,
      )}
    >
      <Spinner size="lg" label="Loading" />
    </div>
  )
}
