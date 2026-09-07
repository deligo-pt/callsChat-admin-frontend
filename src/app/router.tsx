import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'

import { PERMISSIONS } from '@/auth/permissions'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { RequirePermission } from '@/auth/RequirePermission'
import { RouteFallback } from '@/components/feedback'
import { AdminLayout } from '@/layouts/AdminLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { isProduction } from '@/env'

import { ROUTES } from './routes'
import { RouteErrorBoundary } from './RouteErrorBoundary'

const LoginPage = lazy(() =>
  import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const DesignGallery = lazy(() =>
  import('@/features/design-system/DesignGallery').then((m) => ({
    default: m.DesignGallery,
  })),
)
const Placeholder = lazy(() =>
  import('@/features/placeholder/ModulePlaceholder').then((m) => ({
    default: m.ModulePlaceholder,
  })),
)
const UsersListPage = lazy(() =>
  import('@/features/users/UsersListPage').then((m) => ({ default: m.UsersListPage })),
)
const UserDetailPage = lazy(() =>
  import('@/features/users/UserDetailPage').then((m) => ({
    default: m.UserDetailPage,
  })),
)
const AccountSecurityPage = lazy(() =>
  import('@/features/auth/AccountSecurityPage').then((m) => ({
    default: m.AccountSecurityPage,
  })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const GeneralTab = lazy(() =>
  import('@/features/settings/general/GeneralTab').then((m) => ({
    default: m.GeneralTab,
  })),
)
const BrandingTab = lazy(() =>
  import('@/features/settings/general/BrandingTab').then((m) => ({
    default: m.BrandingTab,
  })),
)
const MaintenanceTab = lazy(() =>
  import('@/features/settings/general/MaintenanceTab').then((m) => ({
    default: m.MaintenanceTab,
  })),
)
const ChatTab = lazy(() =>
  import('@/features/settings/chat/ChatTab').then((m) => ({ default: m.ChatTab })),
)
const PlatformTab = lazy(() =>
  import('@/features/settings/platform/PlatformTab').then((m) => ({
    default: m.PlatformTab,
  })),
)
const ReleasesTab = lazy(() =>
  import('@/features/settings/releases/ReleasesTab').then((m) => ({
    default: m.ReleasesTab,
  })),
)
const DatabaseTab = lazy(() =>
  import('@/features/settings/database/DatabaseTab').then((m) => ({
    default: m.DatabaseTab,
  })),
)
const FeedbackListPage = lazy(() =>
  import('@/features/feedback/FeedbackListPage').then((m) => ({
    default: m.FeedbackListPage,
  })),
)
const FeedbackDetailPage = lazy(() =>
  import('@/features/feedback/FeedbackDetailPage').then((m) => ({
    default: m.FeedbackDetailPage,
  })),
)
const StaffListPage = lazy(() =>
  import('@/features/staff/StaffListPage').then((m) => ({
    default: m.StaffListPage,
  })),
)
const StaffCreatePage = lazy(() =>
  import('@/features/staff/StaffCreatePage').then((m) => ({
    default: m.StaffCreatePage,
  })),
)
const StaffDetailPage = lazy(() =>
  import('@/features/staff/StaffDetailPage').then((m) => ({
    default: m.StaffDetailPage,
  })),
)

function suspended(node: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>
}

/**
 * Routes for the modules the BACKEND actually serves.
 *
 * Verified 2026-08-25: only auth, users and dashboard/analytics exist. The
 * previous placeholder routes for Social Clubs, Hosts, Moderation, Diamonds,
 * Payments, Withdrawals, Announcements, Admin Users, Audit Logs and
 * Configuration have been removed — every one of them 404s server-side, so the
 * page could never have shown data.
 *
 * Forcing one of those URLs now falls through to the not-found route, which is
 * the honest answer: the module does not exist yet. A placeholder claiming
 * "coming in Phase 7" was worse, because it made an unbuilt backend look like a
 * built-but-broken frontend.
 *
 * **Restore a route the same day its endpoints ship**, alongside its nav entry
 * in `layouts/navigation.ts`.
 */
const moduleRoutes: RouteObject[] = [
  /*
   * GET /admin/dashboard/snapshot · /trends · /admin/analytics all exist, but
   * the screen itself is Phase 9 — so this stays a placeholder for now. It is
   * the one placeholder with a real backend behind it.
   */
  {
    path: ROUTES.dashboard,
    element: (
      <RequirePermission permission={PERMISSIONS.analyticsView} resource="dashboard">
        {suspended(<Placeholder module="Dashboard" phase={9} />)}
      </RequirePermission>
    ),
  },

  /*
   * No permission guard: every signed-in admin may manage their OWN
   * credentials, regardless of role. Gating this would lock a Moderator out of
   * changing their own password.
   */
  { path: ROUTES.account, element: suspended(<AccountSecurityPage />) },

  /* Phase 3A — the first real module surface. */
  {
    path: ROUTES.users,
    element: (
      <RequirePermission permission={PERMISSIONS.usersView} resource="users">
        {suspended(<UsersListPage />)}
      </RequirePermission>
    ),
  },

  /* Phase 3B — the six read-only detail tabs. */
  {
    path: '/users/:userId',
    element: (
      <RequirePermission permission={PERMISSIONS.usersView} resource="users">
        {suspended(<UserDetailPage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase S1 — System Settings (system_settings_plan.md §4.1).
   *
   * The shell is one guarded route with a child per section, so each section
   * is bookmarkable and a Super-Admin-only section can 403 on its own rather
   * than taking the whole page with it.
   *
   * Only the sections that exist are routed. `maintenance`, `chat`,
   * `platform`, `releases`, `database` and `sms` fall through to the not-found
   * route until their phases ship, matching the tab rail in `SettingsPage`.
   */
  {
    path: ROUTES.settings,
    element: (
      <RequirePermission
        permission={PERMISSIONS.configurationView}
        resource="system settings"
      >
        {suspended(<SettingsPage />)}
      </RequirePermission>
    ),
    children: [
      { index: true, element: <Navigate to={ROUTES.settingsGeneral} replace /> },
      { path: 'general', element: suspended(<GeneralTab />) },
      { path: 'branding', element: suspended(<BrandingTab />) },
      { path: 'maintenance', element: suspended(<MaintenanceTab />) },
      { path: 'chat', element: suspended(<ChatTab />) },
      { path: 'platform', element: suspended(<PlatformTab />) },
      { path: 'releases', element: suspended(<ReleasesTab />) },
      /*
       * Super Admin only, matching the route's `verifySuperAdmin` guard. Gated
       * here as well as in the sidebar so a typed URL gets the standard 403
       * rather than a screen that fails on its first request.
       */
      {
        path: 'database',
        element: (
          <RequirePermission
            permission={PERMISSIONS.settingsDatabase}
            resource="database backups"
          >
            {suspended(<DatabaseTab />)}
          </RequirePermission>
        ),
      },
    ],
  },

  /*
   * Phase F1 — Feedback & Support (feedback_management_plan.md §4.1).
   *
   * Super Admin only, and for a reason unlike every other guard in this file:
   * `/admin/feedbacks/*` is gated by
   * `requirePermission('FEEDBACK_MANAGEMENT')`, a key the staff write routes
   * refuse to grant to anybody (§3.1). The module is reachable only through
   * the SUPER_ADMIN wildcard, so guarding here as well as in the sidebar means
   * a typed URL gets the standard 403 rather than a screen that 403s on its
   * first request.
   */
  {
    path: ROUTES.feedback,
    element: (
      <RequirePermission permission={PERMISSIONS.feedbackManage} resource="feedback">
        {suspended(<FeedbackListPage />)}
      </RequirePermission>
    ),
  },

  /* Phase F2 — the ticket. Guarded identically; there is no `/feedback/new`. */
  {
    path: '/feedback/:id',
    element: (
      <RequirePermission permission={PERMISSIONS.feedbackManage} resource="feedback">
        {suspended(<FeedbackDetailPage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase A1 — Staff & Access Control (staff_management_plan.md §4.1).
   *
   * Super Admin only. All eight `/admin/staff/*` routes are guarded with
   * `verifySuperAdmin` and answer `403 "Requires SUPER_ADMIN privileges"` to
   * anyone else, so guarding here as well as in the sidebar means a typed URL
   * gets the standard 403 rather than a screen that fails on its first request.
   */
  {
    path: ROUTES.staff,
    element: (
      <RequirePermission permission={PERMISSIONS.staffManage} resource="staff">
        {suspended(<StaffListPage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase A2 — provisioning. Guarded identically, and declared **before**
   * `/staff/:id`: React Router prefers a static segment over a dynamic one, but
   * relying on that silently is how `new` ends up being looked up as a staff id.
   */
  {
    path: ROUTES.staffNew,
    element: (
      <RequirePermission permission={PERMISSIONS.staffManage} resource="staff">
        {suspended(<StaffCreatePage />)}
      </RequirePermission>
    ),
  },

  /* Phase A3 — the record, and its permission grid. */
  {
    path: '/staff/:id',
    element: (
      <RequirePermission permission={PERMISSIONS.staffManage} resource="staff">
        {suspended(<StaffDetailPage />)}
      </RequirePermission>
    ),
  },
]

if (!isProduction) {
  moduleRoutes.push({ path: ROUTES.design, element: suspended(<DesignGallery />) })
}

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [{ path: ROUTES.login, element: suspended(<LoginPage />) }],
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <AdminLayout />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { index: true, element: <Navigate to={ROUTES.dashboard} replace /> },
          ...moduleRoutes,
          {
            path: '*',
            element: suspended(<Placeholder module="Not found" phase={0} />),
          },
        ],
      },
    ],
  },
])
