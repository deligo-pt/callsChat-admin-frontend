import { Activity, LayoutDashboard, Users } from 'lucide-react'
import type { ComponentType } from 'react'

import { ROUTES } from '@/app/routes'
import { PERMISSIONS, type Permission } from '@/auth/permissions'

export interface NavItem {
  readonly label: string
  readonly to: string
  readonly icon: ComponentType<{ className?: string }>
  /** Hidden when the acting admin lacks this permission. */
  readonly permission?: Permission
  /** Match nested routes, e.g. /users/:id highlights "Users". */
  readonly matchPrefix?: string
}

export interface NavSection {
  readonly id: string
  readonly label: string
  readonly items: readonly NavItem[]
}

/**
 * Navigation reflects what the BACKEND actually serves — nothing more.
 *
 * Verified against `https://api.callschat.com/api/v1` on 2026-08-25: the only
 * admin surfaces that exist are auth, users, and dashboard/analytics. Every
 * other module in plan.md §2.1 — Social Clubs, Hosts, Moderation, Diamonds,
 * Payments, Withdrawals, Announcements, Admin Users, Audit Logs,
 * Configuration — returns 404.
 *
 * Those entries used to appear here and led to placeholder screens. A menu
 * item that navigates to "this module is not built" is worse than no menu
 * item: it looks like a broken product rather than an unfinished one, and it
 * gives an operator no way to tell the two apart.
 *
 * **Add a section back the same day its endpoints ship**, not before.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        label: 'Dashboard',
        to: ROUTES.dashboard,
        icon: LayoutDashboard,
        // GET /admin/dashboard/snapshot · /trends · /admin/analytics
        permission: PERMISSIONS.analyticsView,
      },
    ],
  },
  {
    id: 'community',
    label: 'Community',
    items: [
      {
        label: 'Users',
        to: ROUTES.users,
        icon: Users,
        permission: PERMISSIONS.usersView,
        matchPrefix: '/users',
      },
    ],
  },
]

/** Dev-only entry, appended in non-production builds. */
export const DESIGN_NAV_ITEM: NavItem = {
  label: 'Design System',
  to: ROUTES.design,
  icon: Activity,
}
