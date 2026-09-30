import { DateTime } from '@/components/display'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { Verification, VerificationAuditLog } from '@/types/verification'
import { useActorName } from '@/lib/hooks/useActorName'

import { describeAuditAction } from '../labels'

/**
 * Who did what, and when (plan.md §5.6).
 *
 * ⚠️ **Not `components/display/AuditTimeline`.** That component's `AuditEntry`
 * has no slot for request metadata, and the only way to reuse it would have
 * been to force IP addresses into its `changes` array — which is a
 * before/after field snapshot, so an IP would render as a value that had been
 * *changed to*. Wrong on screen and wrong in meaning. A local timeline is the
 * smaller mistake than bending a shared one.
 *
 * ⚠️ **`ipAddress` and `userAgent` sit behind a disclosure** (§3.7). They are
 * personal data about a colleague, on a screen several people can see. Present
 * because an investigation needs them; not on display because a routine review
 * does not. The same instinct as `MaskedValue`: available on purpose, not by
 * accident.
 *
 * ⚠️ **Rows are rendered in the order the service returns them — newest
 * first** — and are not re-sorted. That is the opposite of a reply stream, and
 * re-sorting would be inventing an ordering the audit trail did not assert.
 */

function RequestDetails({ entry }: { entry: VerificationAuditLog }) {
  if (!entry.ipAddress && !entry.userAgent) return null

  return (
    <details className="group mt-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-caption text-foreground-muted underline underline-offset-2 hover:text-foreground">
        Show request details
      </summary>
      <dl className="mt-1.5 space-y-1 rounded-md border border-border bg-surface-muted px-3 py-2">
        {entry.ipAddress ? (
          <div className="flex flex-wrap gap-x-2 text-caption">
            <dt className="text-foreground-subtle">IP address</dt>
            <dd className="font-mono wrap-anywhere">{entry.ipAddress}</dd>
          </div>
        ) : null}
        {entry.userAgent ? (
          <div className="flex flex-wrap gap-x-2 text-caption">
            <dt className="text-foreground-subtle">User agent</dt>
            <dd className="font-mono wrap-anywhere">{entry.userAgent}</dd>
          </div>
        ) : null}
      </dl>
    </details>
  )
}

/**
 * The one metadata key worth surfacing inline.
 *
 * `metadata` has a different shape per action (§2.4), so it is not rendered
 * wholesale — a raw JSON blob in an audit trail is noise that trains people to
 * skip the whole card. `VIEWED_DOCUMENT` is the exception: *which* document was
 * opened is the substance of that row.
 */
function viewedDocumentName(entry: VerificationAuditLog): string | null {
  if (entry.action !== 'VIEWED_DOCUMENT') return null
  const name = entry.metadata?.['originalName']
  return typeof name === 'string' ? name : null
}

export function AuditTimeline({ record }: { record: Verification }) {
  const actorName = useActorName()
  const entries = record.auditLogs ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>Newest first. This trail cannot be edited.</CardDescription>
      </CardHeader>

      <CardContent>
        {entries.length === 0 ? (
          /*
           * ⚠️ A live state, and a strange one: one business application
           * returned zero audit rows — not even the `SUBMITTED` that created it
           * (§3.5, backend ask #4). Named rather than rendered as an empty list,
           * because "nothing has happened" and "nothing was recorded" are
           * different facts and only the second is true here.
           */
          <p className="text-body text-foreground-muted">
            No history was recorded for this application — not even its submission.
          </p>
        ) : (
          <ol className="space-y-0">
            {entries.map((entry, index) => {
              const isLast = index === entries.length - 1
              const documentName = viewedDocumentName(entry)

              return (
                <li key={entry.id} className="flex gap-3 sm:gap-4">
                  <div className="flex shrink-0 flex-col items-center">
                    <span
                      className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                    {!isLast ? (
                      <span className="w-px flex-1 bg-border" aria-hidden="true" />
                    ) : null}
                  </div>

                  <div
                    className={isLast ? 'min-w-0 flex-1 pb-0' : 'min-w-0 flex-1 pb-6'}
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <p className="text-body font-medium">
                        {describeAuditAction(entry.action)}
                      </p>
                      <DateTime
                        value={entry.createdAt}
                        variant="precise"
                        className="shrink-0 text-caption text-foreground-muted"
                      />
                    </div>

                    {documentName ? (
                      <p className="mt-0.5 text-caption wrap-anywhere text-foreground-muted">
                        {documentName}
                      </p>
                    ) : null}

                    {/*
                     * ⚠️ The audit rows carry `actorId` only — no route on this
                     * module expands it. `useActorName` resolves it from the
                     * signed-in admin and the staff directory, and falls back to
                     * the raw id, which is honest: inventing "An admin" would
                     * hide that two different people may be involved.
                     *
                     * ⚠️ **The `SUBMITTED` row will not resolve**, and that is
                     * correct. Its actor is the *applicant* — an ordinary user,
                     * absent from the staff directory — so it keeps its id
                     * rather than borrowing a colleague's name.
                     */}
                    {entry.actorId ? (
                      <p className="mt-0.5 truncate-id text-caption text-foreground-muted">
                        by {actorName(entry.actorId) ?? entry.actorId}
                      </p>
                    ) : null}

                    <RequestDetails entry={entry} />
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
