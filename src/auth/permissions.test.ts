import { describe, expect, it } from 'vitest'

import { PERMISSIONS, permissionsForRole } from './permissions'

/**
 * The interim role → permission map (plan.md 3A′ #1).
 *
 * These assertions encode the RBAC rules from
 * `doc/RBAC, Security, and Privacy.md`, so they stay meaningful when the
 * backend starts supplying `permissions[]` and this map is deleted — at that
 * point the same expectations move to the API's contract test.
 */

describe('permissionsForRole', () => {
  it('denies by default for an unknown role', () => {
    /*
     * A role the panel has never heard of must inherit nothing. If the backend
     * adds a role, it appears with zero permissions until granted explicitly —
     * the safe direction to fail.
     */
    expect(permissionsForRole('AUDITOR')).toEqual([])
    expect(permissionsForRole('')).toEqual([])
    expect(permissionsForRole('USER')).toEqual([])
  })

  it('gives Super Admin everything', () => {
    const granted = permissionsForRole('SUPER_ADMIN')
    for (const permission of Object.values(PERMISSIONS)) {
      expect(granted).toContain(permission)
    }
  })

  it('withholds role changes from everyone except Super Admin', () => {
    /*
     * Promoting an account to ADMIN grants admin-panel access — privilege
     * escalation, which the RBAC doc reserves for Super Admin.
     */
    expect(permissionsForRole('ADMIN')).not.toContain(PERMISSIONS.usersChangeRole)
    expect(permissionsForRole('MODERATOR')).not.toContain(PERMISSIONS.usersChangeRole)
    expect(permissionsForRole('SUPER_ADMIN')).toContain(PERMISSIONS.usersChangeRole)
  })

  it('withholds high-risk finance permissions from Admin', () => {
    // doc/RBAC, Security, and Privacy.md:52 reserves these for Super Admin.
    const admin = permissionsForRole('ADMIN')
    for (const permission of [
      PERMISSIONS.diamondsAdjust,
      PERMISSIONS.diamondPackagesConfigure,
      PERMISSIONS.payoutRatesConfigure,
      PERMISSIONS.withdrawalsApprove,
      PERMISSIONS.paymentsRefund,
    ]) {
      expect(admin).not.toContain(permission)
    }
  })

  it('no longer lets an Admin write system settings by role alone', () => {
    /*
     * ⚠️ This expectation was INVERTED on 2026-09-03, exactly as
     * system_settings_plan.md §8 O1 said it would be.
     *
     * It previously asserted the opposite, on the grounds — correct at the
     * time — that all six settings-write routes were guarded with
     * `verifyAdmin`, so withholding the permission would have shown an ADMIN a
     * page of disabled controls the API would have accepted.
     *
     * The backend has since moved to per-module permissions. `GET
     * /admin/settings` now answers `403 Missing required module permission
     * 'SYSTEM_SETTINGS_EDIT'` for an ADMIN without the grant, verified live
     * against a real account. Settings access is no longer a property of the
     * role at all — it is granted per account in Staff, and will be read from
     * `adminPermissions` once `GET /admin/auth/me` returns it
     * (staff_management_plan.md §3.2, phase A5).
     */
    expect(permissionsForRole('ADMIN')).not.toContain(
      PERMISSIONS.configurationConfigure,
    )
    /* Reading the page is still role-granted; only the writes moved. */
    expect(permissionsForRole('ADMIN')).toContain(PERMISSIONS.configurationView)
    expect(permissionsForRole('SUPER_ADMIN')).toContain(
      PERMISSIONS.configurationConfigure,
    )
  })

  it('reserves staff management for Super Admin alone', () => {
    /*
     * All eight `/admin/staff/*` routes are `verifySuperAdmin`-guarded and an
     * ADMIN gets `403 "Requires SUPER_ADMIN privileges"` from every one —
     * verified live 2026-09-03. No judgement call here, unlike the settings
     * case above.
     */
    expect(permissionsForRole('ADMIN')).not.toContain(PERMISSIONS.staffManage)
    expect(permissionsForRole('MODERATOR')).not.toContain(PERMISSIONS.staffManage)
    expect(permissionsForRole('SUPER_ADMIN')).toContain(PERMISSIONS.staffManage)
  })

  it('reserves feedback management for Super Admin — because nobody else CAN hold it', () => {
    /*
     * A different reason from every other Super-Admin-only entry above, and
     * worth stating precisely (feedback_management_plan.md §3.1).
     *
     * `/admin/feedbacks/*` is guarded by
     * `requirePermission('FEEDBACK_MANAGEMENT')`, which an ADMIN is entitled to
     * hold — except that the key is absent from the enum the staff write routes
     * validate against, so it can never be granted to anyone. The module is
     * reachable only through the `SUPER_ADMIN` wildcard bypass.
     *
     * Granting it to ADMIN here would put a full inbox in their sidebar that
     * 403s on its first request. When the backend adds the key, this permission
     * arrives through `adminPermissions` rather than through this role list, and
     * this test changes with it.
     */
    expect(permissionsForRole('ADMIN')).not.toContain(PERMISSIONS.feedbackManage)
    expect(permissionsForRole('MODERATOR')).not.toContain(PERMISSIONS.feedbackManage)
    expect(permissionsForRole('SUPER_ADMIN')).toContain(PERMISSIONS.feedbackManage)
  })

  it('reserves the database and SMS suites for Super Admin alone', () => {
    // These two are guarded with `verifySuperAdmin`, unlike the six above.
    for (const role of ['ADMIN', 'MODERATOR']) {
      expect(permissionsForRole(role)).not.toContain(PERMISSIONS.settingsDatabase)
      expect(permissionsForRole(role)).not.toContain(PERMISSIONS.settingsSms)
    }
    expect(permissionsForRole('SUPER_ADMIN')).toContain(PERMISSIONS.settingsDatabase)
    expect(permissionsForRole('SUPER_ADMIN')).toContain(PERMISSIONS.settingsSms)
  })

  it('lets a Moderator restrict a capability but not suspend or ban', () => {
    const moderator = permissionsForRole('MODERATOR')
    expect(moderator).toContain(PERMISSIONS.usersView)
    expect(moderator).toContain(PERMISSIONS.usersRestrict)
    expect(moderator).not.toContain(PERMISSIONS.usersSuspend)
    expect(moderator).not.toContain(PERMISSIONS.usersBan)
  })

  it('gives a Moderator no finance or administration access at all', () => {
    const moderator = permissionsForRole('MODERATOR')
    for (const permission of [
      PERMISSIONS.walletsView,
      PERMISSIONS.ledgerView,
      PERMISSIONS.paymentsView,
      PERMISSIONS.withdrawalsView,
      PERMISSIONS.staffManage,
      PERMISSIONS.auditLogsView,
      PERMISSIONS.configurationView,
    ]) {
      expect(moderator).not.toContain(permission)
    }
  })

  it('escalates strictly: Moderator ⊂ Admin ⊂ Super Admin', () => {
    const moderator = permissionsForRole('MODERATOR')
    const admin = permissionsForRole('ADMIN')
    const superAdmin = permissionsForRole('SUPER_ADMIN')

    /*
     * A tier must never hold something the tier above lacks. Without this an
     * "upgrade" could silently remove an ability, which is the kind of RBAC
     * bug nobody notices until an operator is blocked mid-incident.
     */
    for (const permission of moderator) expect(admin).toContain(permission)
    for (const permission of admin) expect(superAdmin).toContain(permission)

    expect(admin.length).toBeGreaterThan(moderator.length)
    expect(superAdmin.length).toBeGreaterThan(admin.length)
  })
})
