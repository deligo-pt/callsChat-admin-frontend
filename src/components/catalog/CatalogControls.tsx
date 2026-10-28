import { ArrowDown, ArrowUp, MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/cn'
import type { Direction } from '@/lib/ordering'

/**
 * Row controls shared by the gift catalog and the emoji packs (phases G2–G4).
 *
 * Promoted out of `features/gifts` in G4: a feature may not import a sibling,
 * and two catalogs with differently-behaving Move buttons would be worse than
 * one with none.
 */

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge
      className={cn(
        'w-fit',
        active
          ? 'bg-success-soft text-success-foreground'
          : 'bg-neutral-soft text-neutral-foreground',
      )}
    >
      {active ? 'Active' : 'Inactive'}
    </Badge>
  )
}

export function MoveButtons({
  name,
  first,
  last,
  busy,
  onMove,
}: {
  name: string
  first: boolean
  last: boolean
  busy: boolean
  onMove: (direction: Direction) => void
}) {
  return (
    <span className="flex shrink-0 gap-1">
      <Button
        size="icon-sm"
        variant="outline"
        aria-label={`Move ${name} up`}
        disabled={first || busy}
        onClick={() => onMove('up')}
      >
        <ArrowUp className="size-4" aria-hidden="true" />
      </Button>
      <Button
        size="icon-sm"
        variant="outline"
        aria-label={`Move ${name} down`}
        disabled={last || busy}
        onClick={() => onMove('down')}
      >
        <ArrowDown className="size-4" aria-hidden="true" />
      </Button>
    </span>
  )
}

export function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={label}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}
