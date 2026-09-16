import * as React from 'react'

import { cn } from '@/lib/cn'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-body transition-colors selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-body file:font-medium file:text-foreground placeholder:text-foreground-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
