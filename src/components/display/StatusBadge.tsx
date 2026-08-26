import { cn } from '@/lib/cn'
import {
  resolveStatus,
  TONE_CLASSES,
  TONE_DOT_CLASSES,
  type StatusDomain,
  type StatusTone,
} from '@/lib/status'

export interface StatusBadgeProps {
  /** Which enum family the value belongs to. */
  domain: StatusDomain
  /** The raw backend enum value, e.g. "UNDER_REVIEW". */
  value: string
  /** Compact dot + label, for dense table rows. */
  variant?: 'badge' | 'dot'
  className?: string
}

/**
 * The only way a status is rendered in this application.
 *
 * plan.md §3.7: it takes a backend enum and a domain — never a colour, never a
 * label. An unknown value degrades to a neutral badge rather than breaking.
 */
export function StatusBadge({
  domain,
  value,
  variant = 'badge',
  className,
}: StatusBadgeProps) {
  const { label, tone } = resolveStatus(domain, value)

  if (variant === 'dot') {
    return (
      <span
        className={cn('inline-flex items-center gap-2 whitespace-nowrap', className)}
      >
        <span
          className={cn('size-2 shrink-0 rounded-full', TONE_DOT_CLASSES[tone])}
          aria-hidden="true"
        />
        <span className="text-body">{label}</span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        /*
         * `whitespace-nowrap`: a two-word status like "Pending verification"
         * wrapped onto two lines, which made that row taller than its
         * neighbours and left the whole table looking ragged.
         */
        'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-overline whitespace-nowrap uppercase',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </span>
  )
}

export type { StatusTone }
