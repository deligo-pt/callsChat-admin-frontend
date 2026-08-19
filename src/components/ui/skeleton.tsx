import { cn } from '@/lib/cn'

/**
 * Content placeholder.
 *
 * Uses the neutral sunken surface, NOT `bg-accent` — the shadcn default maps
 * to the light-blue accent in our token set, which reads as a loud UI element
 * rather than an absent one.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-surface-sunken', className)}
      {...props}
    />
  )
}

export { Skeleton }
