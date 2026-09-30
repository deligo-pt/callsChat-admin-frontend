import { describe, expect, it } from 'vitest'

import { PERMISSIONS, permissionsForRole } from '@/auth/permissions'
import { MODULE_PERMISSION_VALUES } from '@/types/staff'

import {
  GRANTABLE_MODULE_PERMISSIONS,
  MODULE_PERMISSIONS,
  hasGrantableKey,
  describeModulePermission,
  modulePermissionsToPanel,
  sortModulePermissions,
} from './permissionMap'

describe('MODULE_PERMISSIONS', () => {
  it('describes every key the backend enum contains, and adds only the ungrantable one', () => {
    /*
     * The grid is generated from this list, so the two directions matter for
     * different reasons.
     *
     * A schema key missing from the list would silently vanish from the editor
     * — a Super Admin would revoke it by saving, without ever seeing it. That
     * is the assertion this test started as.
     *
     * A list key missing from the schema is the newer risk: as of 2026-09-06
     * the grid renders a ninth row, `FEEDBACK_MANAGEMENT`, which the API
     * enforces on `/admin/feedbacks/*` and rejects on every write route
     * (feedback_management_plan.md §3.1). It is display-only and must never
     * reach a request body, so it is deliberately absent from
     * `modulePermissionSchema` — and it is the ONLY key allowed to be.
     */
    const grantable = MODULE_PERMISSIONS.filter(hasGrantableKey).map(
      (entry) => entry.key,
    )
    expect([...grantable].sort()).toEqual([...MODULE_PERMISSION_VALUES].sort())

    const ungrantable = MODULE_PERMISSIONS.filter((entry) => !hasGrantableKey(entry))
    expect(ungrantable.map((entry) => entry.key)).toEqual(['FEEDBACK_MANAGEMENT'])
  })

  it('keeps the ungrantable key out of anything that can be sent', () => {
    /*
     * The compiler already prevents it — `GRANTABLE_MODULE_PERMISSIONS` is
     * typed `ModulePermission[]`, which does not include the key. This asserts
     * the runtime value too, because the whole grid is data-driven and a
     * mistyped `ungrantable: false` would be a silent 400 for the operator.
     */
    expect(GRANTABLE_MODULE_PERMISSIONS).not.toContain('FEEDBACK_MANAGEMENT')
    expect(MODULE_PERMISSION_VALUES).not.toContain('FEEDBACK_MANAGEMENT')
  })

  it('gives every key a description, because the grid renders them', () => {
    for (const entry of MODULE_PERMISSIONS) {
      expect(entry.description.length).toBeGreaterThan(20)
      expect(entry.label).not.toBe(entry.key)
    }
  })

  it('marks exactly the two Super Admin suites as restricted', () => {
    const restricted = MODULE_PERMISSIONS.filter((entry) => entry.superAdminOnly)
    expect(restricted.map((entry) => entry.key)).toEqual([
      'DATABASE_BACKUP',
      'SMS_GATEWAY_EDIT',
    ])
    expect(GRANTABLE_MODULE_PERMISSIONS).toHaveLength(6)
  })

  it('describes SYSTEM_SETTINGS_EDIT as read and change, not edit', () => {
    /*
     * The key is named `_EDIT` but gates the GET too — verified 2026-09-03
     * when `GET /admin/settings` began answering 403 without it. Labelling it
     * "Edit" would let a Super Admin believe they were granting read-only
     * access to a page that can take the product down.
     */
    const entry = describeModulePermission('SYSTEM_SETTINGS_EDIT')
    expect(entry.description.toLowerCase()).toContain('read and change')
  })

  it('throws on an unknown key rather than returning a placeholder', () => {
    // @ts-expect-error — deliberately outside the enum.
    expect(() => describeModulePermission('NOPE')).toThrow(/Unknown module permission/)
  })

  it('sorts into canonical grid order regardless of input order', () => {
    expect(
      sortModulePermissions(['SMS_GATEWAY_EDIT', 'USER_VIEW', 'DASHBOARD_VIEW']),
    ).toEqual(['DASHBOARD_VIEW', 'USER_VIEW', 'SMS_GATEWAY_EDIT'])
  })
})

describe('modulePermissionsToPanel', () => {
  /**
   * ⚠️ The most important test in this module (staff_management_plan.md §3.1).
   *
   * `GET /admin/auth/me` returns `adminPermissions: []` for a Super Admin —
   * the wildcard is implied by the role and never spelled out as keys. A
   * brand-new account granted nothing returns `[]` too, so the array alone
   * cannot tell them apart.
   *
   * Any check shaped `if (keys.length === 0) denyEverything()` therefore locks
   * the Super Administrator out of their own panel. If this test ever fails,
   * that is what has happened.
   */
  it('gives a Super Admin everything despite an empty permission array', () => {
    const granted = modulePermissionsToPanel([], 'SUPER_ADMIN')

    expect(granted).toContain(PERMISSIONS.staffManage)
    expect(granted).toContain(PERMISSIONS.settingsDatabase)
    expect(granted).toContain(PERMISSIONS.diamondsAdjust)
    expect(granted).toHaveLength(Object.values(PERMISSIONS).length)
  })

  it('gives a Super Admin more than the union of all eight keys', () => {
    /*
     * A tempting simplification is to derive the Super Admin set from the map.
     * It is wrong: the eight keys cover no finance, club, host, moderation or
     * notification permission at all, so that union is strictly smaller than
     * the wildcard the backend actually grants.
     */
    const everyKey = modulePermissionsToPanel(MODULE_PERMISSION_VALUES, 'ADMIN')
    const superAdmin = modulePermissionsToPanel([], 'SUPER_ADMIN')

    expect(superAdmin.length).toBeGreaterThan(everyKey.length)
    expect(everyKey).not.toContain(PERMISSIONS.withdrawalsApprove)
  })

  it('denies by default for an account with no keys', () => {
    expect(modulePermissionsToPanel([], 'ADMIN')).toEqual([])
    expect(modulePermissionsToPanel([], 'MODERATOR')).toEqual([])
  })

  it('expands USER_MODERATE into all four panel permissions it covers', () => {
    // The coarseness that makes the two vocabularies irreconcilable.
    const granted = modulePermissionsToPanel(['USER_MODERATE'], 'MODERATOR')
    expect(granted).toContain(PERMISSIONS.usersSuspend)
    expect(granted).toContain(PERMISSIONS.usersBan)
    expect(granted).toContain(PERMISSIONS.usersRestrict)
    expect(granted).toContain(PERMISSIONS.sessionsRevoke)
  })

  it('does not let DEPLOYMENT_EDIT carry the whole settings module', () => {
    /*
     * Releases live inside the settings page, so this key needs
     * `configurationView` to reach it — but granting `configurationConfigure`
     * too would hand over general, branding, maintenance, chat and platform
     * along with it.
     */
    const granted = modulePermissionsToPanel(['DEPLOYMENT_EDIT'], 'ADMIN')
    expect(granted).toContain(PERMISSIONS.configurationView)
    expect(granted).not.toContain(PERMISSIONS.configurationConfigure)
  })

  it('maps BUSINESS_VERIFY to the verification module', () => {
    /*
     * ⚠️ **This assertion was INVERTED on 2026-09-29**, and the sentence it
     * used to carry is worth keeping: it asserted that `BUSINESS_VERIFY` mapped
     * to nothing, "because no such module exists yet"
     * (staff_management_plan.md §8 O9). Honest emptiness beat an invented key,
     * and it was right for as long as it was true.
     *
     * The Verification & Compliance module now exists (plan.md §4.3), so the
     * empty row would be the dishonest one — a Super Admin ticking this box
     * would grant a key the backend enforces and the panel ignored.
     *
     * It is also the FIRST row in this bridge that hands a non-Super-Admin a
     * whole module rather than widening something they already reach by role,
     * which is why it gets its own test rather than joining a loop.
     */
    expect(modulePermissionsToPanel(['BUSINESS_VERIFY'], 'ADMIN')).toEqual([
      PERMISSIONS.verificationsReview,
    ])
    expect(modulePermissionsToPanel(['BUSINESS_VERIFY'], 'MODERATOR')).toEqual([
      PERMISSIONS.verificationsReview,
    ])
  })

  it('is the only way a non-Super-Admin can reach the verification module', () => {
    /*
     * The contrast with `feedbackManage` is the point (plan.md §4.3).
     *
     * `FEEDBACK_MANAGEMENT` is rejected by every staff write route, so no
     * combination of keys can produce `feedback.manage` — it is reachable only
     * through the SUPER_ADMIN wildcard. `BUSINESS_VERIFY` is in the enum, so
     * `verifications.review` genuinely can be delegated. If this test ever
     * starts passing for a key OTHER than `BUSINESS_VERIFY`, two module
     * permissions have been crossed.
     */
    for (const key of MODULE_PERMISSION_VALUES) {
      const granted = modulePermissionsToPanel([key], 'ADMIN')
      expect(granted.includes(PERMISSIONS.verificationsReview)).toBe(
        key === 'BUSINESS_VERIFY',
      )
    }
  })

  it('does not let verification access follow from the ADMIN role alone', () => {
    /*
     * ⚠️ The reason the grid row above matters. `/admin/verifications/*` is
     * guarded by the module permission, so an ADMIN without the grant is
     * refused — and a role-granted permission would put a vault of identity
     * documents in their sidebar that 403s on its first request. Verified by
     * the same rule that retired the `configurationConfigure` grant.
     */
    expect(permissionsForRole('ADMIN')).not.toContain(PERMISSIONS.verificationsReview)
    expect(permissionsForRole('MODERATOR')).not.toContain(
      PERMISSIONS.verificationsReview,
    )
    expect(permissionsForRole('SUPER_ADMIN')).toContain(PERMISSIONS.verificationsReview)
  })

  it('never grants feedback management to a non-Super-Admin', () => {
    /*
     * `feedback.manage` has no entry in the bridge at all, because there is no
     * backend key that could produce it — `FEEDBACK_MANAGEMENT` is rejected by
     * every write route (feedback_management_plan.md §3.1). The day it becomes
     * grantable, the bridge gains a row and this test flips to asserting the
     * mapping instead.
     */
    const everyKey = modulePermissionsToPanel(MODULE_PERMISSION_VALUES, 'ADMIN')
    expect(everyKey).not.toContain(PERMISSIONS.feedbackManage)
    expect(modulePermissionsToPanel([], 'SUPER_ADMIN')).toContain(
      PERMISSIONS.feedbackManage,
    )
  })

  it('never grants staff management to a non-Super-Admin', () => {
    /*
     * All eight `/admin/staff/*` routes are `verifySuperAdmin`-guarded. No
     * combination of module keys may produce this permission, or the panel
     * would show an ADMIN a section every request to which answers 403.
     */
    const everyKey = modulePermissionsToPanel(MODULE_PERMISSION_VALUES, 'ADMIN')
    expect(everyKey).not.toContain(PERMISSIONS.staffManage)
  })

  it('deduplicates when two keys map to the same panel permission', () => {
    const granted = modulePermissionsToPanel(
      ['SYSTEM_SETTINGS_EDIT', 'DEPLOYMENT_EDIT'],
      'ADMIN',
    )
    expect(granted.filter((p) => p === PERMISSIONS.configurationView)).toHaveLength(1)
  })

  it('denies by default for an unrecognised role', () => {
    expect(modulePermissionsToPanel([], 'AUDITOR')).toEqual([])
    expect(modulePermissionsToPanel([], '')).toEqual([])
  })
})
