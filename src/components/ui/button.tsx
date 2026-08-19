import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2Icon } from 'lucide-react'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * Button variants per plan.md §1A.
 *
 * `default` and `destructive` are retained as aliases so shadcn primitives
 * that reference them keep working; `primary` and `danger` are the names used
 * in application code.
 *
 * The base includes `touch-target`, which enforces the 44px minimum below the
 * lg breakpoint (plan.md §6.3) — every button in the app satisfies it without
 * each caller remembering to.
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md',
    'text-body font-medium whitespace-nowrap',
    'touch-target transition-colors outline-none',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
        default:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
        secondary:
          'border border-border bg-surface-muted text-foreground hover:bg-surface-sunken',
        outline:
          'border border-border-strong bg-surface text-foreground hover:bg-surface-muted',
        ghost: 'text-foreground hover:bg-surface-muted',
        danger: 'bg-danger text-foreground-inverse hover:bg-danger-hover',
        destructive: 'bg-danger text-foreground-inverse hover:bg-danger-hover',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: "h-8 gap-1.5 px-3 text-caption has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        md: 'h-9 px-4 has-[>svg]:px-3',
        default: 'h-9 px-4 has-[>svg]:px-3',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9 px-0',
        'icon-sm': "size-8 px-0 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-lg': 'size-10 px-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render as the child element (Radix Slot) instead of a <button>. */
  asChild?: boolean
  /** Shows a spinner, disables interaction and marks the control busy. */
  loading?: boolean
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  const isDisabled = disabled === true || loading

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && !asChild ? (
        <Loader2Icon className="animate-spin" aria-hidden="true" />
      ) : null}
      {children}
    </Comp>
  )
}

export { Button, buttonVariants }
