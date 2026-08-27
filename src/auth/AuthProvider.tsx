import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from 'react'

import { UnauthorizedError } from '@/api/errors'
import { queryKeys } from '@/api/queryKeys'

import {
  AuthContext,
  type AuthContextValue,
  type SignOutOptions,
} from './AuthContext'
import { permissionsForRole, type Permission } from './permissions'
import {
  fetchCurrentAdmin,
  signOut as signOutRequest,
  signOutEverywhere as signOutEverywhereRequest,
} from './session'
import { getSession, isExpired, onSessionChange } from './tokenStore'

/**
 * Subscribe to the credential store.
 *
 * This must be reactive, not read once per render: signing out clears the
 * credentials from outside React, and without a subscription the provider
 * would not re-render — leaving the operator sitting on a data page after
 * clicking "Sign out" until they happened to navigate.
 */
function useStoredSession() {
  return useSyncExternalStore(
    onSessionChange,
    getSession,
    // Server snapshot: no browser storage exists during SSR or prerender.
    () => null,
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const session = useStoredSession()
  const hasToken = session !== null && !isExpired(session)

  const {
    data: admin,
    isPending,
    isFetched,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.session.current,
    queryFn: ({ signal }) => fetchCurrentAdmin(signal),
    /*
     * With bearer auth there is no ambient credential: no token means no
     * session, so calling /admin/auth/me would be a guaranteed 401. Skipping
     * it keeps the unauthenticated first paint free of a pointless request
     * and a console error.
     */
    enabled: hasToken,
    // An unauthenticated visitor is an expected state, not a failure to retry.
    retry: (failureCount, queryError) =>
      queryError instanceof UnauthorizedError ? false : failureCount < 1,
    staleTime: 5 * 60_000,
  })

  /*
   * Prefer the server's permission list; fall back to the role map.
   *
   * plan.md §10.1 / 3A′ #1: the API returns no `permissions[]` today, so in
   * practice the fallback is what runs. The preference is wired up now so the
   * switch happens on the backend's schedule, not ours — the day
   * `/admin/auth/me` includes the array, this starts honouring it and
   * `permissionsForRole` goes unused, with nothing to deploy.
   *
   * An EMPTY array from the server is respected as "no permissions", not
   * treated as missing. Falling back to the role map there would silently
   * re-grant access the backend had just revoked.
   */
  const permissions = useMemo<ReadonlySet<string>>(() => {
    if (!admin) return new Set()
    return new Set(admin.permissions ?? permissionsForRole(admin.role))
  }, [admin])

  const can = useCallback(
    (permission: Permission) => permissions.has(permission),
    [permissions],
  )

  /**
   * Forget everything this browser knows about the departing admin.
   *
   * The cache is cleared as well as the credentials: the next admin at this
   * browser must never see the previous one's records. Nulling the session
   * query is separate and necessary — `clear()` empties the cache, but this
   * observer is disabled the moment the credentials go, so it does not
   * necessarily re-publish `undefined`, leaving a stale admin object in
   * context and the operator sitting on a data page after signing out.
   */
  const discardLocalState = useCallback(() => {
    queryClient.clear()
    queryClient.setQueryData(queryKeys.session.current, null)
  }, [queryClient])

  const handleSignOut = useCallback(
    async ({ allDevices = false }: SignOutOptions = {}) => {
      if (allDevices) {
        /*
         * Deliberately unguarded. If the revocation failed, nothing was
         * revoked — discarding the local state here would strand the operator
         * at the sign-in screen with no error and every other device still
         * live. Let it throw; the caller reports it and this browser stays
         * signed in, which is the truth.
         */
        await signOutEverywhereRequest()
        discardLocalState()
        return
      }

      try {
        await signOutRequest()
      } finally {
        // Best effort: this browser stops presenting the credentials regardless.
        discardLocalState()
      }
    },
    [discardLocalState],
  )

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.session.current })
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      admin: admin ?? null,
      // A disabled query reports `isPending` forever; no token means settled, not loading.
      loading: hasToken && isPending,
      // Settled either way: a failed bootstrap means "not signed in", not "still loading".
      ready: !hasToken || isFetched || isError,
      error,
      can,
      signOut: handleSignOut,
      refresh,
    }),
    [
      admin,
      hasToken,
      isPending,
      isFetched,
      isError,
      error,
      can,
      handleSignOut,
      refresh,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
