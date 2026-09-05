import { Trash2 } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { isAppError, NotFoundError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import { PageHeader, RecordHeader, StatusBadge } from '@/components/display'
import { ErrorState, LoadingState, NotFoundState } from '@/components/feedback'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { IdentityCard } from './detail/IdentityCard'
import { LifecycleCard } from './detail/LifecycleCard'
import { PermissionsCard } from './detail/PermissionsCard'
import { useStaffMemberQuery } from './useStaff'

/**
 * One staff member — `/staff/:id`. Super Admin only.
 *
 * The awkward case this page exists to handle correctly is the **deleted**
 * one. `GET /admin/staff/:id` answers `200` for a soft-deleted account, so
 * there is nothing in the response that stops the page rendering a full editor
 * — but every mutation against that id answers `404` (§3.4). A working-looking
 * page whose every button fails is worse than no page, so an `INACTIVE` record
 * renders read-only with the reason stated, and no action affordance at all.
 */
export function StaffDetailPage() {
  const { id = '' } = useParams()
  const query = useStaffMemberQuery(id)

  if (query.isPending) return <LoadingState variant="form" />

  if (query.isError) {
    /*
     * A genuinely unknown id — and also a Super Admin's id, which these routes
     * treat as invisible rather than merely protected (§2.8).
     */
    if (query.error instanceof NotFoundError) {
      return (
        <NotFoundState
          title="Staff member not found"
          description="This account does not exist, or it belongs to a Super Administrator — those are not visible here."
          action={
            <Button asChild variant="secondary">
              <Link to={ROUTES.staff}>Back to staff</Link>
            </Button>
          }
        />
      )
    }

    return (
      <ErrorState
        title="Staff member could not be loaded"
        description={
          isAppError(query.error)
            ? query.error.message
            : 'The record did not load. Nothing has been changed.'
        }
        {...(isAppError(query.error) && query.error.correlationId
          ? { correlationId: query.error.correlationId }
          : {})}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const member = query.data
  const isDeleted = member.status === 'INACTIVE'

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Staff', to: ROUTES.staff },
          { label: member.displayName },
        ]}
      />

      <RecordHeader
        // The page's only name for its subject, so it carries the h1.
        as="h1"
        title={member.displayName}
        identifiers={<span className="truncate-id">@{member.username}</span>}
        badges={
          <>
            <StatusBadge domain="staff" value={member.status} />
            <StatusBadge domain="staffRole" value={member.role} />
          </>
        }
      />

      {isDeleted ? (
        /*
         * Stated before anything else on the page. The record still reads
         * perfectly well, which is exactly why the operator needs telling that
         * nothing here can be changed — the API answers 404 to every write
         * against a deleted id, including the permission grid below.
         */
        <Alert>
          <Trash2 aria-hidden="true" />
          <AlertTitle>This account is deleted</AlertTitle>
          <AlertDescription>
            It cannot be restored, and nothing about it can be changed. It stays in the
            directory so that past actions remain attributable to a name.
          </AlertDescription>
        </Alert>
      ) : null}

      <IdentityCard member={member} />
      <PermissionsCard member={member} readOnly={isDeleted} />
      {/*
       * Absent, not disabled, on a deleted record. Every one of these routes
       * answers 404 for a deleted id (§3.4), so a greyed-out button would be
       * offering something that cannot happen rather than something the
       * operator lacks permission for.
       */}
      {isDeleted ? null : <LifecycleCard member={member} />}
    </div>
  )
}
