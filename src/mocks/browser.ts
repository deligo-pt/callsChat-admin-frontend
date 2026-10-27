import { setupWorker } from 'msw/browser'

import { handlers } from './handlers'
import { exposeHostFixtureControls } from './handlers/hosts'
import { exposeWalletFixtureControls } from './handlers/wallet'
import { exposeScenarioControls } from './scenarios'

export const worker = setupWorker(...handlers)

/**
 * Start the mock backend.
 *
 * plan.md §2.7: with `VITE_USE_MOCKS=true` the app is fully browsable — real
 * pagination, real latency, real error states — with no backend running.
 */
export async function startMockBackend(): Promise<void> {
  exposeScenarioControls()
  exposeHostFixtureControls()
  exposeWalletFixtureControls()

  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: '/mockServiceWorker.js' },
  })

  console.warn(
    '[mocks] Mock backend running. Sign in with nadia@callschat.app (Super Admin), ' +
      'tomas@callschat.app (Admin) or elena@callschat.app (Moderator) and any password. ' +
      "Toggle failure states with __mockScenario.set('error' | 'empty' | 'forbidden' | 'slow' | 'normal'). " +
      'The host queue and roster start empty, as production does — ' +
      'populate them with __mockHosts.seed(). The diamond wallet queue and ' +
      'packages do the same: __mockWallet.seed().',
  )
}
