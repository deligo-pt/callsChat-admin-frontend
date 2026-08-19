import type { ComponentProps, ElementType, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Typography primitives for the plan.md §5.2 scale.
 *
 * Using these instead of raw `text-*` classes keeps the scale enforceable:
 * changing a level is a one-file edit, and no page invents a heading size.
 */

type TextProps<T extends ElementType> = {
  as?: T
  className?: string
  children?: ReactNode
} & Omit<ComponentProps<T>, 'as' | 'className' | 'children'>

export function PageTitle({ as, className, ...props }: TextProps<ElementType>) {
  const Comp = as ?? 'h1'
  return <Comp className={cn('text-h1', className)} {...props} />
}

export function SectionTitle({ as, className, ...props }: TextProps<ElementType>) {
  const Comp = as ?? 'h2'
  return <Comp className={cn('text-h2', className)} {...props} />
}

export function CardTitle({ as, className, ...props }: TextProps<ElementType>) {
  const Comp = as ?? 'h3'
  return <Comp className={cn('text-h3', className)} {...props} />
}

export function SubTitle({ as, className, ...props }: TextProps<ElementType>) {
  const Comp = as ?? 'h4'
  return <Comp className={cn('text-h4', className)} {...props} />
}

export function Body({ as, className, ...props }: TextProps<ElementType>) {
  const Comp = as ?? 'p'
  return <Comp className={cn('text-body', className)} {...props} />
}

export function Muted({ as, className, ...props }: TextProps<ElementType>) {
  const Comp = as ?? 'p'
  return (
    <Comp className={cn('text-body text-foreground-muted', className)} {...props} />
  )
}

export function Caption({ as, className, ...props }: TextProps<ElementType>) {
  const Comp = as ?? 'p'
  return (
    <Comp className={cn('text-caption text-foreground-muted', className)} {...props} />
  )
}

/** Column labels, badge text, metadata headings. */
export function Overline({ as, className, ...props }: TextProps<ElementType>) {
  const Comp = as ?? 'span'
  return (
    <Comp
      className={cn('text-overline text-foreground-subtle uppercase', className)}
      {...props}
    />
  )
}

/** IDs, correlation IDs, ledger references. */
export function Mono({ as, className, ...props }: TextProps<ElementType>) {
  const Comp = as ?? 'span'
  return <Comp className={cn('font-mono text-caption', className)} {...props} />
}
