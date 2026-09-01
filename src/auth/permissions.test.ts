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

  it('lets an Admin write system settings, following the live guards', () => {
    /*
     * A deliberate divergence from doc/RBAC, Security, and Privacy.md:52,
     * which reserves configuration writes for Super Admin.
     *
     * All six settings-write routes are guarded with `verifyAdmin` on the live
     * API, verified 2026-09-01 (system_settings_plan.md §2.1 / §4.3).
     * Withholding this would show an ADMIN a settings page of permanently
     * disabled controls that the API would in fact have accepted — a lie about
     * capability. plan.md §1 makes the backend the source of truth.
     *
     * Tracked as system_settings_plan.md §8 O1: if the doc is the intended
     * policy, the route guards tighten and this expectation inverts.
     */
    expect(permissionsForRole('ADMIN')).toContain(PERMISSIONS.configurationConfigure)
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
      PERMISSIONS.adminUsersManage,
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
