import type { ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/cn'

/**
 * One titled block of a page-level form — a `Card` with a heading, an optional
 * description, and a content slot.
 *
 * The counterpart to `features/settings/SettingsCard`: that one owns its own
 * `<form>`, footer and save state because settings save per-card; this one is
 * presentation only, so a page can wrap several `FormSection`s in a single
 * `<form>` (staff provisioning) or put one inside a per-card `<form>`
 * (account & security).
 *
 * `plan.md §5.4`: section title is H3, description is muted body, and the
 * heading is a real `<h2>` so the page's sections sit in the document outline
 * beneath the one `<h1>` in `PageHeader`.
 */
export function FormSection({
  title,
  titleId,
  description,
  children,
  /** Heading level — `h2` under a `PageHeader` h1; override only when nested. */
  as: Heading = 'h2',
  className,
  contentClassName,
}: {
  title: string
  /** `id` on the heading, for a control inside that needs `aria-labelledby`. */
  titleId?: string
  description?: ReactNode
  children: ReactNode
  as?: 'h2' | 'h3'
  className?: string
  contentClassName?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle asChild className="text-h3">
          <Heading id={titleId}>{title}</Heading>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  )
}

/**
 * The standard two-column field grid inside a `FormSection` — one column below
 * `md`, two above (`plan.md §6.2`). A field that must span the full width
 * declares `className="md:col-span-2"`.
 *
 * `gap-x-6 gap-y-5`: 24px between columns, 20px between rows — the rhythm the
 * forms in this app already use, now in one place.
 */
export function FormGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid gap-x-6 gap-y-5 md:grid-cols-2', className)}>
      {children}
    </div>
  )
}
