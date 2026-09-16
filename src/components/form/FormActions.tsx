import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * The action row at the foot of a page-level form.
 *
 * `plan.md §5.4` / §6.2: primary action right, secondary left of it; on a
 * phone the buttons stack full-width with the primary on top
 * (`flex-col-reverse` — the primary is the last child).
 *
 * `sticky` keeps the row in view on a long form (staff provisioning is four
 * sections tall). It pins to the bottom of `<main>`, which is the app's only
 * vertical scroll container (`AdminLayout`), and the frosted background lets
 * the last field scroll under it rather than being hidden behind it.
 */
export function FormActions({
  children,
  sticky = false,
  className,
}: {
  children: ReactNode
  sticky?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-2 sm:[&>*]:w-auto',
        sticky &&
          'sticky bottom-0 z-10 -mx-4 border-t border-border bg-surface/95 px-4 py-4 backdrop-blur md:-mx-6 md:px-6',
        className,
      )}
    >
      {children}
    </div>
  )
}
