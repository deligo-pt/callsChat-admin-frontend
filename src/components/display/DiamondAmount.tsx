import { Gem, Lock } from 'lucide-react'

import { cn } from '@/lib/cn'
import { formatDiamonds } from '@/lib/format'

export interface DiamondAmountProps {
  /** Whole Diamonds. Fractional Diamonds do not exist. */
  amount: number
  /**
   * plan.md §9: available and locked are always shown as separate figures.
   * A combined number is never presented as spendable.
   */
  variant?: 'available' | 'locked' | 'neutral'
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  /**
   * Write "diamonds" after the figure (default). The gem icon alone did not say
   * what the number counts to anyone who had not learned the icon. Turn it off
   * only where a label right beside the figure already names the unit.
   */
  showUnit?: boolean
  className?: string
}

/*
 * The `-foreground` shades, not the base hues: green-500 and violet-500 as text
 * measure about 3:1 on white, legible only at `lg`. At `md` on the withdrawal
 * page they failed the 4.5:1 floor (withdrawals plan W6 contrast pass).
 */
const VARIANT_CLASSES = {
  available: 'text-success-foreground',
  locked: 'text-locked-foreground',
  neutral: 'text-foreground',
} as const

const SIZE_CLASSES = {
  sm: 'text-caption',
  md: 'text-body',
  lg: 'text-h2',
} as const

const ICON_SIZE = {
  sm: 'size-3',
  md: 'size-3.5',
  lg: 'size-5',
} as const

/**
 * Display a Diamond quantity.
 *
 * Formatting only — this component never adds, subtracts or converts. Any
 * arithmetic on Diamonds happens on the backend (plan.md §3.3).
 */
export function DiamondAmount({
  amount,
  variant = 'neutral',
  size = 'md',
  showIcon = true,
  showUnit = true,
  className,
}: DiamondAmountProps) {
  const Icon = variant === 'locked' ? Lock : Gem

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 tabular font-medium',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {showIcon ? (
        <Icon className={cn('shrink-0', ICON_SIZE[size])} aria-hidden="true" />
      ) : null}
      {formatDiamonds(amount)}
      {showUnit ? (
        <span className="font-normal text-foreground-muted">
          {amount === 1 ? 'diamond' : 'diamonds'}
        </span>
      ) : null}
      <span className="sr-only">
        {showUnit ? '' : ' Diamonds'}
        {variant === 'locked'
          ? ', locked'
          : variant === 'available'
            ? ', available'
            : ''}
      </span>
    </span>
  )
}
