import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { maskValue, type MaskKind } from '@/lib/mask'

export interface MaskedValueProps {
  value: string
  kind: MaskKind
  /**
   * Whether the acting admin holds the permission that allows revealing this
   * value. Defaults to false — masked is the default state (plan.md §3.9).
   */
  canReveal?: boolean
  /**
   * Called when the operator reveals the value. Reveals of sensitive fields
   * are auditable events; the feature supplies the handler that records one.
   */
  onReveal?: () => void
  className?: string
}

/**
 * Render a sensitive value masked, with an optional permission-gated reveal.
 *
 * plan.md §3.9: masking here is presentation only. It is NOT a substitute for
 * backend field-level authorization — a value the operator must not see should
 * never be sent to the browser in the first place.
 */
export function MaskedValue({
  value,
  kind,
  canReveal = false,
  onReveal,
  className,
}: MaskedValueProps) {
  const [revealed, setRevealed] = useState(false)

  function handleToggle() {
    if (!canReveal) return
    const next = !revealed
    setRevealed(next)
    if (next) onReveal?.()
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('tabular', revealed ? 'font-mono text-mono' : undefined)}>
        {revealed ? value : maskValue(kind, value)}
      </span>

      {canReveal ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleToggle}
              aria-pressed={revealed}
              aria-label={revealed ? 'Hide value' : 'Reveal value'}
            >
              {revealed ? <EyeOff /> : <Eye />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {revealed ? 'Hide' : 'Reveal — this action is recorded'}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  )
}
