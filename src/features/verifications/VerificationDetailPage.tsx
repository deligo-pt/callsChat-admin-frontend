import { Link, useParams } from 'react-router'

import { isAppError, NotFoundError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import { DateTime, PageHeader, StatusBadge } from '@/components/display'
import { ErrorState, LoadingState, NotFoundState } from '@/components/feedback'
import { Button } from '@/components/ui/button'

import { ApplicantCard } from './detail/ApplicantCard'
import { AuditTimeline } from './detail/AuditTimeline'
import { DecisionCard } from './detail/DecisionCard'
import { DecisionRecordCard } from './detail/DecisionRecordCard'
import { DocumentList } from './detail/DocumentList'
import { describeIdType } from './labels'
import { resolveSubject, SUBJECT_UNKNOWN_LABEL } from './subject'
import { useVerificationQuery } from './useVerifications'

/**
 * One application — `/verifications/:id` (plan.md §5.3).
 *
 * V2 is the **read-only** half: who applied, what they submitted, what was
 * already decided, and what the audit trail records. The document viewer is V3
 * and the decision controls are V4, and that split is deliberate — this page
 * can ship and be reviewed while nothing in the codebase can yet fetch a
 * decrypted identity document or change a person's verification status.
 *
 * ⚠️ **The layout changed after V5, and the original reasoning was wrong.**
 * V2 shipped a single `max-w-4xl` column, arguing that a two-column layout would
 * put the documents beside the decision rather than before it. On a real desktop
 * that left roughly 40% of the screen empty beside cards holding two fields, and
 * a business application — which carries no documents at all — read as a broken
 * page rather than a sparse one.
 *
 * The concern behind it was still right, so the fix keeps it: **the column that
 * holds the work is untouched.** Who applied, what they sent, what was decided
 * and the controls that decide stay in one reading column, in that order, at
 * every width. Only the **audit trail** moves into a rail beside it — it is
 * reference, not part of the decision, and having it in view while the documents
 * are read is better than having it below them.
 *
 * The rail deliberately does **not** hold the decision controls, though a sticky
 * Approve button is the obvious thing to put in it. §5.5 wants an operator to
 * open every document before deciding, and V4 put the existing-decision record
 * above the controls so nobody reaches Reject without scrolling past the
 * approval they would withdraw. A sticky control defeats both.
 *
 * Width is left to `.page-container`, which already caps at 1600px.
 *
 * ⚠️ Every string on this page is attacker-controlled: a display name, a
 * company name, an address, a file name, a rejection reason. They are rendered
 * as text with `wrap-anywhere`, and nothing here becomes an `href`.
 */
export function VerificationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const query = useVerificationQuery(id)

  if (query.isPending) {
    /* Shaped like the page it replaces, not a spinner (plan.md §1D). */
    return <LoadingState variant="detail" />
  }

  if (query.isError) {
    /*
     * A 404 is its own state, not a failure. `GET /:id` answers
     * `"Verification request not found"` for an unknown id, and an operator
     * following a stale link needs the way back rather than a retry button that
     * will 404 again.
     */
    if (query.error instanceof NotFoundError) {
      return (
        <NotFoundState
          title="Application not found"
          description="This verification request does not exist, or it has been removed."
          action={
            <Button asChild variant="outline">
              <Link to={ROUTES.verifications}>Back to the queue</Link>
            </Button>
          }
        />
      )
    }

    return (
      <ErrorState
        title="The application could not be loaded"
        {...(isAppError(query.error) ? { description: query.error.message } : {})}
        {...(isAppError(query.error) && query.error.correlationId
          ? { correlationId: query.error.correlationId }
          : {})}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const record = query.data
  const subject = resolveSubject(record)
  const idTypeLabel = describeIdType(record.idType)

  return (
    <div className="space-y-6">
      <PageHeader
        /*
         * The subject IS the title. An operator arriving from a colleague's
         * link needs to know whose documents they are about to open before
         * anything else on the page loads.
         */
        title={subject.name ?? SUBJECT_UNKNOWN_LABEL}
        description={
          record.targetType === 'BUSINESS_ENTITY'
            ? 'Business verification (KYB)'
            : `Identity verification (KYC)${idTypeLabel ? ` — ${idTypeLabel}` : ''}`
        }
        breadcrumbs={[
          { label: 'Verifications', to: ROUTES.verifications },
          { label: subject.name ?? 'Application' },
        ]}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StatusBadge domain="verification" value={record.status} />
        <span className="text-caption text-foreground-muted">
          Submitted <DateTime value={record.submittedAt} relative />
        </span>
        {record.reviewedAt ? (
          <span className="text-caption text-foreground-muted">
            Reviewed <DateTime value={record.reviewedAt} relative />
          </span>
        ) : null}
      </div>

      {/*
       * Two columns from `xl` up, one below it.
       *
       * `xl` rather than `lg`: at 1024 the desktop sidebar is already showing, so
       * a 340px rail would leave the main column under 380px — narrower than the
       * phone layout it replaced. The rail earns its place at 1280 and above.
       *
       * Below `xl` the rail simply stacks after the main column, which puts the
       * audit trail last — exactly where the single-column version had it. That
       * is why nothing needs an `order-*` override.
       */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <ApplicantCard record={record} />
          <DocumentList record={record} />
          {/*
           * ⚠️ The record of a past decision comes **before** the controls that
           * would overwrite it. `DecisionRecordCard` renders nothing until there
           * is one, so a pending application shows only the controls — but a
           * decided one shows what was decided, and only then offers to change
           * it. A decision is reversible on this API (§3.1), so the order is the
           * safeguard: nobody reaches the Reject button without having scrolled
           * past the approval they are about to withdraw.
           */}
          <DecisionRecordCard record={record} />
          <DecisionCard record={record} />
        </div>

        {/*
         * `items-start` on the grid keeps this from stretching to the main
         * column's height, and `sticky` holds the trail in view while the
         * documents above it are read.
         */}
        <div className="mt-6 min-w-0 xl:sticky xl:top-8 xl:mt-0">
          <AuditTimeline record={record} />
        </div>
      </div>
    </div>
  )
}
