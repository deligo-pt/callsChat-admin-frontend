import { describe, expect, it } from 'vitest'

import { ROUTES } from '@/app/routes'
import { PERMISSIONS, permissionsForRole } from '@/auth/permissions'
import { NAV_SECTIONS } from '@/layouts/navigation'

/**
 * The `COMPLIANCE` section (plan.md §4.2, §4.3).
 *
 * The Sidebar filters items by permission, so these assertions are about the
 * data that drives it — which is where a mistake would actually be made.
 *
 * ⚠️ The bridge claim — that granting `BUSINESS_VERIFY` yields
 * `verifications.review`, which is what makes this module delegable at all — is
 * asserted in `features/staff/permissionMap.test.ts`, **not here**.
 *
 * It was written here first and had to move. `features/staff/inert.test.ts` is
 * a tripwire that fails the moment anything outside `features/staff` imports
 * the bridge, because wiring it today blanks an ADMIN's navigation on reload
 * (staff_management_plan.md §3.2). A test import cannot cause that, but
 * narrowing the tripwire to buy one duplicate assertion would trade a real
 * guard for a convenience — so the duplicate went instead.
 */

const compliance = NAV_SECTIONS.find((section) => section.id === 'compliance')
const verifications = compliance?.items.find((item) => item.label === 'Verifications')

function visibleTo(role: string): readonly string[] {
  const granted = new Set(permissionsForRole(role))
  return NAV_SECTIONS.flatMap((section) =>
    section.items
      .filter((item) => !item.permission || granted.has(item.permission))
      .map((item) => item.label),
  )
}

describe('the Verifications nav entry', () => {
  it('earned a section of its own, unlike Feedback', () => {
    /*
     * The contrast is the point (§4.2). Feedback sits inside Community because
     * it shares Community's subject — consumer accounts — and an operator moves
     * between a ticket and the reporter. Verification's subject is a legal
     * identity document and its audience is a compliance officer, so the work
     * does not flow into or out of the other Community screens.
     */
    expect(compliance?.label).toBe('Compliance')
    expect(compliance?.items.map((item) => item.label)).toEqual(['Verifications'])
  })

  it('sits below Community and above Platform', () => {
    const ids = NAV_SECTIONS.map((section) => section.id)
    expect(ids.indexOf('compliance')).toBeGreaterThan(ids.indexOf('community'))
    expect(ids.indexOf('compliance')).toBeLessThan(ids.indexOf('platform'))
  })

  it('points at /verifications and keeps the application page highlighted', () => {
    expect(verifications?.to).toBe(ROUTES.verifications)
    expect(verifications?.matchPrefix).toBe('/verifications')
  })

  it('carries no sub-menu', () => {
    // Status is a filter, not a route — there is nothing to nest.
    expect(verifications?.children).toBeUndefined()
  })

  it('is gated on verifications.review', () => {
    expect(verifications?.permission).toBe(PERMISSIONS.verificationsReview)
  })

  it('does not reuse the Staff icon', () => {
    /*
     * Two sections sharing a glyph in the same rail is how an operator clicks
     * the wrong one — and these two are the panel's most consequential screens.
     */
    const staff = NAV_SECTIONS.find((section) => section.id === 'access')?.items[0]
    expect(verifications?.icon).not.toBe(staff?.icon)
  })
})

describe('who sees it', () => {
  it('is visible to a Super Admin', () => {
    expect(visibleTo('SUPER_ADMIN')).toContain('Verifications')
  })

  it('is invisible to an Admin and a Moderator by role alone', () => {
    /*
     * ⚠️ Not because they are forbidden — because the permission is granted per
     * account, not by role (§4.3). `/admin/verifications/*` is guarded by the
     * `BUSINESS_VERIFY` module permission, so a role-granted entry would put a
     * vault of identity documents in an ADMIN's sidebar that 403s on its first
     * request.
     */
    expect(visibleTo('ADMIN')).not.toContain('Verifications')
    expect(visibleTo('MODERATOR')).not.toContain('Verifications')
  })

  it('takes its whole section with it when hidden', () => {
    /*
     * Unlike Community, which survives on Users. A one-item section disappears
     * entirely when its item is filtered out — which is correct here, and is
     * the cost that made Feedback join Community instead.
     */
    expect(visibleTo('ADMIN')).not.toContain('Verifications')
    expect(compliance?.items).toHaveLength(1)
  })

  it('is invisible to an unrecognised role', () => {
    expect(visibleTo('AUDITOR')).not.toContain('Verifications')
  })
})
