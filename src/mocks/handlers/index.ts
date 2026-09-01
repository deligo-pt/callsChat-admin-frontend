import { authHandlers } from './auth'
import { resourceHandlers } from './resources'
import { searchHandlers } from './search'
import { settingsHandlers } from './settings'

export const handlers = [
  ...authHandlers,
  ...searchHandlers,
  ...settingsHandlers,
  ...resourceHandlers,
]
