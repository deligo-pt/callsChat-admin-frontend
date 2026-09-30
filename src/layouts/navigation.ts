import {
  Activity,
  BadgeCheck,
  LayoutDashboard,
  MessageSquare,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react'
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
      /*
       * Added 2026-09-07 under the rule above: the `/admin/feedbacks/*`
       * endpoints shipped and were verified live, so the entry appears the
       * same day (feedback_management_plan.md §4.2).
       *
       * **In Community, below Users, rather than in a section of its own.**
       * The contrast with Staff is deliberate: Staff earned its own section
       * because its subject is the panel's operators and its actions are
       * irreversible. Feedback's subject is the same population Users already
       * covers, and moving between a ticket and the reporter's account is the
       * expected path — a one-item section would put a rule between two
       * entries that belong together.
       *
       * `feedback.manage` is Super-Admin-only, so an ADMIN or MODERATOR never
       * sees this entry. That matches the backend exactly, though for an
       * unusual reason: the permission the routes enforce cannot be granted to
       * anyone (§3.1), so the wildcard is the only way in.
       */
      {
        label: 'Feedback',
        to: ROUTES.feedback,
        icon: MessageSquare,
        permission: PERMISSIONS.feedbackManage,
        matchPrefix: '/feedback',
      },
    ],
  },
  /*
   * Added 2026-09-29 under the rule above: the `/admin/verifications/*`
   * endpoints shipped and were verified live, so the section appears the same
   * day (plan.md §4.2).
   *
   * **Its own section, unlike Feedback — and the contrast is the point.**
   * Feedback sits inside Community because it shares Community's subject,
   * consumer accounts, and an operator moves between a ticket and the
   * reporter. Verification's subject is a legal identity document, its audience
   * is a compliance officer rather than a support agent, and the work does not
   * flow into or out of the other Community screens.
   *
   * A heading of its own is also a small, useful friction. This is not a place
   * to wander into: every document opened here is recorded against the
   * operator's name and IP address.
   *
   * ⚠️ `BadgeCheck`, not `ShieldCheck` — Staff already owns that glyph, and two
   * sections sharing an icon in the same rail is how an operator clicks the
   * wrong one.
   *
   * `verifications.review` is Super-Admin-only **today**, but unlike
   * `feedback.manage` it is genuinely grantable: `BUSINESS_VERIFY` is in the
   * staff enum, so this entry appears for a granted ADMIN the day
   * `GET /admin/auth/me` returns `adminPermissions` (plan.md §4.3).
   */
  {
    id: 'compliance',
    label: 'Compliance',
    items: [
      {
        label: 'Verifications',
        to: ROUTES.verifications,
        icon: BadgeCheck,
        permission: PERMISSIONS.verificationsReview,
        matchPrefix: '/verifications',
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
  /*
   * Added 2026-09-03 under the rule above: the `/admin/staff/*` endpoints
   * shipped and were verified live, so the section appears the same day
   * (staff_management_plan.md §4.2).
   *
   * **Last, deliberately.** This is the least-visited section and the most
   * dangerous — the only one whose subject is the panel's own operators. Below
   * Platform it stays out of the path of daily work without being hidden.
   *
   * One item, no sub-menu: a collapsible group holding a single child would be
   * chrome for its own sake. `/staff/new` and `/staff/:id` are reached from
   * the directory, not from the rail.
   *
   * `staff.manage` is Super-Admin-only, so an ADMIN or MODERATOR never sees
   * this heading at all — the Sidebar drops a section once every item in it is
   * filtered out. That matches the backend exactly: all eight routes answer
   * `403 "Requires SUPER_ADMIN privileges"` to anyone else.
   */
  {
    id: 'access',
    label: 'Access',
    items: [
      {
        label: 'Staff',
        to: ROUTES.staff,
        icon: ShieldCheck,
        permission: PERMISSIONS.staffManage,
        matchPrefix: '/staff',
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
