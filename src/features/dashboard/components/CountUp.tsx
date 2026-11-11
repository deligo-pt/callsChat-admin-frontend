import { useEffect, useRef, useState } from 'react'

import { useMediaQuery } from '@/lib/hooks/useMediaQuery'

/**
 * A number that counts up from 0 the first time it is shown (plan.md D4).
 *
 * Only the first value animates. A 30s poll that moves 438 → 441 just shows
 * 441: a counter re-running every half minute would be noise, and would make
 * a glance read the wrong number mid-flight. Under reduced motion it never
 * animates.
 *
 * Screen readers get the final value only (`aria-hidden` on the moving digits,
 * the real figure in an sr-only span), so nothing is announced 30 times.
 */
export function CountUp({
  value,
  format,
  durationMs = 600,
  className,
}: {
  value: number
  format: (value: number) => string
  durationMs?: number
  className?: string
}) {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)')
  const animated = useRef(false)
  const [shown, setShown] = useState(() => (reduce ? value : 0))

  useEffect(() => {
    if (animated.current || reduce || value === 0) {
      animated.current = true
      setShown(value)
      return
    }
    animated.current = true
    const start = performance.now()
    let frame = 0
    let done = false
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      /* Ease-out cubic: fast start, gentle landing. */
      const eased = 1 - (1 - progress) ** 3
      setShown(Math.round(value * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
      else done = true
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      /* Interrupted (StrictMode's double effect, or unmount): let it run again. */
      if (!done) animated.current = false
    }
  }, [value, reduce, durationMs])

  return (
    <span className={className}>
      <span aria-hidden="true" className="tabular-nums">
        {format(shown)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
