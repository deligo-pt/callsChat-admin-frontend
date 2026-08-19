import { Outlet } from 'react-router'

import { ForbiddenState } from '@/components/feedback'

import type { Permission } from './permissions'
import { useAuth } from './useAuth'

export interface RequirePermissionProps {
  permission: Permission
  /** Named in the access-denied message. Never include record values. */
  resource?: string
  children?: React.ReactNode
}

/**
 * Route- and block-level permission guard.
 *
 * plan.md §3.4 / §8: renders a safe access-denied state that leaks nothing —
 * not whether the record exists, not what it contains. The backend enforces
 * the same rule independently.
 */
export function RequirePermission({
  permission,
  resource,
  children,
}: RequirePermissionProps) {
  const { can } = useAuth()

  if (!can(permission)) {
    return <ForbiddenState {...(resource ? { resource } : {})} />
  }

  return <>{children ?? <Outlet />}</>
}
