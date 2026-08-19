import { ArrowRight } from 'lucide-react'

import { CopyableId } from '@/components/display/CopyableId'
import { DateTime } from '@/components/display/DateTime'
import { cn } from '@/lib/cn'

export interface AuditChange {
  readonly field: string
  readonly before: string | null
  readonly after: string | null
}

export interface AuditEntry {
  readonly id: string
  /** Admin who performed the action. */
  readonly actorName: string
  readonly actorRole?: string
  /** Human-readable action, e.g. "Suspended user". */
  readonly action: string
  readonly occurredAt: string
  /** Mandatory reason captured at action time. */
  readonly reason?: string
  /** Redacted before/after snapshot. Never contains secrets or private content. */
  readonly changes?: readonly AuditChange[]
  readonly correlationId?: string
}

export interface AuditTimelineProps {
  entries: readonly AuditEntry[]
  timeZone?: string
  className?: string
}

/**
 * Read-only audit history.
 *
 * plan.md §3: audit data is append-only and rendered with display components
 * only — there are deliberately no form controls in this tree, so an audit
 * entry can never be edited from the UI.
 */
export function AuditTimeline({
  entries,
  timeZone = 'UTC',
  className,
}: AuditTimelineProps) {
  return (
    <ol className={cn('space-y-0', className)}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1

        return (
          <li key={entry.id} className="flex gap-3 sm:gap-4">
            {/* Timestamp rail — collapses on mobile (plan.md §6.2) */}
            <div className="flex shrink-0 flex-col items-center">
              <span
                className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary"
                aria-hidden="true"
              />
              {!isLast ? (
                <span className="w-px flex-1 bg-border" aria-hidden="true" />
              ) : null}
            </div>

            <div className={cn('min-w-0 flex-1', isLast ? 'pb-0' : 'pb-6')}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <p className="text-body font-medium">{entry.action}</p>
                <DateTime
                  value={entry.occurredAt}
                  timeZone={timeZone}
                  variant="precise"
                  className="shrink-0 text-caption text-foreground-muted"
                />
              </div>

              <p className="mt-0.5 text-caption text-foreground-muted">
                {entry.actorName}
                {entry.actorRole ? ` · ${entry.actorRole}` : ''}
              </p>

              {entry.reason ? (
                <p className="mt-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-body">
                  <span className="mr-2 text-overline text-foreground-subtle uppercase">
                    Reason
                  </span>
                  {entry.reason}
                </p>
              ) : null}

              {entry.changes && entry.changes.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {entry.changes.map((change) => (
                    <li
                      key={change.field}
                      className="flex flex-wrap items-center gap-1.5 text-caption"
                    >
                      <span className="text-foreground-subtle">{change.field}:</span>
                      <code className="rounded-sm bg-surface-muted px-1.5 py-0.5 font-mono">
                        {change.before ?? '—'}
                      </code>
                      <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
                      <code className="rounded-sm bg-primary-soft px-1.5 py-0.5 font-mono text-primary-700">
                        {change.after ?? '—'}
                      </code>
                    </li>
                  ))}
                </ul>
              ) : null}

              {entry.correlationId ? (
                <div className="mt-2">
                  <CopyableId
                    value={entry.correlationId}
                    label="Correlation ID"
                    maxLength={24}
                  />
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
