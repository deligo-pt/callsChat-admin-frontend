import * as React from 'react'

import { cn } from '@/lib/cn'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-body transition-colors placeholder:text-foreground-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
