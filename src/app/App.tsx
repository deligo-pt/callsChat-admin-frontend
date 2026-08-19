import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router'

import { setUnauthorizedHandler } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import { AuthProvider } from '@/auth/AuthProvider'
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
    setUnauthorizedHandler(() => {
      queryClient.setQueryData(queryKeys.session.current, null)
    })
    return () => setUnauthorizedHandler(null)
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
