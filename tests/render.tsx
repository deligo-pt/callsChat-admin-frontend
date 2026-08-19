import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router'

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
