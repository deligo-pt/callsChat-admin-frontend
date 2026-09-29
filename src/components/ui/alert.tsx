import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-body has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-foreground',
        /*
         * `danger-foreground`, not `destructive`.
         *
         * `--color-destructive` is `--color-danger` is `red-500`, which is a
         * FILL colour: as text on the card ground it measures ~3.4:1, below
         * the 4.5:1 AA floor, and the `/90` on the description made it worse.
         * Found by the B5 contrast pass on the bootstrap module's LIVE NOW
         * banner (plan.md B5), and it applies to every destructive alert in
         * the panel — the feedback module's triage error and the reply
         * composer's form error among them.
         *
         * The icon keeps `text-current`, so it follows the same colour.
         */
        destructive:
          'bg-card text-danger-foreground *:data-[slot=alert-description]:text-danger-foreground [&>svg]:text-current',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'col-start-2 line-clamp-1 min-h-4 text-body-strong tracking-tight',
        className,
      )}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'col-start-2 grid justify-items-start gap-1 text-body text-foreground-muted [&_p]:leading-relaxed',
        className,
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
