import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * One labelled control.
 *
 * Separate from `SettingsCard` so each settings section can compose fields
 * without importing the whole card. Its ARIA wiring lives in `fieldAria.ts` —
 * a module exporting both components and plain functions breaks Fast Refresh.
 */

/**
 * plan.md §5.4: labels above inputs, left-aligned, never inline. The hint sits
 * beneath the control and states the rule **before** the operator hits it —
 * discovering a bound by rejection is the pattern this whole module avoids.
 */
export function SettingsField({
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
