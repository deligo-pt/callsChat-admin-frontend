import { Check, Copy } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard'
import { truncateMiddle } from '@/lib/mask'

export interface CopyableIdProps {
  value: string
  /** Characters to show before truncating the middle. */
  maxLength?: number
  /** Optional label read by screen readers, e.g. "Correlation ID". */
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Display an opaque identifier.
 *
 * plan.md §6.3: long identifiers truncate with a middle ellipsis and offer a
 * copy button — they never wrap and never break a grid. The full value stays
 * reachable through the tooltip and the clipboard.
 */
export function CopyableId({
  value,
  maxLength = 18,
  label,
  size = 'sm',
  className,
}: CopyableIdProps) {
  const { copied, copy } = useCopyToClipboard()
  const display = truncateMiddle(value, maxLength)
  const isTruncated = display !== value

  return (
    <span className={cn('inline-flex max-w-full items-center gap-1', className)}>
      {label ? <span className="sr-only">{label}: </span> : null}

      {isTruncated ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <code
              className={cn(
                'truncate-id cursor-help font-mono text-foreground-muted',
                size === 'sm' ? 'text-mono' : 'text-body',
              )}
            >
              {display}
            </code>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs break-all">{value}</TooltipContent>
        </Tooltip>
      ) : (
        <code
          className={cn(
            'truncate-id font-mono text-foreground-muted',
            size === 'sm' ? 'text-caption' : 'text-body',
          )}
        >
          {display}
        </code>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => void copy(value)}
        aria-label={copied ? 'Copied' : `Copy ${label ?? 'identifier'}`}
        className="shrink-0"
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
    </span>
  )
}
