import { authHandlers } from './auth'
import { bootstrapHandlers } from './bootstrap'
import { feedbackHandlers } from './feedback'
import { resourceHandlers } from './resources'
import { searchHandlers } from './search'
import { settingsHandlers } from './settings'
import { staffHandlers } from './staff'
import { verificationHandlers } from './verifications'

export const handlers = [
  ...authHandlers,
  ...bootstrapHandlers,
  ...searchHandlers,
  ...settingsHandlers,
  /*
   * Before `resourceHandlers`, which carries a catch-all for the unbuilt
   * modules — a later generic handler would otherwise swallow `/admin/staff`.
   */
  ...staffHandlers,
  ...feedbackHandlers,
  ...verificationHandlers,
  ...resourceHandlers,
]
