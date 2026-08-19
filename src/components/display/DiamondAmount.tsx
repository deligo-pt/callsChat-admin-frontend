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
  className?: string
}

const VARIANT_CLASSES = {
  available: 'text-success',
  locked: 'text-locked',
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
      <span className="sr-only">
        {' '}
        Diamonds
        {variant === 'locked'
          ? ', locked'
          : variant === 'available'
            ? ', available'
            : ''}
      </span>
    </span>
  )
}
