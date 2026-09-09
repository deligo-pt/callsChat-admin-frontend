import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { server } from '@/mocks/server'

/**
 * The MSW mock backend runs for the whole suite, so component and integration
 * tests exercise the same handlers the app uses in development (plan.md §2.7).
 */
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

/**
 * jsdom does not implement matchMedia, ResizeObserver or scrollIntoView, all of
 * which Radix primitives and our responsive hooks rely on.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Element.prototype.scrollIntoView = vi.fn()

/**
 * Pointer capture, which jsdom does not implement at all.
 *
 * Radix's `Select`, `DropdownMenu` and `Popover` call these on every pointer
 * interaction, so without them a click on a trigger throws
 * `target.hasPointerCapture is not a function` and the menu never opens. That
 * cost the staff and feedback suites real coverage: both had to assert on the
 * constants their menus were built from instead of on the menu, and
 * `feedback_management_plan.md` F3 needs the assignment combobox driven for
 * real — the `{"adminId": null}` unassign is only observable by selecting it.
 *
 * Added 2026-09-07, in F3. It is a jsdom gap, not a workaround for anything in
 * this codebase.
 */
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}
