import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resetMockStaff } from '@/mocks/handlers/staff'
import { server } from '@/mocks/server'
import { SETTABLE_STAFF_STATUS_VALUES } from '@/types/staff'
import { render, screen, setViewport } from '@tests/render'

import { StaffListPage } from './StaffListPage'

/**
 * Staff directory behaviour.
 *
 * The assertions that matter here are the ones about **deleted accounts**.
 * Because the backend leaves soft-deleted rows in the list and 404s every
 * action against them (staff_management_plan.md §3.4), three things have to
 * hold at once and none of them are visible from a happy-path render: the
 * badge must say "Deleted", the row must not navigate, and the count the page
 * reports must reconcile with the rows it shows.
 */

function renderPage(initialEntry = '/staff') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <TooltipProvider delayDuration={0}>
            <Routes>
              <Route path="/staff" element={children} />
              {/* Landing here is the assertion that a row navigated. */}
              <Route path="/staff/:id" element={<div>detail page</div>} />
            </Routes>
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  render(<StaffListPage />, { wrapper: Wrapper })
  return userEvent.setup()
}

beforeEach(() => {
  resetMockStaff()
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('staff directory', () => {
  it('lists staff members once loaded', async () => {
    renderPage()

    expect(await screen.findByText('Sarah Connor')).toBeInTheDocument()
    expect(screen.getByText('Marcus Webb')).toBeInTheDocument()
  })

  it('renders a loading state before the first response', () => {
    renderPage()
    expect(screen.queryByText('Sarah Connor')).not.toBeInTheDocument()
  })

  it('renders an error state with a retry when the request fails', async () => {
    server.use(
      http.get('*/api/v1/admin/staff', () => new Response(null, { status: 500 })),
    )
    renderPage()

    expect(
      await screen.findByRole('button', { name: /try again|retry/i }),
    ).toBeVisible()
  })

  it('states that the list cannot be re-sorted', async () => {
    /*
     * The endpoint accepts `sortBy` and ignores it, so no column is sortable.
     * Saying so is the honest alternative to a control that does nothing.
     */
    renderPage()
    await screen.findByText('Sarah Connor')

    expect(screen.getByText(/cannot be re-sorted/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sort by/i })).not.toBeInTheDocument()
  })
})

describe('deleted accounts (§3.4)', () => {
  it('hides them by default and says how many it hid', async () => {
    renderPage()
    await screen.findByText('Sarah Connor')

    // The seed carries one soft-deleted row.
    expect(screen.queryByText('Probe Temp')).not.toBeInTheDocument()
    expect(screen.getByText(/1 deleted account is hidden/i)).toBeInTheDocument()
  })

  it('shows them when the toggle is cleared', async () => {
    renderPage('/staff?hideDeleted=false')

    expect(await screen.findByText('Probe Temp')).toBeInTheDocument()
    expect(screen.queryByText(/deleted accounts are hidden/i)).not.toBeInTheDocument()
  })

  it('labels a deleted account "Deleted", never "Inactive"', async () => {
    /*
     * The single most important label in the module. The backend's own value
     * is `INACTIVE`, and the consumer-user map renders that as "Inactive" —
     * which would tell an operator that a deleted colleague is merely idle.
     */
    renderPage('/staff?hideDeleted=false')
    await screen.findByText('Probe Temp')

    expect(screen.getByText('Deleted')).toBeInTheDocument()
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument()
  })

  it('does not navigate when a deleted row is clicked', async () => {
    /*
     * Its detail page could only offer actions the API answers 404 to. The
     * assertion is that the detail route never renders.
     */
    const user = renderPage('/staff?hideDeleted=false')
    await screen.findByText('Probe Temp')

    await user.click(screen.getByText('Probe Temp'))

    expect(screen.queryByText('detail page')).not.toBeInTheDocument()
  })

  it('navigates when a live row is clicked', async () => {
    const user = renderPage()
    await screen.findByText('Sarah Connor')

    await user.click(screen.getByText('Sarah Connor'))

    expect(await screen.findByText('detail page')).toBeInTheDocument()
  })
})

describe('filters', () => {
  it('restores a role filter from the URL and sends it to the API', async () => {
    renderPage('/staff?role=ADMIN')

    // Marcus is the ADMIN in the seed; Sarah is a MODERATOR and must be gone.
    expect(await screen.findByText('Marcus Webb')).toBeInTheDocument()
    expect(screen.queryByText('Sarah Connor')).not.toBeInTheDocument()
  })

  it('offers only the three statuses the API filter accepts', async () => {
    /*
     * `INACTIVE` must never reach the `status` parameter — the API's filter
     * enum rejects it and would 400 the whole page. The options are built from
     * `SETTABLE_STAFF_STATUS_VALUES`, so asserting on that constant is the
     * real check; opening a Radix select in jsdom would test the primitive.
     */
    expect(SETTABLE_STAFF_STATUS_VALUES).toEqual(['ACTIVE', 'SUSPENDED', 'BANNED'])
    expect(SETTABLE_STAFF_STATUS_VALUES).not.toContain('INACTIVE')

    renderPage()
    await screen.findByText('Sarah Connor')
    expect(screen.getByLabelText('Status')).toBeInTheDocument()
  })

  it('labels an applied filter chip with the staff vocabulary', async () => {
    renderPage('/staff?status=SUSPENDED')
    await screen.findByText('Priya Raman')

    /*
     * Scoped to the chip: "Suspended" also renders as the row's status badge,
     * and the point of the assertion is that both read it out of the same
     * `staff` domain rather than each inventing a label.
     */
    expect(screen.getByText('Status:').parentElement).toHaveTextContent('Suspended')
  })

  it('shows an empty state that explains a filtered miss', async () => {
    renderPage('/staff?search=zzzzzzzz')
    expect(await screen.findByText(/no staff members match this view/i)).toBeVisible()
  })
})

describe('permission summary', () => {
  it('names the granted modules for a screen reader', async () => {
    renderPage()
    await screen.findByText('Sarah Connor')

    // Eight identical dots tell an assistive reader nothing; the text does.
    /*
     * `getAllBy`: the description appears on the wrapper's `title` and again in
     * the `sr-only` span, so the matcher legitimately finds the nested pair.
     */
    expect(
      screen.getAllByText(/Can reach: Dashboard & trends, User directory, User actions/)
        .length,
    ).toBeGreaterThan(0)
  })

  it('says "None" rather than rendering eight blank dots', async () => {
    // `stf_tomas` holds no permissions — a real, deliberate state.
    renderPage()
    await screen.findByText('Tomas Lindqvist')

    expect(screen.getAllByText('None').length).toBeGreaterThan(0)
    expect(screen.getAllByText('No module access').length).toBeGreaterThan(0)
  })
})
