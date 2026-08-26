import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router'

import { setRefreshHandler, setUnauthorizedHandler } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import { AuthProvider } from '@/auth/AuthProvider'
import { isAuthPath, refreshSession } from '@/auth/session'
import { clearSession } from '@/auth/tokenStore'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { isProduction } from '@/env'

import { createQueryClient } from './queryClient'
import { router } from './router'

/**
 * Application root.
 *
 * Provider order matters: the query client wraps `AuthProvider`, because the
 * session itself is a query. That is what lets a sign-out clear the whole
 * cache in one place instead of each feature remembering to.
 *
 * A 401 sets the session to `null`, which `ProtectedRoute` turns into a
 * declarative redirect. Nothing here navigates imperatively — doing so fights
 * the router and loses the attempted location.
 */
export default function App() {
  const [queryClient] = useState(() => {
    const client: ReturnType<typeof createQueryClient> = createQueryClient(() => {
      client.setQueryData(queryKeys.session.current, null)
    })
    return client
  })

  useEffect(() => {
    /*
     * A 401 reaches here only after the refresh interceptor has already tried
     * and failed to renew the session, so at this point the session really is
     * over.
     */
    setUnauthorizedHandler(() => {
      /*
       * Discard the credentials as well as the cached session. With bearer auth
       * an expired token would otherwise keep being attached to every
       * subsequent request, producing a loop of 401s instead of a clean
       * redirect to sign-in.
       */
      clearSession()
      queryClient.setQueryData(queryKeys.session.current, null)
    })

    // Lets the client renew an expired token without importing the auth layer.
    setRefreshHandler(refreshSession, isAuthPath)

    return () => {
      setUnauthorizedHandler(null)
      setRefreshHandler(null)
    }
  }, [queryClient])

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delayDuration={200}>
          <RouterProvider router={router} />
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </AuthProvider>
      {!isProduction ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  )
}
