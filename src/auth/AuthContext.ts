import { createContext } from 'react'

import type { CurrentAdmin } from '@/types/identity'

import type { Permission } from './permissions'

export interface AuthContextValue {
  admin: CurrentAdmin | null
  loading: boolean
  /** True once the bootstrap request has settled, success or failure. */
  ready: boolean
  error: unknown
  /**
   * Permission predicate. plan.md §3.4: this improves navigation clarity only.
   * The backend re-authorizes every request regardless of what this returns.
   */
  can: (permission: Permission) => boolean
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
