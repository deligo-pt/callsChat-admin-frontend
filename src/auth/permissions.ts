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
  /** Create a new user account from the admin panel. */
  usersCreate: 'users.create',
  /** Edit a user's own profile details or email address. */
  usersEdit: 'users.edit',
  /**
   * Change a user's PLATFORM role, including promoting to ADMIN or
   * SUPER_ADMIN. This is privilege escalation, so it is deliberately its own
   * permission rather than folding into `users.suspend`.
   */
  usersChangeRole: 'users.change_role',
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

  /**
   * Staff & Access Control — `/admin/staff/*` (staff_management_plan.md §4.3).
   *
   * Replaces the former `admin_users.manage`. `roles.manage` was removed
   * outright rather than renamed: it described a role builder, and the backend
   * has exactly two fixed staff roles and a flat list of eight module keys.
   * There is nothing for a roles screen to manage.
   *
   * Super Admin only, with no ambiguity to weigh — all eight routes are
   * `verifySuperAdmin`-guarded and an ADMIN receives `403 "Access Denied:
   * Requires SUPER_ADMIN privileges"` from every one of them, verified
   * 2026-09-03.
   */
  staffManage: 'staff.manage',

  auditLogsView: 'audit_logs.view',

  configurationView: 'configuration.view',
  configurationConfigure: 'configuration.configure',

  /**
   * Database backup suite — `POST/GET /admin/settings/database/*`.
   *
   * Separate from `configuration.configure` because the backend guards these
   * with `verifySuperAdmin` while the six settings-write routes only need
   * `verifyAdmin` (system_settings_plan.md §2.1). Folding them together would
   * show an ADMIN a tab the API will always refuse.
   */
  settingsDatabase: 'settings.database',

  /** SMS gateway suite — `GET/PATCH /admin/settings/sms`, `POST …/sms/test`. Super Admin only. */
  settingsSms: 'settings.sms',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/** Predicate signature used by the shell and by feature action guards. */
export type PermissionCheck = (permission: Permission) => boolean

/** Phase 1 default — retained for the design gallery only. */
export const allowAll: PermissionCheck = () => true

/* -------------------------------------------------------------------------
 * INTERIM role -> permission mapping
 *
 * ⚠️ This block is a known deviation from
 * `doc/RBAC, Security, and Privacy.md:52` ("do not hard-code role names in
 * product authorization logic"), and it exists only because
 * `GET /admin/auth/me` returns `role` with no `permissions[]` (plan.md §10.1,
 * tracked as 3A′ #1).
 *
 * It is deliberately confined to this one file and one function so that the
 * day the backend returns a real permission list, `permissionsForRole` is
 * deleted and `AuthProvider` reads the array instead — a single-file change
 * touching no feature.
 *
 * It is not a security boundary either way: the backend re-authorizes every
 * request, and a hidden button has never been an access control.
 * ---------------------------------------------------------------------- */

const ALL_PERMISSIONS = Object.values(PERMISSIONS)

/** Read-only permissions every admin role holds. */
const MODERATOR_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.usersView,
  PERMISSIONS.usersRestrict,
  PERMISSIONS.sessionsRevoke,
  PERMISSIONS.clubsView,
  PERMISSIONS.clubsModerate,
  PERMISSIONS.reportsView,
  PERMISSIONS.reportsResolve,
]

/**
 * Operations tier. Excludes the high-risk finance permissions, which
 * `doc/RBAC, Security, and Privacy.md:52` reserves for Super Admin:
 * `diamonds.adjust`, `diamond_packages.configure`, `payout_rates.configure`,
 * `withdrawals.approve`, `payments.refund`, and configuration writes.
 */
const ADMIN_PERMISSIONS: readonly Permission[] = [
  ...MODERATOR_PERMISSIONS,
  PERMISSIONS.usersSuspend,
  PERMISSIONS.usersBan,
  /*
   * Creating and editing accounts is operations work, not privilege
   * escalation — unlike `usersChangeRole` below, which stays Super Admin only.
   */
  PERMISSIONS.usersCreate,
  PERMISSIONS.usersEdit,
  /*
   * `usersChangeRole` is deliberately ABSENT here and granted only to
   * SUPER_ADMIN via ALL_PERMISSIONS. Promoting an account to ADMIN is
   * privilege escalation, and `doc/RBAC, Security, and Privacy.md:52` reserves
   * that class of action for Super Admin.
   */
  PERMISSIONS.hostApplicationsView,
  PERMISSIONS.hostApplicationsApprove,
  PERMISSIONS.hostApplicationsReject,
  PERMISSIONS.walletsView,
  PERMISSIONS.ledgerView,
  PERMISSIONS.paymentsView,
  PERMISSIONS.withdrawalsView,
  PERMISSIONS.analyticsView,
  PERMISSIONS.exportData,
  PERMISSIONS.notificationsSend,
  PERMISSIONS.auditLogsView,
  PERMISSIONS.configurationView,
  /*
   * `configurationConfigure` was granted here on 2026-09-01 and **removed on
   * 2026-09-03**. That divergence, logged as system_settings_plan.md §8 O1, is
   * now retired: the route guards tightened exactly as that note anticipated.
   *
   * The reasoning then was sound and is worth keeping, because it is the rule
   * this file follows: the six settings-write routes were guarded with
   * `verifyAdmin`, so withholding the permission would have shown an ADMIN a
   * page of disabled controls the API would in fact have accepted — a lie
   * about capability.
   *
   * The backend has since moved to per-module permissions. `GET /admin/settings`
   * now answers `403 "Access Denied: Missing required module permission
   * 'SYSTEM_SETTINGS_EDIT'"` for an ADMIN that has not been granted the key —
   * verified live 2026-09-03 against a real account. Note it gates the *read*
   * as well as the writes despite its `_EDIT` name; there is no separate view
   * permission.
   *
   * So the grant would now be the lie in the other direction, and it comes
   * out. Which ADMINs may configure settings is no longer a property of the
   * role at all — it is a per-account grant made in Staff, and it will be read
   * from `adminPermissions` once `GET /admin/auth/me` returns it
   * (staff_management_plan.md §3.2, phase A5).
   *
   * The two SUPER_ADMIN-only suites — `settingsDatabase` and `settingsSms` —
   * remain absent, matching their `verifySuperAdmin` guards. `staffManage` is
   * absent for the same reason.
   */
]

const ROLE_PERMISSIONS: Readonly<Record<string, readonly Permission[]>> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  MODERATOR: MODERATOR_PERMISSIONS,
}

/**
 * Effective permissions for a role.
 *
 * An unrecognised role gets the empty set — denied by default (plan.md §8).
 * A new backend role must be granted explicitly here rather than inheriting
 * anything by accident.
 */
export function permissionsForRole(role: string): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}
