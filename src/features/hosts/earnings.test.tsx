import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { resetMockHosts, seedMockHosts } from '@/mocks/handlers/hosts'
import { liveHostListSchema } from '@/types/hosts'
import { render, screen, setViewport, within } from '@tests/render'

import { HostsPage } from './HostsPage'

/**
 * Creator earnings on the roster — phase W6.
 *
 * ⚠️ **No new endpoint was needed.** `/admin/live/hosts` has returned the
 * whole Creator Studio on every row since H6 and the roster discarded all of
 * it, so an operator deciding whether to suspend somebody could see their
 * follower count but not that twelve thousand withdrawable diamonds and a
 * payout in flight were attached to the same account.
 */

function renderScreen(entry = '/hosts') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/hosts', element: <HostsPage /> }], {
    initialEntries: [entry],
  })

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TooltipProvider delayDuration={0}>
          <RouterProvider router={router} />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>,
  )

  return userEvent.setup()
}

beforeEach(() => {
  resetMockHosts()
  seedMockHosts()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the two balances are never one number', () => {
  it('labels withdrawable earnings as withdrawable, every time', async () => {
    /*
     * ⚠️ **The rule the whole dual-balance architecture exists to protect.**
     * A user's spending diamonds can never become fiat; a host's
     * `withdrawableDiamonds` can. A column showing a bare number, or summing
     * the two, teaches an operator the opposite of what the backend enforces.
     */
    renderScreen()
    await screen.findByText('Alex Rivers')

    expect(screen.getByText('12,189')).toBeInTheDocument()

    /*
     * ⚠️ `getAllByText`, and the count is the assertion. "Every time" is the
     * claim this test's name makes: a label on the row that happens to have
     * earnings is not the guarantee — a bare number on the row that does not
     * is exactly the failure being guarded against.
     */
    expect(screen.getAllByText('withdrawable')).toHaveLength(2)
  })

  it('keeps lifetime, withdrawable and in-flight as three separate figures', async () => {
    /*
     * The fixture deliberately gives all three different values — 64,200
     * earned, 12,189 withdrawable, 4,000 in flight. A cell rendering the
     * wrong one would pass against a fixture where they matched.
     */
    renderScreen()
    await screen.findByText('Alex Rivers')

    expect(screen.getByText('64,200')).toBeInTheDocument()
    expect(screen.getByText('12,189')).toBeInTheDocument()
    expect(screen.getByText('4,000 in flight')).toBeInTheDocument()
  })

  it('shows the revenue split beside the gross, so it cannot read as take-home', async () => {
    /*
     * ⚠️ `totalDiamondsEarned` is gross, before the platform's 30%. Without
     * the split beside it the number is simply wrong about what the host got.
     */
    renderScreen()
    await screen.findByText('Alex Rivers')

    expect(screen.getByText(/58 gifts · 70% share/)).toBeInTheDocument()
  })

  it('shows money in flight for a suspended host too', async () => {
    /*
     * ⚠️ Suspension does not cancel a withdrawal, and the panel cannot act on
     * either — which is exactly the state an operator needs to see rather
     * than one the screen hides.
     */
    renderScreen('/hosts?status=SUSPENDED')
    await screen.findByText('No display name')

    expect(screen.getByText('2,500 in flight')).toBeInTheDocument()
  })

  it('renders an em-dash, not a zero, when a figure is absent', async () => {
    /*
     * Every creator field is optional in the contract. A fabricated `0`
     * against a host with real earnings is the worst possible wrong answer.
     */
    const parsed = liveHostListSchema.parse({
      success: true,
      data: [{ id: 'prof_1', status: 'ACTIVE' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    })
    expect(parsed.data[0]?.withdrawableDiamonds).toBeUndefined()
  })
})

describe('whether they are on air', () => {
  it('marks a host who is broadcasting right now', async () => {
    renderScreen()
    await screen.findByText('Alex Rivers')
    expect(screen.getByText('Live now')).toBeInTheDocument()
  })

  it('warns in the suspend dialog that a broadcast is running', async () => {
    /*
     * ⚠️ **The reason W6 touches this dialog at all.** The static copy had to
     * hedge — "if they are broadcasting right now" — because until the roster
     * read `isLive` the panel genuinely did not know. A conditional an
     * operator has to resolve themselves is the part of a warning they skim.
     */
    const user = renderScreen()
    await screen.findByText('Alex Rivers')

    await user.click(screen.getByRole('button', { name: /suspend alex rivers/i }))
    const dialog = await screen.findByRole('dialog', { name: /suspend this host/i })

    expect(
      within(dialog).getByText(/Alex Rivers is broadcasting right now/),
    ).toBeInTheDocument()
  })

  it('does not claim a broadcast is running when none is', async () => {
    const user = renderScreen('/hosts?status=SUSPENDED')
    await screen.findByText('No display name')

    await user.click(screen.getByRole('button', { name: /reactivate/i }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).queryByText(/broadcasting right now/)).toBeNull()
  })
})

describe('what the panel cannot do', () => {
  it('offers no payout control, because no endpoint exists', async () => {
    /*
     * ⚠️ plan.md O3: `/admin/wallet/withdrawals` and `/admin/withdrawals` are
     * both `ROUTE_NOT_FOUND`, and four `withdrawals.*` permission keys already
     * exist in `auth/permissions.ts`. The keys being there is not a reason to
     * build a button — a control that 404s is worse than its absence.
     */
    renderScreen()
    await screen.findByText('Alex Rivers')

    expect(screen.queryByRole('button', { name: /pay ?out/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /withdraw/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /settle/i })).toBeNull()
  })
})
