import { useEffect } from 'react'
import { useBlocker } from 'react-router'

/**
 * Warn before abandoning unsaved settings edits.
 *
 * Two exits have to be covered and they need different mechanisms:
 *
 * 1. **In-app navigation** — switching tabs, clicking the sidebar. React
 *    Router's `useBlocker` intercepts these. It needs a data router, which
 *    `app/router.tsx` provides.
 * 2. **Leaving the page entirely** — reload, close, typing a new URL. Only the
 *    browser's own `beforeunload` prompt can interrupt that, and it cannot be
 *    styled or customised.
 *
 * Blocking navigation is a real cost — an operator who genuinely wants to
 * leave now has to confirm — so it is armed only while the form is actually
 * dirty, and the confirmation is a plain `window.confirm` rather than a modal
 * we would have to keep in sync with the router's own blocked/proceed state.
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  message = 'You have unsaved changes. Leave without saving?',
): void {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (blocker.state !== 'blocked') return

    if (window.confirm(message)) blocker.proceed()
    else blocker.reset()
  }, [blocker, message])

  useEffect(() => {
    if (!isDirty) return

    const handler = (event: BeforeUnloadEvent) => {
      /*
       * `preventDefault` is the modern signal; browsers ignore any custom
       * text and show their own wording, so none is supplied.
       */
      event.preventDefault()
      // Safari and older Chrome still require a truthy returnValue.
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])
}
