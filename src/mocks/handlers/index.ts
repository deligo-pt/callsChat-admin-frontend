import { authHandlers } from './auth'
import { resourceHandlers } from './resources'
import { searchHandlers } from './search'

export const handlers = [...authHandlers, ...searchHandlers, ...resourceHandlers]
