import { Link, useParams } from 'react-router'

import { isAppError, NotFoundError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import { PageHeader } from '@/components/display'
import { ErrorState, LoadingState, NotFoundState } from '@/components/feedback'
import { Button } from '@/components/ui/button'

import { HistoryCard } from './detail/HistoryCard'
import { ReplyStream } from './detail/ReplyStream'
import { ReportCard } from './detail/ReportCard'
import { TriageCard } from './detail/TriageCard'
import { TicketHeader } from './detail/TicketHeader'
import { useFeedbackTicketQuery } from './useFeedback'

/**
 * One ticket — `/feedback/:id`. Super Admin only
 * (feedback_management_plan.md §5.4).
 *
 * Triage arrived in F3; the reply composer arrives in F4. Everything drawn
 * here comes from `GET /:id` — **no mutation response is ever rendered**
 * (§3.2), which is why every control invalidates and refetches rather than
 * writing what it got back into the cache.
 *
 * A route rather than a drawer, for two reasons stated in §4.1: it holds a
 * conversation, an attachment list and an audit history — that is a page — and
 * it has to be linkable, because *"take a look at this one"* is the single most
 * common thing an operator wants to say about a ticket.
 *
 * `max-w-4xl` and a single column at every breakpoint. The content here is
 * prose the operator has to read carefully; a wider measure would make the
 * report harder to read, and a second column would compete with it.
 */
export function FeedbackDetailPage() {
  const { id = '' } = useParams()
  const query = useFeedbackTicketQuery(id)

  if (query.isPending) return <LoadingState variant="form" />

  if (query.isError) {
    /*
     * A 404 is a likely, ordinary outcome on this route — more so than
     * anywhere else in the panel. Tickets are linked between colleagues, so a
     * stale bookmark or a pasted id from a deleted environment lands here, and
     * it deserves a real page rather than a generic failure.
     *
     * ⚠️ The server's own message reads `"Feedback ticket not found. not
     * found"` — a doubled suffix (§8 O12). It is not surfaced; the panel says
     * this in its own words.
     */
    if (query.error instanceof NotFoundError) {
      return (
        <NotFoundState
          title="Ticket not found"
          description="This ticket does not exist. It may have been filed against a different environment, or the link may be mistyped — tickets cannot be deleted, so it has not been removed."
          action={
            <Button asChild variant="secondary">
              <Link to={ROUTES.feedback}>Back to feedback</Link>
            </Button>
          }
        />
      )
    }

    return (
      <ErrorState
        title="Ticket could not be loaded"
        description={
          isAppError(query.error)
            ? query.error.message
            : 'The ticket did not load. Nothing has been changed.'
        }
        {...(isAppError(query.error) && query.error.correlationId
          ? { correlationId: query.error.correlationId }
          : {})}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const ticket = query.data

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Feedback', to: ROUTES.feedback },
          /*
           * The subject, not the id. A breadcrumb is for orientation, and an
           * opaque `cmtq…` tells the operator nothing about where they are.
           */
          { label: ticket.subject },
        ]}
      />

      <TicketHeader ticket={ticket} />

      {/*
       * A fixed order that follows how a ticket is actually worked: read what
       * happened, decide what to do about it, see what has been said, then
       * check what has been done. `TriageCard` sits between the report and the
       * conversation because that is the moment the decision is made — after
       * reading the problem, before answering it.
       */}
      <ReportCard ticket={ticket} />
      <TriageCard ticket={ticket} />
      <ReplyStream ticket={ticket} />
      <HistoryCard ticket={ticket} />
    </div>
  )
}
