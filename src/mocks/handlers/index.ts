import { authHandlers } from './auth'
import { feedbackHandlers } from './feedback'
import { resourceHandlers } from './resources'
import { searchHandlers } from './search'
import { settingsHandlers } from './settings'
import { staffHandlers } from './staff'

export const handlers = [
  ...authHandlers,
  ...searchHandlers,
  ...settingsHandlers,
  /*
   * Before `resourceHandlers`, which carries a catch-all for the unbuilt
   * modules — a later generic handler would otherwise swallow `/admin/staff`.
   */
  ...staffHandlers,
  ...feedbackHandlers,
  ...resourceHandlers,
]
