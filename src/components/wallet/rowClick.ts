import type { SyntheticEvent } from 'react'

/**
 * Spread on a link inside a clickable row: the click (and Enter) stop at the
 * link, so opening an account or an admin does not also open the row's
 * entry underneath it.
 */
export const STOP_ROW_CLICK = {
  onClick: (event: SyntheticEvent) => event.stopPropagation(),
  onKeyDown: (event: SyntheticEvent) => event.stopPropagation(),
}
