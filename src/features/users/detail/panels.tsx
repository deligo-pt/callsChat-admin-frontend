import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

import {
  DateTime,
  DiamondAmount,
  KeyValueGrid,
  MaskedValue,
  StatusBadge,
  type KeyValueItem,
} from '@/components/display'
import { EmptyState } from '@/components/feedback'
import { PERMISSIONS } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { cn } from '@/lib/cn'
import { humaniseEnum, resolveStatus } from '@/lib/status'
import type {
  DeviceToken,
  LooseRecord,
  UserDetail,
  UserSession,
} from '@/types/identity'

import { AddRestrictionAction, RemoveRestrictionAction } from './RestrictionActions'
import { RevokeAllSessionsAction, RevokeSessionAction } from './SessionActions'

/* -------------------------------------------------------------------------
 * Shared pieces
 * ---------------------------------------------------------------------- */

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: string
  /** Permission-gated action for this section, e.g. "Add restriction". */
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-6',
        className,
      )}
    >
      {/* Stacks below sm so the action never crowds a long title. */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="text-h4">{title}</h3>
          {description ? (
            <p className="text-caption text-foreground-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

/** A muted "—" so an absent value is visibly absent rather than blank. */
function Value({ children }: { children: ReactNode }) {
  if (children === null || children === undefined || children === '') {
    return <span className="text-foreground-subtle">—</span>
  }
  return <>{children}</>
}

function Bool({ value }: { value: boolean }) {
  return (
    <span className={value ? 'text-success-foreground' : 'text-foreground-muted'}>
      {value ? 'Yes' : 'No'}
    </span>
  )
}

/**
 * Notice for data whose shape the backend has never actually produced.
 *
 * plan.md §10: the restriction, suspension and audit arrays are empty for every
 * account on the live API, so their item shape is unverified. Saying so beats
 * rendering invented field names, and beats a bare "None" that would imply the
 * feature works and simply has no data.
 */
function UnverifiedShapeNotice({ what }: { what: string }) {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        No {what} has ever been recorded on this backend, so the exact fields it returns
        are not yet known. Entries render defensively until one exists.
      </span>
    </p>
  )
}

/**
 * Render an object whose shape is not known ahead of time.
 *
 * Used for restriction / suspension / audit entries. It shows whatever
 * primitive keys are present rather than guessing at a schema.
 */
export function LooseEntryBody({ record }: { record: LooseRecord }) {
  const entries = Object.entries(record).filter(
    ([, value]) =>
      value === null || ['string', 'number', 'boolean'].includes(typeof value),
  )

  if (entries.length === 0) {
    return (
      <p className="text-caption text-foreground-muted">
        Entry contains no displayable fields.
      </p>
    )
  }

  return (
    <KeyValueGrid
      columns={2}
      items={entries.map(([key, value]) => ({
        label: humaniseEnum(key),
        value: <Value>{value === null ? null : String(value)}</Value>,
      }))}
    />
  )
}

function LooseEntry({ record }: { record: LooseRecord }) {
  return (
    <li className="min-w-0 rounded-md border border-border p-3">
      <LooseEntryBody record={record} />
    </li>
  )
}

function LooseList({
  records,
  emptyTitle,
  emptyDescription,
  what,
}: {
  records: readonly LooseRecord[]
  emptyTitle: string
  emptyDescription: string
  what: string
}) {
  if (records.length === 0) {
    return (
      <>
        <EmptyState title={emptyTitle} description={emptyDescription} />
        <UnverifiedShapeNotice what={what} />
      </>
    )
  }

  return (
    <ul className="space-y-3">
      {records.map((record, index) => (
        <LooseEntry key={String(record['id'] ?? index)} record={record} />
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------
 * Overview
 * ---------------------------------------------------------------------- */

export function OverviewPanel({ user }: { user: UserDetail }) {
  const { identity, overview } = user

  const profile: KeyValueItem[] = [
    { label: 'Display name', value: <Value>{identity.displayName}</Value> },
    { label: 'Username', value: <Value>{identity.username}</Value> },
    {
      label: 'Account type',
      value: <StatusBadge domain="accountType" value={identity.accountType} />,
    },
    { label: 'Platform role', value: <Value>{humaniseEnum(identity.role)}</Value> },
    { label: 'Country', value: <Value>{overview.country}</Value> },
    { label: 'Language', value: <Value>{overview.language}</Value> },
    { label: 'Timezone', value: <Value>{overview.timezone}</Value> },
    {
      label: 'Gender',
      value: <Value>{overview.gender ? humaniseEnum(overview.gender) : null}</Value>,
    },
    {
      label: 'Date of birth',
      value: overview.dateOfBirth ? (
        <DateTime value={overview.dateOfBirth} variant="date" />
      ) : (
        <Value>{null}</Value>
      ),
    },
    { label: 'Bio', value: <Value>{overview.bio}</Value>, full: true },
  ]

  const verification: KeyValueItem[] = [
    {
      label: 'Phone',
      value: identity.phone ? (
        // plan.md §3.9 — masked by default, even on the detail screen.
        <MaskedValue value={identity.phone} kind="phone" />
      ) : (
        <Value>{null}</Value>
      ),
    },
    { label: 'Phone verified', value: <Bool value={overview.phoneVerified} /> },
    {
      label: 'Email',
      value: identity.email ? (
        <MaskedValue value={identity.email} kind="email" />
      ) : (
        <Value>{null}</Value>
      ),
    },
    { label: 'Email verified', value: <Bool value={overview.emailVerified} /> },
    {
      label: 'Profile complete',
      value: <Bool value={overview.isProfileSetupComplete} />,
    },
    { label: 'Currently online', value: <Bool value={overview.isOnline} /> },
    {
      label: 'Last seen',
      value: overview.lastSeenAt ? (
        <DateTime value={overview.lastSeenAt} relative />
      ) : (
        <span className="text-foreground-subtle">Never</span>
      ),
    },
  ]

  const stats: KeyValueItem[] = [
    { label: 'Contacts', value: overview.socialStats.totalContacts },
    { label: 'Groups', value: overview.socialStats.totalGroups },
    { label: 'Communities', value: overview.socialStats.totalCommunities },
    { label: 'Calls initiated', value: overview.socialStats.totalCallsInitiated },
    { label: 'Calls received', value: overview.socialStats.totalCallsReceived },
  ]

  return (
    <div className="space-y-4">
      <Panel title="Profile">
        <KeyValueGrid items={profile} />
      </Panel>

      <Panel title="Contact and verification">
        <KeyValueGrid items={verification} />
      </Panel>

      {/*
        Counts only. plan.md §3.1 — this module never surfaces message, call or
        media content, so these are volumes and nothing else.
      */}
      <Panel
        title="Activity volume"
        description="Counts only. No message, call or media content is available in the admin panel."
      >
        <KeyValueGrid items={stats} />
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------------------------
 * Access & restrictions
 * ---------------------------------------------------------------------- */

export function AccessPanel({ user }: { user: UserDetail }) {
  const access = user.accessAndRestrictions
  const { can } = useAuth()
  const canRestrict = can(PERMISSIONS.usersRestrict)

  return (
    <div className="space-y-4">
      {/*
        plan.md Phase 3 "Rules enforced": account status and capability
        restrictions are visually and structurally separate. They live in two
        different panels here for exactly that reason — a gifting block is never
        presented as an account state.
      */}
      <Panel
        title="Account status"
        description="The account's overall state. Separate from capability restrictions below."
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge domain="user" value={access.currentStatus} />
          <span className="text-caption text-foreground-muted">
            {access.suspensionHistory.length} suspension
            {access.suspensionHistory.length === 1 ? '' : 's'} on record
          </span>
        </div>
      </Panel>

      <Panel
        title="Active capability restrictions"
        description="Individual features blocked for this account. A restriction does not change the account status."
        action={canRestrict ? <AddRestrictionAction user={user.identity} /> : undefined}
      >
        {access.activeRestrictions.length === 0 ? (
          <LooseList
            records={[]}
            emptyTitle="No active restrictions"
            emptyDescription="Every capability is currently available to this account."
            what="capability restriction"
          />
        ) : (
          <ul className="space-y-3">
            {access.activeRestrictions.map((record, index) => {
              /*
               * The item shape is unverified (no live record has ever existed),
               * so the id and label are read defensively rather than assumed.
               */
              const id = typeof record['id'] === 'string' ? record['id'] : null
              const capability =
                typeof record['capability'] === 'string' ? record['capability'] : null

              return (
                <li
                  key={id ?? index}
                  className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <LooseEntryBody record={record} />
                  </div>
                  {canRestrict && id ? (
                    <div className="shrink-0">
                      <RemoveRestrictionAction
                        user={user.identity}
                        restrictionId={id}
                        label={
                          capability
                            ? resolveStatus('restriction', capability).label
                            : 'Restriction'
                        }
                      />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Restriction history">
        <LooseList
          records={access.restrictionHistory}
          emptyTitle="No past restrictions"
          emptyDescription="This account has never had a capability restricted."
          what="capability restriction"
        />
      </Panel>

      <Panel title="Suspension history">
        <LooseList
          records={access.suspensionHistory}
          emptyTitle="No suspensions"
          emptyDescription="This account has never been suspended or banned."
          what="suspension"
        />
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------------------------
 * Sessions & devices
 * ---------------------------------------------------------------------- */

function SessionRow({ session, action }: { session: UserSession; action?: ReactNode }) {
  const items: KeyValueItem[] = [
    { label: 'Platform', value: <Value>{session.platform}</Value> },
    { label: 'Device', value: <Value>{session.deviceName}</Value> },
    /*
     * Coarse network origin only. plan.md §RBAC allows approximate location for
     * a security review; there is no precise device fingerprinting here.
     */
    { label: 'IP address', value: <Value>{session.ipAddress}</Value> },
    { label: 'Client', value: <Value>{session.userAgent}</Value> },
    {
      label: 'Started',
      value: <DateTime value={session.createdAt} />,
    },
    {
      label: 'Last active',
      value: session.lastActiveAt ? (
        <DateTime value={session.lastActiveAt} relative />
      ) : (
        <span className="text-foreground-subtle">Never</span>
      ),
    },
    {
      label: 'Expires',
      value: session.expiresAt ? (
        <DateTime value={session.expiresAt} />
      ) : (
        <Value>{null}</Value>
      ),
    },
  ]

  return (
    <li className="min-w-0 rounded-md border border-border p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-sm px-2 py-1 text-overline whitespace-nowrap uppercase',
            session.isRevoked
              ? 'bg-neutral-soft text-neutral-foreground'
              : 'bg-success-soft text-success-foreground',
          )}
        >
          {session.isRevoked ? 'Revoked' : 'Active'}
        </span>
        {action ? <span className="ml-auto">{action}</span> : null}
        {/*
          `revokedAt` is absent from this endpoint even for revoked sessions
          (see `userSessionSchema`), so it is only shown when actually present —
          never inferred.
        */}
        {session.isRevoked && session.revokedAt ? (
          <span className="text-caption text-foreground-muted">
            Revoked <DateTime value={session.revokedAt} relative />
          </span>
        ) : null}
      </div>
      <KeyValueGrid items={items} columns={2} />
    </li>
  )
}

export function SessionsPanel({ user }: { user: UserDetail }) {
  const { sessions, deviceTokens, totalActiveSessions } = user.sessionsAndDevices
  const { can } = useAuth()
  const canRevoke = can(PERMISSIONS.sessionsRevoke)

  return (
    <div className="space-y-4">
      <Panel
        title="Sessions"
        description={`${totalActiveSessions} active of ${sessions.length} on record.`}
        action={
          canRevoke ? (
            <RevokeAllSessionsAction
              user={user.identity}
              activeCount={totalActiveSessions}
            />
          ) : undefined
        }
      >
        {sessions.length === 0 ? (
          <EmptyState
            title="No sessions"
            description="This account has never signed in on a tracked device."
          />
        ) : (
          <ul className="space-y-3">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                action={
                  // A revoked session cannot be revoked again.
                  canRevoke && !session.isRevoked ? (
                    <RevokeSessionAction
                      user={user.identity}
                      sessionId={session.id}
                      sessionLabel={session.platform ?? 'Session'}
                    />
                  ) : null
                }
              />
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Registered devices"
        description="Devices set up to receive push notifications."
      >
        {deviceTokens.length === 0 ? (
          <EmptyState
            title="No registered devices"
            description="This account has no push-notification devices."
          />
        ) : (
          <ul className="space-y-3">
            {deviceTokens.map((token: DeviceToken) => (
              <li
                key={token.id}
                className="min-w-0 rounded-md border border-border p-3"
              >
                <KeyValueGrid
                  columns={2}
                  items={[
                    {
                      label: 'Device type',
                      value: (
                        <Value>
                          {token.deviceType ? humaniseEnum(token.deviceType) : null}
                        </Value>
                      ),
                    },
                    {
                      label: 'Registered',
                      value: token.createdAt ? (
                        <DateTime value={token.createdAt} />
                      ) : (
                        <Value>{null}</Value>
                      ),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------------------------
 * Safety
 * ---------------------------------------------------------------------- */

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-md border border-border p-4">
      <p className="text-overline text-foreground-subtle uppercase">{label}</p>
      <p className="mt-1 tabular text-h3">{value}</p>
    </div>
  )
}

export function SafetyPanel({ user }: { user: UserDetail }) {
  const s = user.safety

  return (
    <Panel
      title="Safety summary"
      description="Counts only — the reports and moderation-case endpoints are not built yet."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <CountTile label="Reports against" value={s.reportsAgainstCount} />
        <CountTile label="Reports submitted" value={s.reportsSubmittedCount} />
        <CountTile label="Suspensions" value={s.suspensionsCount} />
        <CountTile label="Blocks received" value={s.blocksReceivedCount} />
        <CountTile label="Blocks sent" value={s.blocksSentCount} />
      </div>

      {/*
        Honest about the gap rather than implying a drill-down exists.
        `/admin/reports` returns 404 — see plan.md §10.4.
      */}
      <p className="mt-4 flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Individual reports and linked moderation cases are not available: the backend
          exposes no reports endpoint yet. These totals are the complete picture the API
          currently provides.
        </span>
      </p>
    </Panel>
  )
}

/* -------------------------------------------------------------------------
 * Finance
 * ---------------------------------------------------------------------- */

export function FinancePanel({ user }: { user: UserDetail }) {
  const f = user.finance

  return (
    <Panel
      title="Diamond summary"
      description="Read-only. Balances are adjusted from the Diamond economy module, never from here."
    >
      {/*
        plan.md §3.2 / §9: available and locked are ALWAYS separate figures and
        are never added together into one "spendable" number. There is
        deliberately no mutation control anywhere in this module.
      */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border p-4">
          <p className="text-overline text-foreground-subtle uppercase">Available</p>
          <DiamondAmount amount={f.availableDiamonds} variant="available" size="lg" />
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-overline text-foreground-subtle uppercase">Locked</p>
          <DiamondAmount amount={f.lockedDiamonds} variant="locked" size="lg" />
        </div>
      </div>

      <div className="mt-4">
        <KeyValueGrid
          items={[
            {
              label: 'Total purchased',
              value: <DiamondAmount amount={f.totalPurchased} variant="neutral" />,
            },
            {
              label: 'Gifts sent',
              value: <DiamondAmount amount={f.totalGiftsSent} variant="neutral" />,
            },
            {
              label: 'Gifts received',
              value: <DiamondAmount amount={f.totalGiftsReceived} variant="neutral" />,
            },
          ]}
        />
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Available and locked Diamonds are separate balances and are never combined.
          The transaction ledger arrives with the Diamond economy module.
        </span>
      </p>
    </Panel>
  )
}

/* -------------------------------------------------------------------------
 * Audit history
 * ---------------------------------------------------------------------- */

export function AuditPanel({ user }: { user: UserDetail }) {
  const logs = user.auditHistory.recentActivityLogs

  return (
    <Panel
      title="Admin activity"
      description="Actions taken on this account by administrators."
    >
      <LooseList
        records={logs}
        emptyTitle="No recorded activity"
        emptyDescription="No administrator has acted on this account."
        what="admin action"
      />
      {logs.length > 0 ? (
        <p className="mt-4 text-caption text-foreground-muted">
          Showing the most recent entries returned by the API. There is no paginated
          audit-log endpoint yet.
        </p>
      ) : null}
    </Panel>
  )
}
