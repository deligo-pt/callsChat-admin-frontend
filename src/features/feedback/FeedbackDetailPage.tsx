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
 * The report and the reply stream stay a single reading column at every
 * breakpoint — that content is prose an operator has to read carefully, and a
 * second column of it would compete with the first. `Triage` is the one part
 * of the page that is not prose (a value beside the control that changes it),
 * so at `lg` and up it moves into a narrow sticky rail instead — see the grid
 * below.
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
    <div className="max-w-6xl space-y-6">
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
       * Main content + a narrow sticky rail (plan.md §6.2 detail-page
       * pattern), not a second column of prose. The report and the reply
       * stream keep the fixed order they always had — read what happened,
       * then see what has been said, then what has been done. `Triage`
       * carries the moment the decision gets made, and putting it in the
       * rail means it stays visible the whole time an operator is reading
       * and replying, not just at the one point it used to sit between them.
       *
       * Below `lg` there is no rail: everything stacks, main content first,
       * then Triage — the same order a screen reader or keyboard user meets
       * it here, which is why nothing needs an explicit `order-*` override.
       */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-6">
          <ReportCard ticket={ticket} />
          <ReplyStream ticket={ticket} />
          <HistoryCard ticket={ticket} />
        </div>

        <div className="mt-6 min-w-0 lg:sticky lg:top-8 lg:mt-0">
          <TriageCard ticket={ticket} />
        </div>
      </div>
    </div>
  )
}
