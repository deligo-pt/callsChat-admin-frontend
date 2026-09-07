import { describe, expect, it } from 'vitest'

import { ROUTES } from '@/app/routes'
import { PERMISSIONS, permissionsForRole } from '@/auth/permissions'
import { NAV_SECTIONS } from '@/layouts/navigation'

/**
 * The `ACCESS` section's visibility.
 *
 * The Sidebar filters items by permission and drops a section once every item
 * in it is filtered out, so these assertions are about the data that drives
 * that — which is where a mistake would actually be made.
 *
 * The failure this guards against is not cosmetic. Showing an ADMIN a "Staff"
 * entry would take them to a page whose every request answers `403 "Requires
 * SUPER_ADMIN privileges"` — the "broken product rather than an unfinished
 * one" failure that `layouts/navigation.ts` exists to prevent.
 */

const accessSection = NAV_SECTIONS.find((section) => section.id === 'access')

function visibleTo(role: string): readonly string[] {
  const granted = new Set(permissionsForRole(role))
  return NAV_SECTIONS.flatMap((section) =>
    section.items
      .filter((item) => !item.permission || granted.has(item.permission))
      .map((item) => item.label),
  )
}

describe('ACCESS navigation section', () => {
  it('exists, with Staff as its only item', () => {
    expect(accessSection).toBeDefined()
    expect(accessSection?.items.map((item) => item.label)).toEqual(['Staff'])
  })

  it('points at /staff and matches its nested routes', () => {
    const staff = accessSection?.items[0]
    expect(staff?.to).toBe(ROUTES.staff)
    // So /staff/new and /staff/:id keep the parent highlighted.
    expect(staff?.matchPrefix).toBe('/staff')
  })

  it('carries no sub-menu', () => {
    // One item, one page tree — a collapsible group would be chrome for itself.
    expect(accessSection?.items[0]?.children).toBeUndefined()
  })

  it('sits last, below Platform', () => {
    /*
     * Least visited and most dangerous: out of the path of daily work, but
     * not hidden.
     */
    expect(NAV_SECTIONS.at(-1)?.id).toBe('access')
  })

  it('is gated on staff.manage', () => {
    expect(accessSection?.items[0]?.permission).toBe(PERMISSIONS.staffManage)
  })
})

describe('who sees it', () => {
  it('is visible to a Super Admin', () => {
    expect(visibleTo('SUPER_ADMIN')).toContain('Staff')
  })

  it('is invisible to an Admin and a Moderator', () => {
    expect(visibleTo('ADMIN')).not.toContain('Staff')
    expect(visibleTo('MODERATOR')).not.toContain('Staff')
  })

  it('is invisible to an unrecognised role', () => {
    expect(visibleTo('AUDITOR')).not.toContain('Staff')
  })
})
