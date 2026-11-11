import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Minus,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'

import { CountUp } from './CountUp'

/**
 * A KPI card (plan.md §3): label, big number, a round icon badge on a soft
 * tone, and an optional change chip and link.
 *
 * Tones are the design system's, never raw colours (D3). `attention` gives the
 * card a warning edge for numbers someone should act on, e.g. flagged users.
 */

export type Tone = 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'locked'

const BADGE: Record<Tone, string> = {
  primary: 'bg-primary-soft text-primary-700',
  accent: 'bg-info-soft text-info-foreground',
  success: 'bg-success-soft text-success-foreground',
  warning: 'bg-warning-soft text-warning-foreground',
  danger: 'bg-danger-soft text-danger-foreground',
  locked: 'bg-locked-soft text-locked-foreground',
}

export function IconBadge({
  icon: Icon,
  tone,
  className,
}: {
  icon: LucideIcon
  tone: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-full',
        BADGE[tone],
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="size-5" />
    </span>
  )
}

/**
 * Change against a period. The server sends a percentage already (3.1 = 3.1%,
 * plan.md §1.1); this only formats it. Up is green and down is red unless
 * `upIsBad`, where rising is the bad direction.
 */
export function DeltaChip({
  percent,
  period,
  upIsBad = false,
}: {
  percent: number
  period: string
  upIsBad?: boolean
}) {
  const flat = Math.abs(percent) < 0.05
  const up = percent > 0
  const good = flat ? null : up !== upIsBad
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  const shown = `${up ? '+' : flat ? '' : '−'}${Math.abs(percent).toLocaleString(
    undefined,
    {
      maximumFractionDigits: 1,
    },
  )}%`

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-caption">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums',
          good === null && 'bg-neutral-soft text-neutral-foreground',
          good === true && 'bg-success-soft text-success-foreground',
          good === false && 'bg-danger-soft text-danger-foreground',
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {shown}
      </span>
      <span className="text-foreground-muted">{period}</span>
    </span>
  )
}

export function StatCard({
  label,
  value,
  format = formatCount,
  icon,
  tone = 'primary',
  footer,
  link,
  attention = false,
  loading = false,
  unavailable = false,
  className,
  style,
}: {
  label: string
  value: number | undefined
  format?: (value: number) => string
  icon: LucideIcon
  tone?: Tone
  /** A change chip or a short note under the number. */
  footer?: ReactNode
  link?: { to: string; label: string } | undefined
  attention?: boolean
  loading?: boolean
  /** The source failed with nothing to show: a dash, not an endless skeleton. */
  unavailable?: boolean
  className?: string | undefined
  style?: CSSProperties | undefined
}) {
  return (
    <article
      aria-label={label}
      className={cn(
        'group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md',
        attention ? 'border-warning/50' : 'border-border',
        className,
      )}
      style={style}
    >
      {attention ? (
        /* The card clips to its rounded corners, so this strip follows the curve. */
        <span className="absolute inset-x-0 top-0 h-1 bg-warning" aria-hidden="true" />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <p className="text-body font-medium text-foreground-muted">{label}</p>
        <IconBadge icon={icon} tone={attention ? 'warning' : tone} />
      </div>

      {unavailable ? (
        <div>
          <p
            className="text-3xl leading-none font-semibold text-foreground-muted"
            aria-hidden="true"
          >
            —
          </p>
          <p className="mt-2 text-caption text-foreground-muted">
            Not available right now
          </p>
        </div>
      ) : loading || value === undefined ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      ) : (
        <>
          <CountUp
            value={value}
            format={format}
            className="text-3xl leading-none font-semibold tracking-tight text-foreground"
          />
          {footer ? <div className="min-h-5">{footer}</div> : null}
        </>
      )}

      {link && !loading && !unavailable ? (
        <Link
          to={link.to}
          className="mt-auto inline-flex items-center gap-1 self-start rounded-sm text-caption font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {link.label} <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </article>
  )
}
