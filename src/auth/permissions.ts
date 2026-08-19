/**
 * Action-based permission keys, denied by default (plan.md §8).
 *
 * These exist so navigation and controls can be filtered for clarity. They are
 * NOT a security boundary — the backend re-authorizes every request, and a
 * hidden button is not an access control.
 *
 * Phase 2 populates the acting admin's effective set from `GET /admin/me`.
 */
export const PERMISSIONS = {
  usersView: 'users.view',
  usersSuspend: 'users.suspend',
  usersBan: 'users.ban',
  usersRestrict: 'users.restrict',
  sessionsRevoke: 'sessions.revoke',

  clubsView: 'clubs.view',
  clubsModerate: 'clubs.moderate',

  hostApplicationsView: 'host_applications.view',
  hostApplicationsApprove: 'host_applications.approve',
  hostApplicationsReject: 'host_applications.reject',

  walletsView: 'wallets.view',
  ledgerView: 'ledger.view',
  diamondsAdjust: 'diamonds.adjust',
  diamondPackagesConfigure: 'diamond_packages.configure',
  giftsConfigure: 'gifts.configure',

  paymentsView: 'payments.view',
  paymentsRefund: 'payments.refund',
  withdrawalsView: 'withdrawals.view',
  withdrawalsApprove: 'withdrawals.approve',
  withdrawalsReject: 'withdrawals.reject',
  withdrawalsSettle: 'withdrawals.settle',
  payoutRatesConfigure: 'payout_rates.configure',

  reportsView: 'reports.view',
  reportsResolve: 'reports.resolve',

  analyticsView: 'analytics.view',
  exportData: 'export_data',

  notificationsSend: 'notifications.send',
  notificationsBroadcast: 'notifications.broadcast',

  adminUsersManage: 'admin_users.manage',
  rolesManage: 'roles.manage',

  auditLogsView: 'audit_logs.view',

  configurationView: 'configuration.view',
  configurationConfigure: 'configuration.configure',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/** Predicate signature used by the shell and by feature action guards. */
export type PermissionCheck = (permission: Permission) => boolean

/** Phase 1 default — Phase 2 replaces this with the real session check. */
export const allowAll: PermissionCheck = () => true
