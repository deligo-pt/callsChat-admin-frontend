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
      PERMISSIONS.configurationConfigure,
    ]) {
      expect(admin).not.toContain(permission)
    }
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
