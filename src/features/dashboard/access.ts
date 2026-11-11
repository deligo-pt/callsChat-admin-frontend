import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'

/**
 * Which "Needs attention" rows (plan.md DB4) this admin may see: each one
 * opens a screen with its own guard, so the row follows that guard.
 */
export function useAttentionAccess() {
  return {
    withdrawals: useCan(PERMISSIONS.withdrawalsView),
    topUps: useCan(PERMISSIONS.walletsView),
    business: useCan(PERMISSIONS.verificationsReview),
    flagged: useCan(PERMISSIONS.reportsView),
  }
}

export function useHasAttentionRows(): boolean {
  const access = useAttentionAccess()
  return access.withdrawals || access.topUps || access.business || access.flagged
}
