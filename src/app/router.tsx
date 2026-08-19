import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'

import { PERMISSIONS, type Permission } from '@/auth/permissions'
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

function suspended(node: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>
}

/**
 * A module route, wrapped in its permission guard.
 *
 * plan.md §8: the guard renders `ForbiddenState` rather than the page. This is
 * a clarity affordance — the backend rejects the underlying request anyway, so
 * forcing the URL yields no data either way.
 */
function moduleRoute(
  path: string,
  module: string,
  phase: number,
  permission?: Permission,
): RouteObject {
  const page = suspended(<Placeholder module={module} phase={phase} />)
  return {
    path,
    element: permission ? (
      <RequirePermission permission={permission} resource={module.toLowerCase()}>
        {page}
      </RequirePermission>
    ) : (
      page
    ),
  }
}

const moduleRoutes: RouteObject[] = [
  moduleRoute(ROUTES.dashboard, 'Dashboard', 9),
  moduleRoute(ROUTES.users, 'User Management', 3, PERMISSIONS.usersView),
  moduleRoute(ROUTES.socialClubs, 'Social Club Management', 4, PERMISSIONS.clubsView),
  moduleRoute(
    ROUTES.hostApplications,
    'Host Management',
    5,
    PERMISSIONS.hostApplicationsView,
  ),
  moduleRoute(ROUTES.moderation, 'Moderation & Safety', 6, PERMISSIONS.reportsView),
  moduleRoute(ROUTES.diamondTransactions, 'Diamond Economy', 7, PERMISSIONS.ledgerView),
  moduleRoute(ROUTES.payments, 'Payments', 8, PERMISSIONS.paymentsView),
  moduleRoute(ROUTES.withdrawals, 'Withdrawals', 8, PERMISSIONS.withdrawalsView),
  moduleRoute(ROUTES.reports, 'Reports & Analytics', 9, PERMISSIONS.analyticsView),
  moduleRoute(
    ROUTES.notifications,
    'Notifications & CMS',
    10,
    PERMISSIONS.notificationsSend,
  ),
  moduleRoute(
    ROUTES.adminUsers,
    'Admin Users & RBAC',
    10,
    PERMISSIONS.adminUsersManage,
  ),
  moduleRoute(ROUTES.auditLogs, 'Audit Logs', 10, PERMISSIONS.auditLogsView),
  moduleRoute(
    ROUTES.configuration,
    'System Configuration',
    10,
    PERMISSIONS.configurationView,
  ),
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
