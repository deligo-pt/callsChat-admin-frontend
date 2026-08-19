import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router'

import { ErrorState, ForbiddenState, NotFoundState } from '@/components/feedback'
import { Button } from '@/components/ui/button'

/**
 * Route-level error boundary.
 *
 * plan.md §1E: an uncaught render or loader failure lands here instead of a
 * blank screen. HTTP-shaped errors map to the matching safe state — a 403
 * renders ForbiddenState, which leaks nothing about the record.
 */
export function RouteErrorBoundary() {
  const error = useRouteError()
  const navigate = useNavigate()

  const goBack = (
    <Button variant="outline" onClick={() => void navigate(-1)}>
      Go back
    </Button>
  )

  if (isRouteErrorResponse(error)) {
    if (error.status === 403) return <ForbiddenState />
    if (error.status === 404) return <NotFoundState action={goBack} />

    return (
      <ErrorState
        title={`Request failed (${error.status})`}
        description={error.statusText || 'The request could not be completed.'}
        onRetry={() => void navigate(0)}
      />
    )
  }

  const message =
    error instanceof Error
      ? error.message
      : 'An unexpected error occurred while rendering this page.'

  return <ErrorState description={message} onRetry={() => void navigate(0)} />
}
