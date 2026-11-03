import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router'

import { AuthProvider } from '@/auth/AuthProvider'
import { TooltipProvider } from '@/components/ui/tooltip'

function Providers({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </MemoryRouter>
  )
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return render(ui, { wrapper: Providers, ...options })
}

/**
 * As `renderWithProviders`, plus a fresh query client and the signed-in
 * session — for components that read permissions or fetch on their own (the
 * Host / User badge does both). The caller sets the session first
 * (`signInMockAdmin` + `setSession`).
 */
export function renderWithSession(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function SessionProviders({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Providers>{children}</Providers>
        </AuthProvider>
      </QueryClientProvider>
    )
  }
  return render(ui, { wrapper: SessionProviders, ...options })
}

/**
 * Force `useMediaQuery` to a fixed viewport so the DataTable ↔ RecordCardList
 * swap can be asserted deterministically (plan.md §1C acceptance criterion).
 */
export function setViewport(width: number): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => {
      const match = /min-width:\s*(\d+)px/.exec(query)
      const min = match?.[1] ? Number(match[1]) : 0
      return {
        matches: width >= min,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }
    },
  })
}

export * from '@testing-library/react'
