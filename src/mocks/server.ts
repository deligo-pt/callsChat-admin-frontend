import { setupServer } from 'msw/node'

import { handlers } from './handlers'

/** Node-side mock backend used by the Vitest suite. */
export const server = setupServer(...handlers)
