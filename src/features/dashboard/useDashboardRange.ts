import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import {
  DEFAULT_TIMEFRAME,
  isDashboardTimeframe,
  type DashboardTimeframe,
} from '@/types/dashboard'

/**
 * The chart's timeframe, kept in `?range=` (plan.md D7) so a view can be
 * shared and survives a reload. An unknown value falls back to the default
 * rather than sending the API a timeframe it would reject with a 400.
 *
 * Changing it replaces the history entry: flicking between ranges should not
 * fill the Back button.
 */
export function useDashboardRange(): [
  DashboardTimeframe,
  (next: DashboardTimeframe) => void,
] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('range')
  const range = isDashboardTimeframe(raw) ? raw : DEFAULT_TIMEFRAME

  const setRange = useCallback(
    (next: DashboardTimeframe) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current)
          if (next === DEFAULT_TIMEFRAME) updated.delete('range')
          else updated.set('range', next)
          return updated
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return [range, setRange]
}
