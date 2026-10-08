import '@testing-library/jest-dom/vitest'

import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { server } from '@/mocks/server'

/**
 * How long `findBy*` and `waitFor` are allowed to wait — plan.md O11.
 *
 * ⚠️ **Raised from Testing Library's 1000ms default on 2026-10-08**, after the
 * suite was measured failing 1 run in 2 on an otherwise idle machine. The
 * failures rotated across announcements, feedback, verifications and bootstrap,
 * never the same test twice, which is what kept them looking like four separate
 * problems instead of one.
 *
 * They were not. Every one was a **timeout**, in one of two shapes:
 *
 * - `Unable to find role="button" and name "Save changes"` — every editable
 *   control on a settings screen is disabled until `AuthProvider` resolves
 *   `GET /admin/auth/me`, which lands *after* the record query. The wait is
 *   correct; 1000ms is simply not always enough for two chained requests
 *   through MSW plus a re-render.
 * - `Test timed out in 5000ms` — the announcements editor tests type into the
 *   hostile fixture, whose body runs to several thousand characters. `userEvent`
 *   dispatches a full event sequence per keystroke.
 *
 * ⚠️ This raises a ceiling; it does not paper over a product bug. The
 * assertions are waiting for work that genuinely happens, and a test that is
 * actually broken still fails — just later. The cost is that a genuinely
 * hanging test now takes 5s rather than 1s to report.
 */
configure({ asyncUtilTimeout: 5000 })

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
