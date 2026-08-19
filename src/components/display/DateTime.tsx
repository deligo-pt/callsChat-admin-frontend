import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import {
  formatDate,
  formatDateTime,
  formatPrecise,
  formatRelative,
} from '@/lib/datetime'

export interface DateTimeProps {
  /** UTC ISO-8601 string from the backend. */
  value: string | Date | null | undefined
  /** IANA timezone to display in. Defaults to UTC so reports are unambiguous. */
  timeZone?: string
  /** `datetime` includes the time; `date` is day-only; `precise` adds seconds. */
  variant?: 'datetime' | 'date' | 'precise'
  /** Show "3 hours ago" instead, with the absolute value in the tooltip. */
  relative?: boolean
  className?: string
}

/**
 * The single timestamp renderer.
 *
 * plan.md §5.4: one format everywhere, always with an explicit timezone. The
 * absolute value is always reachable — a relative time is never the only thing
 * an operator can see, because "3 hours ago" is useless in an audit trail.
 */
export function DateTime({
  value,
  timeZone = 'UTC',
  variant = 'datetime',
  relative = false,
  className,
}: DateTimeProps) {
  if (value == null) {
    return <span className={cn('text-foreground-subtle', className)}>—</span>
  }

  const absolute =
    variant === 'date'
      ? formatDate(value, { timeZone })
      : variant === 'precise'
        ? formatPrecise(value, { timeZone })
        : formatDateTime(value, { timeZone })

  const iso = value instanceof Date ? value.toISOString() : value

  if (relative) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <time dateTime={iso} className={cn('cursor-help tabular', className)}>
            {formatRelative(value)}
          </time>
        </TooltipTrigger>
        <TooltipContent>
          {absolute} {timeZone}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={iso} className={cn('cursor-help tabular', className)}>
          {absolute}
        </time>
      </TooltipTrigger>
      <TooltipContent>
        {formatRelative(value)} · {timeZone}
      </TooltipContent>
    </Tooltip>
  )
}
