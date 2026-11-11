import { useQueryClient } from '@tanstack/react-query'
import { Activity, ShieldAlert, UserPlus, Users } from 'lucide-react'

import { ForbiddenError } from '@/api/errors'
import { queryKeys } from '@/api/queryKeys'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import { PageHeader } from '@/components/display'
import { ForbiddenState } from '@/components/feedback'
import { cn } from '@/lib/cn'

import { useHasAttentionRows } from './access'
import { ActivityCard } from './components/ActivityCard'
import { AllTimeCard } from './components/AllTimeCard'
import { RolesBreakdownCard, StatusBreakdownCard } from './components/BreakdownCards'
import { SectionError } from './components/DashboardSection'
import { EconomyCard } from './components/EconomyCard'
import { describeProblem } from './components/errorText'
import { LiveNowCard } from './components/LiveNowCard'
import { LiveStatus } from './components/LiveStatus'
import { slideIn } from './components/motion'
import { NeedsAttentionCard } from './components/NeedsAttentionCard'
import { DeltaChip, StatCard } from './components/StatCard'
import { useDashboardSnapshot, useRateLimitToast } from './useDashboard'

/**
 * The dashboard (plan.md §3). **Real figures only** — every number comes from
 * an endpoint; a section with no source says so instead of guessing.
 *
 * Top to bottom: header and KPI row (DB1); the activity chart beside Live now
 * (DB2, DB3); who the users are, and the queues waiting on staff (DB4); then
 * all-time totals and the economy (DB4).
 *
 * The route needs `analytics.view` (D2), which a Moderator does not hold.
 *
 * States (DB5): a 403 on the snapshot replaces the page with the standard
 * no-access screen (the API disagrees with the panel's role map, plan.md O4);
 * a 429 shows one toast and slows polling; any other failure keeps the layout,
 * with one banner holding Retry and the cards it feeds saying "Not available".
 */
export function DashboardPage() {
  const client = useQueryClient()
  const snapshot = useDashboardSnapshot()
  const canSeeUsers = useCan(PERMISSIONS.usersView)
  const canSeeLive = useCan(PERMISSIONS.liveView)
  const canSeeEconomy = useCan(PERMISSIONS.configurationView)
  const hasQueues = useHasAttentionRows()

  const kpis = snapshot.data?.kpis
  const loading = snapshot.isPending
  /* Only a failure with nothing to show blanks the cards; a failed poll keeps the last numbers. */
  const failedOutright = snapshot.isError && !snapshot.data
  const problem = failedOutright
    ? describeProblem(snapshot.error, 'the dashboard figures')
    : null
  useRateLimitToast(snapshot.error)

  function refresh() {
    void client.invalidateQueries({ queryKey: queryKeys.dashboard.all })
    void client.invalidateQueries({ queryKey: queryKeys.withdrawals.all })
    void client.invalidateQueries({ queryKey: queryKeys.topUpRequests.all })
    if (canSeeLive) {
      void client.invalidateQueries({ queryKey: queryKeys.liveRooms.analytics() })
    }
  }

  if (failedOutright && snapshot.error instanceof ForbiddenError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" breadcrumbs={[{ label: 'Dashboard' }]} />
        <ForbiddenState resource="the dashboard" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="How the platform is doing right now. Live figures refresh every 30 seconds."
        breadcrumbs={[{ label: 'Dashboard' }]}
        actions={
          <LiveStatus
            updatedAt={snapshot.dataUpdatedAt}
            failing={snapshot.isError}
            refreshing={snapshot.isFetching}
            onRefresh={refresh}
          />
        }
      />

      {problem ? (
        <SectionError
          message={problem.message}
          tone={problem.tone}
          onRetry={problem.retry ? () => void snapshot.refetch() : undefined}
        />
      ) : null}

      <section aria-label="Key figures">
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            <StatCard
              key="total"
              label="Total users"
              value={kpis?.totalUsers}
              loading={loading}
              unavailable={failedOutright}
              icon={Users}
              tone="primary"
              footer={
                kpis ? (
                  <DeltaChip
                    percent={kpis.totalUsersDeltaMonthPercent}
                    period="this month"
                  />
                ) : null
              }
              link={canSeeUsers ? { to: ROUTES.users, label: 'Open users' } : undefined}
            />,
            <StatCard
              key="active"
              label="Users online"
              value={kpis?.activeNow}
              loading={loading}
              unavailable={failedOutright}
              icon={Activity}
              tone="success"
              footer={
                kpis ? (
                  <DeltaChip
                    percent={kpis.activeNowDeltaHourPercent}
                    period="vs last hour"
                  />
                ) : null
              }
            />,
            <StatCard
              key="new"
              label="New sign-ups today"
              value={kpis?.newToday}
              loading={loading}
              unavailable={failedOutright}
              icon={UserPlus}
              tone="accent"
              footer={
                kpis ? (
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-caption font-medium',
                      kpis.newTodayOnTrack
                        ? 'bg-success-soft text-success-foreground'
                        : 'bg-warning-soft text-warning-foreground',
                    )}
                  >
                    {kpis.newTodayOnTrack
                      ? 'On track for today'
                      : 'Behind the usual pace'}
                  </span>
                ) : null
              }
            />,
            <StatCard
              key="flagged"
              label="Flagged accounts"
              value={kpis?.flagged}
              loading={loading}
              unavailable={failedOutright}
              icon={ShieldAlert}
              tone="danger"
              attention={kpis?.flaggedRequiresAttention ?? false}
              footer={
                kpis ? (
                  <span className="text-caption text-foreground-muted">
                    {kpis.flaggedRequiresAttention
                      ? 'Not in good standing'
                      : 'Nothing waiting'}
                  </span>
                ) : null
              }
              /*
               * No link: the moderation screen is not built yet, and
               * `ROUTES.moderation` has no page behind it.
               */
            />,
          ].map((card, index) => {
            const motion = slideIn(index)
            return (
              <li
                key={card.key}
                className={cn('flex min-w-0 [&>*]:w-full', motion.className)}
                style={motion.style}
              >
                {card}
              </li>
            )
          })}
        </ul>
      </section>

      {/* Chart and Live now side by side from 1280px; Live now stacks its blocks when narrow. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ActivityCard {...slideIn(4)} />
        <LiveNowCard
          telemetry={snapshot.data?.liveTelemetry}
          loading={loading}
          unavailable={failedOutright}
          canSeeLive={canSeeLive}
          {...slideIn(5)}
        />
      </div>

      {/* Breakdowns and queues: 3 columns from 1280px, 2 from 768px. */}
      <div className={cn('grid gap-6 md:grid-cols-2', hasQueues && 'xl:grid-cols-3')}>
        <StatusBreakdownCard
          breakdowns={snapshot.data?.breakdowns}
          totalUsers={kpis?.totalUsers}
          loading={loading}
          unavailable={failedOutright}
          {...slideIn(6)}
        />
        <RolesBreakdownCard
          breakdowns={snapshot.data?.breakdowns}
          totalUsers={kpis?.totalUsers}
          loading={loading}
          unavailable={failedOutright}
          {...slideIn(7)}
        />
        {hasQueues ? (
          <NeedsAttentionCard
            snapshot={snapshot.data}
            snapshotLoading={loading}
            snapshotError={failedOutright ? snapshot.error : undefined}
            className={cn(slideIn(8).className, 'md:col-span-2 xl:col-span-1')}
            style={slideIn(8).style}
          />
        ) : null}
      </div>

      <div
        className={cn(
          'grid gap-6',
          canSeeEconomy && 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
        )}
      >
        <AllTimeCard
          totals={snapshot.data?.historicalTotals}
          loading={loading}
          unavailable={failedOutright}
          {...slideIn(9)}
        />
        {canSeeEconomy ? <EconomyCard {...slideIn(10)} /> : null}
      </div>
    </div>
  )
}
