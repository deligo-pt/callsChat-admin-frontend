import { describe, expect, it } from 'vitest'

import { ROUTES } from '@/app/routes'
import { PERMISSIONS, permissionsForRole } from '@/auth/permissions'
import { NAV_SECTIONS } from '@/layouts/navigation'

/**
 * The `COMMUNITY` section's Feedback entry.
 *
 * The Sidebar filters items by permission, so these assertions are about the
 * data that drives it — which is where a mistake would actually be made.
 *
 * The failure this guards against is not cosmetic. Showing an ADMIN a
 * "Feedback" entry would take them to a page whose every request answers
 * `403 "Access Denied: Missing required module permission
 * 'FEEDBACK_MANAGEMENT'"` — a message that reads like something a Super Admin
 * could fix by granting the key, when in fact nobody can hold it
 * (feedback_management_plan.md §3.1).
 */

const community = NAV_SECTIONS.find((section) => section.id === 'community')
const feedback = community?.items.find((item) => item.label === 'Feedback')

function visibleTo(role: string): readonly string[] {
  const granted = new Set(permissionsForRole(role))
  return NAV_SECTIONS.flatMap((section) =>
    section.items
      .filter((item) => !item.permission || granted.has(item.permission))
      .map((item) => item.label),
  )
}

describe('the Feedback nav entry', () => {
  it('lives in Community, below Users, rather than in a section of its own', () => {
    /*
     * The contrast with Staff is deliberate (§4.2). Staff earned a section
     * because its subject is the panel's operators; Feedback's subject is the
     * same population Users covers, and moving between a ticket and the
     * reporter's account is the expected path.
     */
    expect(community?.items.map((item) => item.label)).toEqual(['Users', 'Feedback'])
  })

  it('points at /feedback and keeps the ticket page highlighted', () => {
    expect(feedback?.to).toBe(ROUTES.feedback)
    expect(feedback?.matchPrefix).toBe('/feedback')
  })

  it('carries no sub-menu', () => {
    // Status is a filter, not a route — there is nothing to nest.
    expect(feedback?.children).toBeUndefined()
  })

  it('is gated on feedback.manage', () => {
    expect(feedback?.permission).toBe(PERMISSIONS.feedbackManage)
  })

  it('did not add a section', () => {
    expect(NAV_SECTIONS.map((section) => section.id)).toEqual([
      'overview',
      'community',
      'platform',
      'access',
    ])
  })
})

describe('who sees it', () => {
  it('is visible to a Super Admin', () => {
    expect(visibleTo('SUPER_ADMIN')).toContain('Feedback')
  })

  it('is invisible to an Admin and a Moderator', () => {
    expect(visibleTo('ADMIN')).not.toContain('Feedback')
    expect(visibleTo('MODERATOR')).not.toContain('Feedback')
  })

  it('leaves Users visible to them, so the section does not vanish', () => {
    /*
     * The section survives with one item, unlike ACCESS which disappears
     * entirely. That is the reason Feedback was put here rather than given a
     * heading it would take down with it.
     */
    expect(visibleTo('ADMIN')).toContain('Users')
    expect(visibleTo('MODERATOR')).toContain('Users')
  })

  it('is invisible to an unrecognised role', () => {
    expect(visibleTo('AUDITOR')).not.toContain('Feedback')
  })
})
