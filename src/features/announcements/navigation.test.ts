import { describe, expect, it } from 'vitest'

import { ROUTES } from '@/app/routes'
import { PERMISSIONS, permissionsForRole } from '@/auth/permissions'
import { NAV_SECTIONS } from '@/layouts/navigation'
import { MODULE_PERMISSION_VALUES } from '@/types/staff'

/**
 * The Announcements nav entry and its guard (plan.md §4.2, §4.3, phase B4).
 *
 * The Sidebar filters items by permission, so these assertions are about the
 * data that drives it — which is where a mistake would actually be made.
 *
 * ⚠️ `features/staff/permissionMap.ts` is deliberately **not** imported here.
 * `features/staff/inert.test.ts` is a tripwire that fails the moment anything
 * outside `features/staff` imports the bridge, because wiring it today blanks
 * an ADMIN's navigation on reload. The claim this file needs — that no backend
 * module key exists for announcements — is made against the staff enum itself,
 * which is the thing the bridge would have to bridge.
 */

const platform = NAV_SECTIONS.find((section) => section.id === 'platform')
const announcements = platform?.items.find((item) => item.label === 'Announcements')

function visibleTo(role: string): readonly string[] {
  const granted = new Set(permissionsForRole(role))
  return NAV_SECTIONS.flatMap((section) =>
    section.items
      .filter((item) => !item.permission || granted.has(item.permission))
      .map((item) => item.label),
  )
}

describe('where the entry sits', () => {
  it('lives in Platform, beside System Settings', () => {
    /*
     * ⚠️ Not Community, and not a section of its own (§4.2). Community's
     * entries share one subject — a consumer account — and an operator moves
     * between a ticket and the reporter who filed it. An announcement is
     * addressed to a *segment* and leads back to no individual record.
     */
    expect(announcements).toBeDefined()
    expect(platform?.items.map((item) => item.label)).toEqual([
      'Announcements',
      'System Settings',
    ])
  })

  it('did not earn a section of its own', () => {
    /* A one-item section was rejected for Feedback and earned only by Staff. */
    expect(NAV_SECTIONS.map((section) => section.id)).not.toContain('announcements')
    expect(NAV_SECTIONS.map((section) => section.id)).not.toContain('communications')
  })

  it('points at the route and matches its own prefix', () => {
    expect(announcements?.to).toBe(ROUTES.announcements)
    expect(announcements?.matchPrefix).toBe('/announcements')
  })

  it('has no children, because there is no second route', () => {
    /*
     * There is no `GET /admin/announcements/:id`, so there is no detail page to
     * link to and composing is a dialog (§3.2, §4.1).
     */
    expect(announcements?.children).toBeUndefined()
  })

  it('does not share its glyph with another section', () => {
    /*
     * ⚠️ Two sections sharing an icon is how an operator clicks the wrong one —
     * the reason Verifications took `BadgeCheck` rather than Staff's
     * `ShieldCheck`.
     */
    const icons = NAV_SECTIONS.flatMap((section) =>
      section.items.map((item) => item.icon),
    )
    const mine = icons.filter((icon) => icon === announcements?.icon)

    expect(mine).toHaveLength(1)
  })
})

describe('who sees it', () => {
  it('is gated on notifications.broadcast', () => {
    expect(announcements?.permission).toBe(PERMISSIONS.notificationsBroadcast)
  })

  it('is visible to a Super Admin', () => {
    expect(visibleTo('SUPER_ADMIN')).toContain('Announcements')
  })

  it('is visible to an Admin — the B4 correction', () => {
    /*
     * ⚠️ **The assertion B4 exists for.** B2 shipped this module gated on a
     * Super-Admin-only key, so an ADMIN saw no entry and got a 403 for a route
     * `broadcast.md` §4 says they may use. Granting the key fixes that, and this
     * is the test that fails if the grant is ever reverted by accident.
     *
     * ⚠️ It encodes a rule read from the doc, not measured against the service
     * (plan.md O3) — no ADMIN bearer token exists to confirm it with. If the
     * route turns out to be Super-Admin-only after all, this is the test that
     * should change, and the fix is one line in `auth/permissions.ts`.
     */
    expect(visibleTo('ADMIN')).toContain('Announcements')
  })

  it('is hidden from a Moderator', () => {
    /*
     * `broadcast.md` §4 admits `ADMIN` and `SUPER_ADMIN` and nobody else. A
     * Moderator broadcasting to the entire userbase is the failure this guards.
     */
    expect(visibleTo('MODERATOR')).not.toContain('Announcements')
  })

  it('does not hand a Moderator the key by some other route', () => {
    /* Belt and braces: the permission itself, not just the nav filtering. */
    expect(permissionsForRole('MODERATOR')).not.toContain(
      PERMISSIONS.notificationsBroadcast,
    )
    expect(permissionsForRole('ADMIN')).toContain(PERMISSIONS.notificationsBroadcast)
  })

  it('gives an unknown role nothing', () => {
    /* Denied by default — a new backend role inherits nothing by accident. */
    expect(permissionsForRole('CONTENT_EDITOR')).toEqual([])
  })
})

describe('there is nothing for the staff grid to grant', () => {
  it('has no module key in the backend enum', () => {
    /*
     * ⚠️ This is what makes the role grant above correct rather than reckless,
     * and it is the whole difference from `verifications.review`.
     *
     * `BUSINESS_VERIFY` is in this enum, so verification access is a per-account
     * grant and a role grant there would be a lie. Announcements has no key at
     * all — verified live 2026-10-04 against
     * `PATCH /admin/staff/:id/permissions`, whose rejection listed all eight and
     * named none of them — so the role is the only thing the API can be gating
     * on, and `features/staff/permissionMap.ts` has nothing to bridge.
     *
     * If a key ever appears here, this test fails and the role grant has to be
     * reconsidered: it would mean the API had started requiring the role *and* a
     * permission, which is exactly the situation that retired the
     * `configurationConfigure` role grant.
     */
    const keys = MODULE_PERMISSION_VALUES.map((key) => key.toUpperCase())

    expect(keys).toHaveLength(8)
    expect(keys.some((key) => key.includes('ANNOUNCEMENT'))).toBe(false)
    expect(keys.some((key) => key.includes('NOTIFICATION'))).toBe(false)
    expect(keys.some((key) => key.includes('BROADCAST'))).toBe(false)
  })
})
