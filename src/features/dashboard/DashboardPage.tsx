import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import { PageHeader } from '@/components/display'
import { EmptyState } from '@/components/feedback'
import { WithdrawalsDashboardCard } from '@/features/withdrawals/WithdrawalsDashboardCard'

/**
 * The dashboard. **Real figures only.**
 *
 * It used to preview a layout with invented numbers under a "sample figures"
 * notice; those were removed on request, because a plausible number on the
 * first screen gets quoted whatever the notice says. Add a card here when its
 * endpoint is connected, not before. `GET /admin/dashboard/snapshot`, `/trends`
 * and `/admin/analytics` exist and are not consumed yet.
 *
 * The route needs `analytics.view`, which a Moderator does not hold. An account
 * with that but not `withdrawals.view` gets a message, not a blank screen.
 */
export function DashboardPage() {
  const canSeeWithdrawals = useCan(PERMISSIONS.withdrawalsView)

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" breadcrumbs={[{ label: 'Dashboard' }]} />

      {canSeeWithdrawals ? (
        <WithdrawalsDashboardCard />
      ) : (
        <EmptyState
          title="Nothing to show yet"
          description="Figures appear here as they are connected. Use the menu to open a section."
        />
      )}
    </div>
  )
}
