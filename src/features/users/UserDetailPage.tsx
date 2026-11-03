import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import { isAppError, NotFoundError } from '@/api/errors'
import { queryKeys } from '@/api/queryKeys'
import { ROUTES } from '@/app/routes'
import {
  CopyableId,
  DateTime,
  PageHeader,
  RecordHeader,
  StatusBadge,
} from '@/components/display'
import { DetailTabs, type DetailTab } from '@/components/display/DetailTabs'
import { ErrorState, LoadingState, NotFoundState } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { PERMISSIONS } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { humaniseEnum } from '@/lib/status'
import type { UserDetail } from '@/types/identity'

import { fetchUser } from './api'
import { HostBadge } from './HostBadge'
import { HostLiveLinks } from './HostLiveLinks'
import { EditEmailAction, EditProfileAction } from './detail/EditActions'
import { RoleAction } from './detail/RoleAction'
import { StatusActions } from './detail/StatusActions'
import {
  AccessPanel,
  AuditPanel,
  FinancePanel,
  OverviewPanel,
  SafetyPanel,
  SessionsPanel,
} from './detail/panels'

/**
 * Back to the directory: top-left, above the record, at every width — as on
 * the wallet entry. Passed to `PageHeader` as an action it was stretched
 * full-width and centred on a phone, and it only repeated the breadcrumb.
 */
function BackToDirectory() {
  return (
    <Button variant="ghost" size="sm" className="-ml-2.5 self-start" asChild>
      <Link to={ROUTES.users}>
        <ArrowLeft /> All users
      </Link>
    </Button>
  )
}

function Header({ user }: { user: UserDetail }) {
  const { identity } = user
  const { can } = useAuth()

  /*
   * plan.md §8: an operator sees only the actions their role permits. This is
   * a clarity affordance, not a security boundary — the backend re-authorizes
   * every request, so a hidden button is not an access control.
   */
  const canSuspend = can(PERMISSIONS.usersSuspend)
  const canBan = can(PERMISSIONS.usersBan)
  const canChangeRole = can(PERMISSIONS.usersChangeRole)
  const canEdit = can(PERMISSIONS.usersEdit)
  const hasAnyAction = canSuspend || canBan || canChangeRole || canEdit

  return (
    <RecordHeader
      title={identity.displayName}
      as="h1"
      badges={
        <>
          {/*
            plan.md Phase 3 "Rules enforced": the account status and the
            restriction count are separate indicators. The restriction badge is
            never rendered as if it were a status.
          */}
          <StatusBadge domain="user" value={identity.status} />
          {identity.activeRestrictionsCount > 0 ? (
            <span className="inline-flex items-center rounded-sm bg-locked-soft px-2 py-1 text-overline whitespace-nowrap text-locked-foreground uppercase">
              {identity.activeRestrictionsCount} restriction
              {identity.activeRestrictionsCount === 1 ? '' : 's'}
            </span>
          ) : null}
          <HostBadge user={identity} size="md" link />
        </>
      }
      identifiers={
        <>
          {identity.username ? <span>@{identity.username}</span> : null}
          <CopyableId value={identity.id} label="User ID" maxLength={16} />
          {identity.phoneMasked ? (
            <span className="tabular whitespace-nowrap">{identity.phoneMasked}</span>
          ) : null}
          <span>{humaniseEnum(identity.accountType)}</span>
          <span>
            Registered <DateTime value={identity.createdAt} variant="date" />
          </span>
          <span>
            Last active{' '}
            {identity.lastActiveAt ? (
              <DateTime value={identity.lastActiveAt} relative />
            ) : (
              'never'
            )}
          </span>
          <HostLiveLinks user={identity} />
        </>
      }
      actions={
        hasAnyAction ? (
          <>
            <StatusActions user={identity} can={{ suspend: canSuspend, ban: canBan }} />
            {canEdit ? <EditProfileAction user={user} /> : null}
            {canEdit ? <EditEmailAction user={user} /> : null}
            {canChangeRole ? <RoleAction user={identity} /> : null}
          </>
        ) : undefined
      }
    />
  )
}

/**
 * User detail — `/users/:userId`.
 *
 * plan.md Phase 3B. The six tabs bind directly to the six groups
 * `GET /admin/users/:id` returns (§10.3), with no client-side reshaping — the
 * API was built to this shape, so any reshaping here would be a place for the
 * two to drift.
 *
 * Everything is read-only. Actions land in Phase 3C.
 */
export function UserDetailPage() {
  const { userId = '' } = useParams<{ userId: string }>()
  /*
   * The open tab lives in the URL (`?tab=finance`), so a link can open one —
   * the wallet entry's "back" returns to Finance this way (plan.md T4).
   * `replace`: switching tabs is not a step the Back button should retrace.
   */
  const [searchParams, setSearchParams] = useSearchParams()
  /*
   * ⚠️ Held locally as well: a tab switches in the same render it is clicked,
   * as it did before it was in the URL — writing the URL alone made the
   * switch land a tick later. A change made outside (a link to `?tab=…`) is
   * still followed.
   */
  const urlTab = searchParams.get('tab') ?? ''
  const [tab, setTab] = useState(urlTab)
  const [seenUrlTab, setSeenUrlTab] = useState(urlTab)
  if (seenUrlTab !== urlTab) {
    setSeenUrlTab(urlTab)
    setTab(urlTab)
  }
  function selectTab(next: string, first: string) {
    const written = next === first ? '' : next
    /*
     * Only the local tab: the URL is still the old one until the write
     * below lands, and marking it "seen" early made the sync above snap the
     * tab back for a tick. When it lands it agrees with `next`.
     */
    setTab(next)
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        if (written) params.set('tab', written)
        else params.delete('tab')
        return params
      },
      { replace: true },
    )
  }

  const query = useQuery({
    queryKey: queryKeys.users.detail(userId),
    queryFn: ({ signal }) => fetchUser(userId, signal),
    enabled: userId.length > 0,
    // A missing record is an answer, not a transient failure worth retrying.
    retry: (failureCount, error) =>
      error instanceof NotFoundError ? false : failureCount < 1,
  })

  if (query.isPending) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <BackToDirectory />
          <PageHeader title="User" />
        </div>
        <LoadingState variant="detail" />
      </div>
    )
  }

  if (query.isError) {
    const notFound = query.error instanceof NotFoundError
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <BackToDirectory />
          <PageHeader title="User" />
        </div>
        {notFound ? (
          <NotFoundState
            title="User not found"
            description="This account does not exist, or it has been permanently deleted."
          />
        ) : (
          <ErrorState
            {...(isAppError(query.error) ? { description: query.error.message } : {})}
            {...(isAppError(query.error) && query.error.correlationId
              ? { correlationId: query.error.correlationId }
              : {})}
            onRetry={() => void query.refetch()}
          />
        )}
      </div>
    )
  }

  const user = query.data

  const tabs: DetailTab[] = [
    { value: 'overview', label: 'Overview', content: <OverviewPanel user={user} /> },
    {
      value: 'access',
      label: 'Access & restrictions',
      ...(user.identity.activeRestrictionsCount > 0
        ? { count: user.identity.activeRestrictionsCount }
        : {}),
      content: <AccessPanel user={user} />,
    },
    {
      value: 'sessions',
      label: 'Sessions & devices',
      ...(user.sessionsAndDevices.totalActiveSessions > 0
        ? { count: user.sessionsAndDevices.totalActiveSessions }
        : {}),
      content: <SessionsPanel user={user} />,
    },
    {
      value: 'safety',
      label: 'Safety',
      ...(user.safety.reportsAgainstCount > 0
        ? { count: user.safety.reportsAgainstCount }
        : {}),
      content: <SafetyPanel user={user} />,
    },
    { value: 'finance', label: 'Finance', content: <FinancePanel user={user} /> },
    { value: 'audit', label: 'Audit history', content: <AuditPanel user={user} /> },
  ]

  return (
    <div className="space-y-6">
      {/*
        No page title: the record card below already shows the display name
        (promoted to the page's `h1`). Only the way back sits above it.
      */}
      <div className="flex flex-col">
        <BackToDirectory />
      </div>

      <Header user={user} />

      <DetailTabs
        tabs={tabs}
        value={tabs.some((candidate) => candidate.value === tab) ? tab : tabs[0]!.value}
        onValueChange={(next) => selectTab(next, tabs[0]!.value)}
      />
    </div>
  )
}
