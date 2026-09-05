import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * Send focus back where it came from when a dialog closes.
 *
 * Radix restores focus to its `DialogTrigger` — but a dialog opened from
 * component state has no trigger element, so it restores to nothing and a
 * keyboard user lands back at the top of the document, having lost the button
 * they were on. Every confirm dialog in this application is state-driven.
 *
 * The opener is tracked by a `focusin` listener rather than read when `open`
 * flips: by the time an effect could read `document.activeElement`, the dialog
 * has already taken focus.
 *
 * Two details are load-bearing, and both were found by the dialog capturing
 * its own textarea as the "opener":
 *
 * 1. **`useLayoutEffect`, not `useEffect`.** Radix moves focus in a layout
 *    effect, which runs before passive effects — so a passive cleanup removes
 *    the listener *after* the dialog has already stolen focus.
 * 2. **Focus landing inside a dialog is ignored outright.** Effect ordering is
 *    subtle enough that it should not be the only thing standing between a
 *    keyboard user and a lost focus position.
 *
 * Pair it with `onCloseAutoFocus`, preventing Radix's default so the two do not
 * fight over where focus lands.
 */
export function useReturnFocus(open: boolean): () => void {
  const opener = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    // While the dialog is open, stop tracking: focus is inside it.
    if (open) return

    function remember(event?: FocusEvent) {
      const active = (event?.target ?? document.activeElement) as unknown
      if (!(active instanceof HTMLElement)) return
      /* Never remember something inside a dialog as the thing that opened it. */
      if (active.closest('[role="dialog"], [role="alertdialog"]')) return
      opener.current = active
    }

    remember()
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [open])

  return useCallback(() => {
    const element = opener.current
    // It may have been unmounted by the very action the dialog confirmed.
    if (element?.isConnected) element.focus()
  }, [])
}
