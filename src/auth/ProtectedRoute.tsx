import { Navigate, Outlet, useLocation } from 'react-router'

import { ROUTES } from '@/app/routes'
import { RouteFallback } from '@/components/feedback'

import { useAuth } from './useAuth'

/**
 * Gate for every authenticated route.
 *
 * plan.md §2.5: a 401 leads to login with the attempted location preserved, so
 * an expired session returns the operator to where they were rather than
 * dumping them on the dashboard.
 */
export function ProtectedRoute() {
  const { admin, ready } = useAuth()
  const location = useLocation()

  if (!ready) {
    // Whole-viewport: the admin shell does not exist yet at this point.
    return <RouteFallback fullscreen />
  }

  if (!admin) {
    return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
