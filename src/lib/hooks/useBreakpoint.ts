import { useMediaQuery } from './useMediaQuery'

/**
 * Breakpoints from plan.md §6.1 — these mirror the Tailwind defaults so the
 * JS-side swap and the CSS-side layout never disagree.
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

export type Breakpoint = keyof typeof BREAKPOINTS

/** True when the viewport is at or above the given breakpoint. */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS[breakpoint]}px)`)
}

/**
 * The single decision point for the DataTable ↔ RecordCardList swap
 * (plan.md §6.2). Both surfaces render from one column definition, so this is
 * the only place the threshold is expressed.
 */
export function useIsTableViewport(): boolean {
  return useBreakpoint('lg')
}

/** Current breakpoint name — used by the design gallery indicator. */
export function useCurrentBreakpoint(): Breakpoint | 'base' {
  const sm = useBreakpoint('sm')
  const md = useBreakpoint('md')
  const lg = useBreakpoint('lg')
  const xl = useBreakpoint('xl')
  const xxl = useBreakpoint('2xl')

  if (xxl) return '2xl'
  if (xl) return 'xl'
  if (lg) return 'lg'
  if (md) return 'md'
  if (sm) return 'sm'
  return 'base'
}
