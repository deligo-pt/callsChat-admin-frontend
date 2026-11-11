import type { CSSProperties } from 'react'

/**
 * The dashboard's entrance (plan.md D4): each block slides up 12px and fades
 * in, one after another, ~60ms apart. `tw-animate-css` does the animating.
 *
 * - `fill-mode-both` keeps a block invisible until its turn, so the stagger
 *   reads as a sequence rather than a flash followed by a hop.
 * - `motion-reduce:animate-none` removes the animation outright. The global
 *   reduced-motion rule only shortens durations — the *delay* would remain, so
 *   cards would still pop in one by one. Here they are simply there.
 * - It runs on mount only. The 30s polls change numbers, not elements, so
 *   nothing slides again while the page is open.
 */
export const SLIDE_IN =
  'animate-in fade-in slide-in-from-bottom-3 duration-500 ease-out fill-mode-both motion-reduce:animate-none'

const STEP_MS = 60
/* Past ~10 steps the last card waits too long; later ones share the tail. */
const MAX_STEPS = 10

export function slideIn(order: number): { className: string; style: CSSProperties } {
  const step = Math.min(Math.max(0, order), MAX_STEPS)
  return {
    className: SLIDE_IN,
    style: { ['--tw-animation-delay' as string]: `${step * STEP_MS}ms` },
  }
}
