import { AlertTriangle } from 'lucide-react'
import type { FormEventHandler, ReactNode } from 'react'

import { CopyableId, DateTime } from '@/components/display'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/cn'

import { formLevelMessage } from './cardError'

/**
 * The one card chrome every settings section uses
 * (system_settings_plan.md §5.3).
 *
 * Built once, deliberately, because eight sections written independently would
 * end up with eight subtly different ideas of where the save button sits, when
 * it is disabled, and how a server rejection is shown. The page has to read as
 * one system.
 *
 * **Save is per card, never per page.** The API is four separate `PATCH`
 * routes; a single page-level save would have to fire four requests and could
 * half-succeed with no honest way to report which half. One card, one
 * endpoint, one button.
 */

export interface SettingsCardProps {
  title: string
  /** What this section controls, and for whom. One or two lines. */
  description?: string
  children: ReactNode

  /** Omit for a read-only section — the footer then carries no actions. */
  onSubmit?: FormEventHandler<HTMLFormElement>
  onDiscard?: () => void
  isDirty?: boolean
  isSaving?: boolean
  saveLabel?: string

  /** Rejection from the last save attempt, rendered above the fields. */
  error?: unknown
  /** Confirmation from the last successful save. */
  successMessage?: string | null

  /** `updatedAt` / `updatedBy` from the settings record. */
  updatedAt?: string | null
  updatedBy?: string | null

  /** Rendered left of the save cluster — e.g. an extra secondary action. */
  footerExtra?: ReactNode
  className?: string
  tone?: 'default' | 'danger'
}

export function SettingsCard({
  title,
  description,
  children,
  onSubmit,
  onDiscard,
  isDirty = false,
  isSaving = false,
  saveLabel = 'Save changes',
  error,
  successMessage,
  updatedAt,
  updatedBy,
  footerExtra,
  className,
  tone = 'default',
}: SettingsCardProps) {
  const formError = formLevelMessage(error)
  const isReadOnly = !onSubmit

  const body = (
    <>
      <CardHeader>
        {/*
         * `asChild` so the card title is a real `h2`. The page has one `h1`
         * (the PageHeader), and every section beneath it needs to sit in the
         * document outline — otherwise a screen-reader user has no way to
         * navigate between eight settings sections.
         */}
        <CardTitle asChild className="text-h3">
          <h2>{title}</h2>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {formError ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        {children}
      </CardContent>

      <CardFooter
        className={cn(
          'flex flex-col items-stretch gap-3 border-t border-border pt-4',
          'sm:flex-row sm:items-center sm:justify-between',
        )}
      >
        <p className="min-w-0 text-caption text-foreground-muted">
          {updatedAt ? (
            <>
              <span>Updated </span>
              <DateTime value={updatedAt} className="text-caption" />
              {updatedBy ? (
                <>
                  {' by '}
                  {/*
                   * A bare admin ID is all the API returns for `updatedBy` —
                   * no name, no email (system_settings_plan.md §8 O2). Showing
                   * it truncated and copyable is more useful than hiding it:
                   * an operator can at least trace who made the change.
                   */}
                  <CopyableId value={updatedBy} maxLength={14} label="Updated by" />
                </>
              ) : null}
            </>
          ) : (
            <span>Not changed since this environment was set up.</span>
          )}
          {successMessage ? (
            <span className="block text-success-foreground">{successMessage}</span>
          ) : null}
        </p>

        {isReadOnly ? (
          footerExtra
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            {footerExtra}
            {isDirty && onDiscard ? (
              <Button type="button" variant="ghost" onClick={onDiscard}>
                Discard
              </Button>
            ) : null}
            <Button type="submit" loading={isSaving} disabled={!isDirty}>
              {saveLabel}
            </Button>
          </div>
        )}
      </CardFooter>
    </>
  )

  return (
    <Card
      className={cn(
        tone === 'danger' && 'border-danger/40',
        // Space for the sticky footer on mobile is the page's job, not ours.
        className,
      )}
    >
      {isReadOnly ? (
        body
      ) : (
        /*
         * `flex flex-col gap-6` restates what `Card` already applies to its
         * own children. Wrapping them in a form makes the form the only child,
         * so the card's gap collapses and header, fields and footer end up
         * touching each other.
         */
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          {body}
        </form>
      )}
    </Card>
  )
}
