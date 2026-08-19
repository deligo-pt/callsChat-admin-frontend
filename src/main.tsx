import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Self-hosted Roboto — no external font CDN (plan.md §11E, CSP).
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/600.css'
import '@fontsource/roboto/700.css'
import '@fontsource/roboto-mono/400.css'

import App from '@/app/App.tsx'
import { isMockMode } from '@/env'
import '@/styles/globals.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root was not found in index.html')
}

/**
 * The mock backend must be intercepting before React makes its first request,
 * otherwise the session bootstrap races the service worker registration.
 */
async function bootstrap(): Promise<void> {
  if (isMockMode) {
    const { startMockBackend } = await import('@/mocks/browser')
    await startMockBackend()
  }

  createRoot(rootElement!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
