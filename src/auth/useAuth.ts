import { useContext } from 'react'

import { AuthContext, type AuthContextValue } from './AuthContext'
import type { Permission } from './permissions'

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>.')
  }
  return context
}

/**
 * Permission predicate for hiding controls the admin cannot use.
 *
 * plan.md §3.4: this is a clarity affordance, not a security control. Every
 * request is authorized again server-side.
 */
export function usePermission(): (permission: Permission) => boolean {
  return useAuth().can
}

/** Convenience for a single permission check. */
export function useCan(permission: Permission): boolean {
  return useAuth().can(permission)
}
