import {
  Activity,
  BadgeCheck,
  BarChart3,
  CreditCard,
  Gem,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings,
  ShieldAlert,
  UserCog,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react'
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
 * The 12 modules from plan.md §2.1, grouped for scanning rather than listed
 * flat. Grouping matters at 12 items — an operator should find "Withdrawals"
 * by category, not by reading every label.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ label: 'Dashboard', to: ROUTES.dashboard, icon: LayoutDashboard }],
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
      {
        label: 'Social Clubs',
        to: ROUTES.socialClubs,
        icon: UsersRound,
        permission: PERMISSIONS.clubsView,
        matchPrefix: '/social-clubs',
      },
      {
        label: 'Hosts',
        to: ROUTES.hostApplications,
        icon: BadgeCheck,
        permission: PERMISSIONS.hostApplicationsView,
        matchPrefix: '/host',
      },
      {
        label: 'Moderation',
        to: ROUTES.moderation,
        icon: ShieldAlert,
        permission: PERMISSIONS.reportsView,
        matchPrefix: '/moderation',
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      {
        label: 'Diamonds',
        to: ROUTES.diamondTransactions,
        icon: Gem,
        permission: PERMISSIONS.ledgerView,
        matchPrefix: '/diamonds',
      },
      {
        label: 'Payments',
        to: ROUTES.payments,
        icon: CreditCard,
        permission: PERMISSIONS.paymentsView,
        matchPrefix: '/payments',
      },
      {
        label: 'Withdrawals',
        to: ROUTES.withdrawals,
        icon: Wallet,
        permission: PERMISSIONS.withdrawalsView,
        matchPrefix: '/withdrawals',
      },
    ],
  },
  {
    id: 'insight',
    label: 'Insight',
    items: [
      {
        label: 'Reports',
        to: ROUTES.reports,
        icon: BarChart3,
        permission: PERMISSIONS.analyticsView,
        matchPrefix: '/reports',
      },
      {
        label: 'Announcements',
        to: ROUTES.notifications,
        icon: Megaphone,
        permission: PERMISSIONS.notificationsSend,
        matchPrefix: '/notifications',
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      {
        label: 'Admin Users',
        to: ROUTES.adminUsers,
        icon: UserCog,
        permission: PERMISSIONS.adminUsersManage,
        matchPrefix: '/admin-users',
      },
      {
        label: 'Audit Logs',
        to: ROUTES.auditLogs,
        icon: ScrollText,
        permission: PERMISSIONS.auditLogsView,
        matchPrefix: '/audit-logs',
      },
      {
        label: 'Configuration',
        to: ROUTES.configuration,
        icon: Settings,
        permission: PERMISSIONS.configurationView,
        matchPrefix: '/configuration',
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
