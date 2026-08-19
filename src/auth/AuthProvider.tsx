import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, type ReactNode } from 'react'

import { UnauthorizedError } from '@/api/errors'
import { queryKeys } from '@/api/queryKeys'

import { AuthContext, type AuthContextValue } from './AuthContext'
import type { Permission } from './permissions'
import { fetchCurrentAdmin, signOut as signOutRequest } from './session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const {
    data: admin,
    isPending,
    isFetched,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.session.current,
    queryFn: ({ signal }) => fetchCurrentAdmin(signal),
    // An unauthenticated visitor is an expected state, not a failure to retry.
    retry: (failureCount, queryError) =>
      queryError instanceof UnauthorizedError ? false : failureCount < 1,
    staleTime: 5 * 60_000,
  })

  const permissions = useMemo(
    () => new Set(admin?.permissions ?? []),
    [admin?.permissions],
  )

  const can = useCallback(
    (permission: Permission) => permissions.has(permission),
    [permissions],
  )

  const handleSignOut = useCallback(async () => {
    try {
      await signOutRequest()
    } finally {
      /*
       * Clear the cache unconditionally. Even if the logout call fails, the
       * next admin at this browser must never see the previous one's records.
       */
      queryClient.clear()
    }
  }, [queryClient])

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.session.current })
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      admin: admin ?? null,
      loading: isPending,
      // Settled either way: a failed bootstrap means "not signed in", not "still loading".
      ready: isFetched || isError,
      error,
      can,
      signOut: handleSignOut,
      refresh,
    }),
    [admin, isPending, isFetched, isError, error, can, handleSignOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
