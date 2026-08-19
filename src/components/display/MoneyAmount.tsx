import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'

export interface MoneyAmountProps {
  /** Integer amount in the currency's smallest unit. Never a float. */
  minorUnits: number
  /** ISO 4217 code, e.g. "USD". */
  currency: string
  size?: 'sm' | 'md' | 'lg'
  /** Fee lines and deductions read better with an explicit minus. */
  signed?: boolean
  /** Show the ISO code instead of the symbol — clearer in mixed-currency tables. */
  showCode?: boolean
  className?: string
}

const SIZE_CLASSES = {
  sm: 'text-caption',
  md: 'text-body',
  lg: 'text-h2',
} as const

/**
 * Display a money amount from integer minor units.
 *
 * plan.md §3.3: this formats a backend-provided value. It never computes a
 * total, a fee, or a net — those arrive already calculated.
 */
export function MoneyAmount({
  minorUnits,
  currency,
  size = 'md',
  signed = false,
  showCode = false,
  className,
}: MoneyAmountProps) {
  const formatted = formatMoney(minorUnits, currency, {
    display: showCode ? 'code' : 'symbol',
  })

  return (
    <span className={cn('tabular font-medium', SIZE_CLASSES[size], className)}>
      {signed && minorUnits > 0 ? '+' : ''}
      {formatted}
    </span>
  )
}
