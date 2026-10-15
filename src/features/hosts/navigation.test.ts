import { describe, expect, it } from 'vitest'

import { ROUTES } from '@/app/routes'
import { PERMISSIONS, permissionsForRole } from '@/auth/permissions'
import { NAV_SECTIONS } from '@/layouts/navigation'

/**
 * The Host applications nav entry and its guard — phase H4 (plan.md §4.2).
 *
 * The Sidebar filters items by permission, so these assertions are about the
 * data that drives it, which is where a mistake would actually be made.
 */

const community = NAV_SECTIONS.find((section) => section.id === 'community')
const entry = community?.items.find((item) => item.label === 'Host applications')
const roster = community?.items.find((item) => item.label === 'Live hosts')

function visibleTo(role: string): readonly string[] {
  const granted = new Set(permissionsForRole(role))
  return NAV_SECTIONS.flatMap((section) =>
    section.items
      .filter((item) => !item.permission || granted.has(item.permission))
      .map((item) => item.label),
  )
}

describe('where the entry sits', () => {
  it('lives in Community, beside Users and Feedback', () => {
    /*
     * ⚠️ Not a section of its own. Its subject is the same population Users
     * already covers — a consumer account asking for a new capability — and an
     * operator moves between an application and the person who filed it. That
     * is the Feedback case, not the Verifications one, where the subject is a
     * legal identity document and the audience is compliance.
     */
    expect(entry).toBeDefined()
    expect(community?.items.map((item) => item.label)).toEqual([
      'Users',
      'Feedback',
      'Host applications',
      'Live hosts',
    ])
  })

  it('did not earn a section of its own', () => {
    expect(NAV_SECTIONS.map((section) => section.id)).not.toContain('hosts')
    expect(NAV_SECTIONS.map((section) => section.id)).not.toContain('live')
  })

  it('points at the route and matches its own prefix', () => {
    expect(entry?.to).toBe(ROUTES.hostApplications)
    expect(entry?.matchPrefix).toBe('/host-applications')
  })

  it('does not share its glyph with another entry', () => {
    /*
     * ⚠️ Two entries sharing an icon is how an operator clicks the wrong one —
     * the reason Verifications took `BadgeCheck` rather than Staff's
     * `ShieldCheck`.
     */
    const icons = NAV_SECTIONS.flatMap((section) =>
      section.items.map((item) => item.icon),
    )

    expect(icons.filter((icon) => icon === entry?.icon)).toHaveLength(1)
  })

  it('appears even though the queue is empty on every environment', () => {
    /*
     * ⚠️ The deliberate call, asserted so it is not "fixed" later. The routes
     * exist and work; the table holds zero rows (plan.md §2.1). Hiding the
     * entry would make a built feature look unbuilt, and an absent nav item
     * tells an operator nothing — the empty state tells them nothing has been
     * submitted yet, which they can act on.
     */
    expect(entry).toBeDefined()
  })
})

describe('the roster is a sibling, not a child', () => {
  it('is its own entry beside the queue', () => {
    /*
     * ⚠️ Two entries for one feature, deliberately. They are different jobs:
     * the queue is a triage worked through and emptied, the roster is a
     * standing list visited when a broadcasting creator has to be stopped. An
     * operator reaching for "suspend a host during an incident" should not have
     * to know it lives underneath "applications".
     */
    expect(roster).toBeDefined()
    expect(roster?.to).toBe(ROUTES.hosts)
  })

  it('does not highlight itself when the queue is open', () => {
    /*
     * ⚠️ The bug this prevents: `matchPrefix: '/host'` would match
     * `/host-applications` too, leaving both entries lit at once and giving an
     * operator no way to tell which screen they are on.
     */
    expect(roster?.matchPrefix).toBe('/hosts')
    expect('/host-applications'.startsWith(roster?.matchPrefix ?? '')).toBe(false)
  })

  it('does not share its glyph with the queue', () => {
    expect(roster?.icon).not.toBe(entry?.icon)

    const icons = NAV_SECTIONS.flatMap((section) =>
      section.items.map((item) => item.icon),
    )
    expect(icons.filter((icon) => icon === roster?.icon)).toHaveLength(1)
  })

  it('is gated on the same key as the queue, which is wider than it should be', () => {
    /*
     * ⚠️ Asserted so the compromise is visible rather than assumed.
     *
     * Suspending a host ends their income and tears down their live room — a
     * materially more severe act than reviewing an application. The backend
     * exposes no roster-specific permission, and inventing one in the panel
     * would enforce a boundary the server does not check (plan.md O11).
     *
     * If a narrower key ever appears, this test fails and the route guard is
     * the one line that changes with it.
     */
    expect(roster?.permission).toBe(PERMISSIONS.hostApplicationsView)
  })

  it('is hidden from a Moderator', () => {
    expect(visibleTo('MODERATOR')).not.toContain('Live hosts')
  })
})

describe('who sees it', () => {
  it('is gated on host_applications.view', () => {
    expect(entry?.permission).toBe(PERMISSIONS.hostApplicationsView)
  })

  it('is visible to a Super Admin', () => {
    expect(visibleTo('SUPER_ADMIN')).toContain('Host applications')
  })

  it('is visible to an Admin', () => {
    /*
     * ⚠️ The doc admits `ADMIN` or `SUPER_ADMIN`, and the grant predates this
     * module — `hostApplicationsView` was already in `ADMIN_PERMISSIONS`.
     *
     * That it predates the feature is **not evidence it is correct**. It has
     * never been measured: the only credential available is a SUPER_ADMIN,
     * which bypasses module permissions entirely (plan.md O2). If the route
     * turns out to be Super-Admin-only, this is the test that should change
     * and `auth/permissions.ts` is the one line that changes with it.
     */
    expect(visibleTo('ADMIN')).toContain('Host applications')
  })

  it('is hidden from a Moderator', () => {
    expect(visibleTo('MODERATOR')).not.toContain('Host applications')
  })

  it('does not hand a Moderator the key by some other route', () => {
    expect(permissionsForRole('MODERATOR')).not.toContain(
      PERMISSIONS.hostApplicationsView,
    )
    expect(permissionsForRole('ADMIN')).toContain(PERMISSIONS.hostApplicationsView)
  })

  it('gives an unknown role nothing', () => {
    expect(permissionsForRole('CONTENT_EDITOR')).toEqual([])
  })
})
