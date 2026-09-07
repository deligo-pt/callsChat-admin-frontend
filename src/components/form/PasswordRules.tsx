import { Check, X } from 'lucide-react'

import { cn } from '@/lib/cn'
import { PASSWORD_RULES } from '@/lib/passwordPolicy'

/**
 * The password policy as a live checklist.
 *
 * Stated up front rather than discovered by rejection — the operator can see
 * which rules a password already satisfies while typing it, instead of
 * submitting and being told.
 *
 * Each row carries an `sr-only` verdict because the tick and the cross are the
 * only thing distinguishing met from unmet, and both are `aria-hidden`.
 */
export function PasswordRules({
  value,
  id,
  className,
}: {
  value: string
  id?: string
  className?: string
}) {
  return (
    <ul id={id} className={cn('space-y-1', className)}>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.met(value)
        return (
          <li
            key={rule.label}
            className={cn(
              'flex items-center gap-2 text-caption',
              met ? 'text-success-foreground' : 'text-foreground-muted',
            )}
          >
            {met ? (
              <Check className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <X className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
            )}
            {rule.label}
            <span className="sr-only">{met ? ' — met' : ' — not yet met'}</span>
          </li>
        )
      })}
    </ul>
  )
}
