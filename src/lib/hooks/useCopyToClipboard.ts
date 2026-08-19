import { useCallback, useEffect, useRef, useState } from 'react'

/** Copy text to the clipboard and expose a short-lived "copied" flag. */
export function useCopyToClipboard(resetAfterMs = 1600): {
  copied: boolean
  copy: (value: string) => Promise<boolean>
} {
  const [copied, setCopied] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [])

  const copy = useCallback(
    async (value: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        if (timeout.current) clearTimeout(timeout.current)
        timeout.current = setTimeout(() => setCopied(false), resetAfterMs)
        return true
      } catch {
        setCopied(false)
        return false
      }
    },
    [resetAfterMs],
  )

  return { copied, copy }
}
