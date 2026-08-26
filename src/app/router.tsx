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
