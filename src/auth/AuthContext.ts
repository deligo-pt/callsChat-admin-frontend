import { createContext } from 'react'

import type { CurrentAdmin } from '@/types/identity'

import type { Permission } from './permissions'

export interface SignOutOptions {
  /** Revoke every session on the account, not just this browser's. */
  readonly allDevices?: boolean
}

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
  /**
   * Ends the session and clears every cached record.
   *
   * With `{ allDevices: true }` it revokes the account's other sessions too —
   * and unlike the default, it REJECTS on failure rather than signing out
   * locally anyway. Callers must handle that: a global sign-out the operator
   * believes succeeded when it did not is the failure mode worth avoiding.
   */
  signOut: (options?: SignOutOptions) => Promise<void>
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
