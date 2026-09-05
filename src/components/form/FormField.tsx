import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * One labelled control — label, optional hint, error, and the ARIA that ties
 * them together.
 *
 * Promoted out of `features/settings` in A2, where it began life as
 * `SettingsField`. Staff provisioning needs exactly the same field, and a
 * feature may not import a sibling feature — so the shared half moves here,
 * which is what the lint rule's own message prescribes (plan.md §7).
 *
 * Its ARIA wiring lives in `fieldAria.ts`: a module exporting both a component
 * and a plain function breaks Fast Refresh.
 */

/**
 * plan.md §5.4: labels above inputs, left-aligned, never inline. The hint sits
 * beneath the control and states the rule **before** the operator hits it —
 * discovering a bound by rejection is the pattern this whole module avoids.
 */
export function FormField({
  id,
  label,
  hint,
  error,
  required = false,
  children,
  className,
}: {
  id: string
  label: string
  hint?: ReactNode
  error?: string | undefined
  required?: boolean
  children: ReactNode
  className?: string
}) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={id} className="text-body-strong block">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {' *'}
          </span>
        ) : null}
      </label>

      {children}

      {hint && !error ? (
        <p id={hintId} className="text-caption text-foreground-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
