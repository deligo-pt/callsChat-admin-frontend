import { useState } from 'react'

import { DateTime, StatusBadge } from '@/components/display'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatCount } from '@/lib/format'
import type { Feedback, FeedbackStatusHistory } from '@/types/feedback'

/**
 * Every status change this ticket has been through
 * (feedback_management_plan.md §5.4, §3.10).
 *
 * ⚠️ **Unbounded and unpaginated.** There is no delete route for a ticket, a
 * reply, an attachment or a history row, and the detail payload returns every
 * row inline — a ticket churned through fifteen transitions returned all
 * fifteen, and would return five hundred if it got them.
 *
 * So the card renders the newest **five** and puts the rest behind a
 * disclosure. Without that, one pathological ticket pushes the conversation
 * off the screen and the operator scrolls past an audit log to reach the thing
 * they came to read.
 *
 * Newest first — the opposite of `ReplyStream`, and deliberately so: this is an
 * audit log, and the question it answers is *what happened most recently*.
 */

const VISIBLE_ROWS = 5

function byNewestFirst(a: FeedbackStatusHistory, b: FeedbackStatusHistory): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt)
}

function HistoryRow({ entry }: { entry: FeedbackStatusHistory }) {
  /*
   * `changedBy` is expanded on the detail route and **absent** from the partial
   * transition response (§3.2), so it is optional in the schema and the row has
   * to cope. It never renders a bare id: an id tells an operator nothing they
   * can act on, and "an administrator" is at least true.
   */
  const actor = entry.changedBy?.profile?.displayName ?? entry.changedBy?.email

  return (
    <li className="space-y-1.5 border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <StatusBadge domain="feedback" value={entry.fromStatus} />
        <span className="text-foreground-subtle" aria-hidden="true">
          →
        </span>
        <StatusBadge domain="feedback" value={entry.toStatus} />
        <span className="text-caption text-foreground-muted">
          <DateTime value={entry.createdAt} relative />
        </span>
      </div>

      <p className="text-caption text-foreground-muted">
        by {actor ?? 'an administrator'}
      </p>

      {/*
       * ⚠️ Unlike the staff module's write-only `reason`, this note **is**
       * readable afterwards — it is stored on the history row alongside
       * `changedBy`. That is why F3's dialog copy is allowed to promise a
       * record: there genuinely is one, and this is where it surfaces.
       */}
      {entry.note ? (
        <p className="max-w-prose text-body wrap-anywhere whitespace-pre-wrap">
          {entry.note}
        </p>
      ) : (
        <p className="text-caption text-foreground-subtle">No note was recorded.</p>
      )}
    </li>
  )
}

export function HistoryCard({ ticket }: { ticket: Feedback }) {
  const [expanded, setExpanded] = useState(false)

  const history = [...(ticket.statusHistory ?? [])].sort(byNewestFirst)
  const hidden = Math.max(0, history.length - VISIBLE_ROWS)
  const shown = expanded ? history : history.slice(0, VISIBLE_ROWS)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status history</CardTitle>
        <CardDescription>
          Every change to this ticket&rsquo;s status, newest first. Nothing here can be
          removed.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {history.length === 0 ? (
          <p className="text-body text-foreground-muted">
            {/*
             * A ticket nobody has triaged has no history at all. Saying so
             * beats an empty box, and it is the same fact the queue's
             * `PENDING` badge carries.
             */}
            No status changes yet — this ticket is exactly as it was filed.
          </p>
        ) : (
          <>
            <ul className="space-y-3">
              {shown.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
            </ul>

            {hidden > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpanded((current) => !current)}
                aria-expanded={expanded}
              >
                {expanded
                  ? 'Show fewer changes'
                  : `Show all ${formatCount(history.length)} changes`}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
