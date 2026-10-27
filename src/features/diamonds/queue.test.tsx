import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { resetMockWallet, seedMockWallet } from '@/mocks/handlers/wallet'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor } from '@tests/render'

import { TopUpRequestsPage } from './TopUpRequestsPage'

/**
 * The manual top-up queue — phase W2.
 *
 * ⚠️ **Half this file is about states nobody sees on a good day**, which is
 * deliberate: the live service holds zero requests, so "nothing at all" is the
 * screen an operator actually gets, and the date filter's failure mode is
 * invisible by construction.
 */

/** Every `GET /admin/wallet/requests` URL the screen issued. */
let reads: URL[] = []

function renderScreen(entry = '/diamonds/top-ups') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/diamonds/top-ups', element: <TopUpRequestsPage /> }],
    { initialEntries: [entry] },
  )

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

function lastRead(): URLSearchParams {
  return reads[reads.length - 1]!.searchParams
}

beforeEach(() => {
  resetMockWallet()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })

  reads = []
  server.events.removeAllListeners('request:start')
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    /*
     * ⚠️ Scoped to the list route. An unscoped listener also captures
     * `/admin/auth/me`, and `lastRead()` would then report whichever landed
     * last — a race that passes locally and fails under load.
     */
    if (request.method === 'GET' && url.pathname.endsWith('/admin/wallet/requests')) {
      reads.push(url)
    }
  })
})

describe('the empty state, which is the only thing production can show', () => {
  it('says nothing is waiting, not that something failed', async () => {
    renderScreen()
    expect(await screen.findByText('No top-up requests yet')).toBeInTheDocument()
    expect(screen.getByText(/nothing to do until then/i)).toBeInTheDocument()
  })

  it('distinguishes "nothing matches" from "nothing at all"', async () => {
    seedMockWallet()
    renderScreen('/diamonds/top-ups?status=CANCELLED')

    expect(await screen.findByText('No payments match this view')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
  })

  it('offers no "clear filters" escape when there are no filters', async () => {
    renderScreen()
    await screen.findByText('No top-up requests yet')
    expect(screen.queryByRole('button', { name: /clear filters/i })).toBeNull()
  })
})

describe('the rows', () => {
  beforeEach(() => seedMockWallet())

  it('shows the payer, the money and the reference', async () => {
    renderScreen()

    expect(await screen.findByText('Rakibul Khan')).toBeInTheDocument()
    /*
     * ⚠️ **Whole taka, not paisa.** `lib/format.ts#formatMoney` takes minor
     * units, so passing `3000` through it renders `BDT 30.00` — a believable
     * number and therefore the dangerous kind of wrong. The regex allows the
     * code or the symbol because which one `Intl` picks depends on the
     * runtime's locale; the digits are what this test is about.
     */
    expect(screen.getByText(/(BDT|৳)\s?3,000$/)).toBeInTheDocument()
    expect(screen.getByText('2,750 diamonds')).toBeInTheDocument()
    expect(screen.getByText('9K38FX92P1')).toBeInTheDocument()
  })

  it('names a payer who has no profile at all', async () => {
    /*
     * The hostile fixture has no display name, no username, no phone and no
     * email. A blank cell would read as a rendering bug in a queue of
     * payments somebody has to decide on.
     */
    renderScreen()
    expect(await screen.findByText('No account details')).toBeInTheDocument()
  })

  it('separates what a human verifies from what a gateway already settled', async () => {
    /*
     * ⚠️ The guide says this queue is manual mobile money only. The server's
     * enum says otherwise (plan.md O7), and an operator who cannot tell the
     * two apart goes looking for a sender number that never existed.
     */
    renderScreen()

    await screen.findByText('Rakibul Khan')
    expect(screen.getAllByText('Verify by hand').length).toBeGreaterThan(0)
    expect(screen.getByText('Settled by gateway')).toBeInTheDocument()
    expect(screen.getByText('APPLE IAP')).toBeInTheDocument()
  })

  it('renders CANCELLED, which the host queue has never had', async () => {
    renderScreen()
    await screen.findByText('Rakibul Khan')
    expect(screen.getByText('REJECTED')).toBeInTheDocument()
  })
})

describe('the filters, which the URL owns', () => {
  beforeEach(() => seedMockWallet())

  it('sends an upper-case status, because the server is case-sensitive', async () => {
    renderScreen('/diamonds/top-ups?status=PENDING')
    await waitFor(() => expect(lastRead().get('status')).toBe('PENDING'))
  })

  it('drops a lower-case status rather than letting it 400 the page', async () => {
    /*
     * ⚠️ A hand-edited URL must not be able to break the screen. `pending` is
     * a 400 on this route; dropping it renders the whole queue instead.
     */
    renderScreen('/diamonds/top-ups?status=pending')
    await screen.findByText('Rakibul Khan')
    expect(lastRead().get('status')).toBeNull()
  })

  it('drops a method the server does not know, UPAY included', async () => {
    renderScreen('/diamonds/top-ups?method=UPAY')
    await screen.findByText('Rakibul Khan')
    expect(lastRead().get('method')).toBeNull()
  })

  it('offers all seven methods, including the three the guide omits', async () => {
    const user = renderScreen()
    await screen.findByText('Rakibul Khan')

    await user.click(screen.getByLabelText('Method'))
    for (const method of ['BKASH', 'NAGAD', 'ROCKET', 'BANK']) {
      expect(await screen.findByRole('option', { name: method })).toBeInTheDocument()
    }
    expect(await screen.findByRole('option', { name: 'STRIPE' })).toBeInTheDocument()
    expect(
      await screen.findByRole('option', { name: 'GOOGLE PLAY' }),
    ).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'APPLE IAP' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'UPAY' })).toBeNull()
  })
})

describe('the dates, which the server will not validate', () => {
  beforeEach(() => seedMockWallet())

  it('⚠️ never forwards a malformed date, because the server would accept it', async () => {
    /*
     * **The most important test in this file.** `?startDate=hello` answers
     * 200 on the live backend and filters on it (plan.md O6), so a typo in a
     * pasted URL returns a shorter list with no error and nothing on screen to
     * explain the missing rows. Every other facet here is protected by the
     * server rejecting bad input; this one is protected only by the client.
     */
    renderScreen('/diamonds/top-ups?startDate=hello')
    await screen.findByText('Rakibul Khan')
    expect(lastRead().get('startDate')).toBeNull()
  })

  it('rejects a date that rolls over, which Date.parse accepts', async () => {
    /*
     * ⚠️ `Date.parse('2026-02-31')` is not NaN — V8 rolls it to March 3.
     * Forwarding it would filter on a day the operator never chose, and the
     * result would look perfectly plausible.
     */
    renderScreen('/diamonds/top-ups?startDate=2026-02-31')
    await screen.findByText('Rakibul Khan')
    expect(lastRead().get('startDate')).toBeNull()
  })

  it('drops a bare year, which parses AND survives a round-trip check', async () => {
    /*
     * ⚠️ Added after a mutation test proved the shape guard was untested.
     * Deleting the `YYYY-MM-DD` regex broke nothing, because every value the
     * suite tried (`hello`, `2026-02-31`) was already caught by `Date.parse`
     * or by the rollover check. `2026` is caught by neither:
     * `Date.parse('2026')` is 2026-01-01, and `'2026-01-01T…'.startsWith('2026')`
     * is true. Only the shape test rejects it — and forwarding it would filter
     * the queue to one arbitrary day while the operator believes they asked
     * for a year.
     */
    renderScreen('/diamonds/top-ups?startDate=2026')
    await screen.findByText('Rakibul Khan')
    expect(lastRead().get('startDate')).toBeNull()
  })

  it('forwards a well-formed date', async () => {
    renderScreen('/diamonds/top-ups?startDate=2026-10-01')
    await waitFor(() => expect(lastRead().get('startDate')).toBe('2026-10-01'))
  })
})

describe('paging', () => {
  it('hides the pager on an empty queue rather than saying "page 1 of 1"', async () => {
    /*
     * The service answers `totalPages: 0` for an empty table. A pager driven
     * off the response would dress "nothing exists" up as "you have reached
     * the end".
     */
    renderScreen()
    await screen.findByText('No top-up requests yet')
    expect(screen.queryByRole('navigation', { name: /pagination/i })).toBeNull()
  })

  it('asks for the measured page size and never more than the cap', async () => {
    seedMockWallet()
    renderScreen('/diamonds/top-ups?limit=500')
    await waitFor(() => expect(lastRead().get('limit')).toBe('100'))
  })
})
