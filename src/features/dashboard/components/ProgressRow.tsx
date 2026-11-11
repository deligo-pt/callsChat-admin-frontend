import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'

import { share } from './helpers'

/**
 * A labelled bar: count, share of the total, and a filled track (plan.md §3,
 * the "Popular categories" look from the reference).
 *
 * The share is computed here only to size the bar and print a percentage; the
 * counts themselves come straight from the server. A zero total draws empty
 * tracks rather than dividing by zero.
 *
 * The fill animates its width once, on mount (off under reduced motion).
 */

export type BarTone =
  'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral' | 'locked'

const FILL: Record<BarTone, string> = {
  primary: 'bg-primary',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-neutral',
  locked: 'bg-locked',
}

export function ProgressRow({
  label,
  count,
  total,
  tone = 'primary',
}: {
  label: string
  count: number
  total: number
  tone?: BarTone
}) {
  const ratio = share(count, total)
  const percent = Math.round(ratio * 1000) / 10
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-body">
        <span className="min-w-0 truncate text-foreground">{label}</span>
        <span className="shrink-0 text-caption text-foreground-muted tabular-nums">
          <span className="font-medium text-foreground">{formatCount(count)}</span>
          {' · '}
          {percent.toLocaleString(undefined, { maximumFractionDigits: 1 })}%
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-sunken"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={count}
        aria-valuetext={`${formatCount(count)} of ${formatCount(total)}`}
      >
        <div
          className={cn(
            'h-full animate-in rounded-full duration-700 ease-out slide-in-from-left-[100%] motion-reduce:animate-none',
            FILL[tone],
          )}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
    </div>
  )
}
