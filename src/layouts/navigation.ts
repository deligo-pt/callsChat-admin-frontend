import { Activity, LayoutDashboard, Settings2, Users } from 'lucide-react'
import type { ComponentType } from 'react'

import { ROUTES } from '@/app/routes'
import { SETTINGS_SECTIONS } from '@/app/settingsSections'
import { PERMISSIONS, type Permission } from '@/auth/permissions'

/**
 * A second-level entry, rendered indented beneath its parent.
 *
 * No icon: at this depth an icon adds visual noise without adding meaning,
 * and the indent plus the bullet already carry the hierarchy.
 */
export interface NavChild {
  readonly label: string
  readonly to: string
  /** Hidden when the acting admin lacks this permission. */
  readonly permission?: Permission
}

export interface NavItem {
  readonly label: string
  readonly to: string
  readonly icon: ComponentType<{ className?: string }>
  /** Hidden when the acting admin lacks this permission. */
  readonly permission?: Permission
  /** Match nested routes, e.g. /users/:id highlights "Users". */
  readonly matchPrefix?: string
  /**
   * Sub-items, revealed by expanding the parent.
   *
   * The parent stays a real link: clicking it navigates *and* expands, because
   * an entry that looks clickable but only toggles is a small, repeated
   * annoyance for anyone who just wants to get to the page.
   */
  readonly children?: readonly NavChild[]
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
  /*
   * Added 2026-09-01 under the rule above: the `/admin/settings/*` endpoints
   * shipped and were verified live, so the section comes back the same day
   * rather than ahead of it (system_settings_plan.md §4.2).
   *
   * `configuration.view` gates the entry; the two Super Admin sections inside
   * gate themselves, so an ADMIN still sees the page — just five tabs of it.
   */
  {
    id: 'platform',
    label: 'Platform',
    items: [
      {
        label: 'System Settings',
        to: ROUTES.settings,
        icon: Settings2,
        permission: PERMISSIONS.configurationView,
        matchPrefix: '/settings',
        /*
         * The sections live in `app/settingsSections.ts` so the sidebar and
         * the settings page read one list. Unbuilt sections are filtered out
         * here rather than rendered disabled — same rule as the modules above.
         */
        children: SETTINGS_SECTIONS.filter((section) => section.shipped).map(
          (section) => ({
            label: section.label,
            to: section.to,
            ...(section.permission ? { permission: section.permission } : {}),
          }),
        ),
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
