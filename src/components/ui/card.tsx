import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'

import { cn } from '@/lib/cn'

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-4 rounded-lg border bg-card py-4 text-foreground shadow-sm md:gap-6 md:py-6',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] md:px-6 [.border-b]:pb-4 md:[.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  )
}

/**
 * `asChild` lets a caller supply the real element — usually a heading.
 *
 * A card title is very often a section heading, and rendering it as a bare
 * `div` leaves the page with no structure for screen-reader navigation. The
 * default stays a `div` so decorative titles are not forced into the heading
 * outline.
 */
function CardTitle({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'div'> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'div'
  return (
    <Component
      data-slot="card-title"
      className={cn('text-h4 leading-none', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-body text-foreground-muted', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className,
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-4 md:px-6', className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center px-4 md:px-6 [.border-t]:pt-4 md:[.border-t]:pt-6',
        className,
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
