import { useSyncExternalStore } from 'react'

/**
 * Subscribe to a CSS media query.
 *
 * useSyncExternalStore keeps the value correct across concurrent renders and
 * gives a stable server/initial snapshot, which matters because the whole
 * table-vs-card swap hangs off this.
 */
export function useMediaQuery(query: string): boolean {
  function subscribe(onChange: () => void): () => void {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const list = window.matchMedia(query)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }

  function getSnapshot(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  }

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
