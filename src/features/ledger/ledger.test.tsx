import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { ROUTES } from '@/app/routes'
import { AuthProvider } from '@/auth/AuthProvider'
import { PERMISSIONS, permissionsForRole } from '@/auth/permissions'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { HostsPage } from '@/features/hosts/HostsPage'
import { UserDetailPage } from '@/features/users/UserDetailPage'
import { NAV_SECTIONS } from '@/layouts/navigation'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import {
  MOCK_LEDGER_RECEIVER,
  MOCK_LEDGER_SENDER,
  mockTransactions,
  resetMockCatalog,
} from '@/mocks/handlers/catalog'
import { resetMockHosts, seedMockHosts } from '@/mocks/handlers/hosts'
import { API_PREFIX } from '@/mocks/handlers/shared'
import { users } from '@/mocks/seed'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { GiftTransactionsPage } from './GiftTransactionsPage'

/**
 * The gift ledger and its three entry points — phase G5.
 *
 * Measured on `test-api` 2026-10-28 before any of this was written: newest
 * first and unsortable; `senderId`, `receiverId`, `contextId` filter and
 * combine with AND; an empty value and every other parameter are ignored; a
 * page past the end answers `[]` with the true total; no bounds on `limit`.
 */

const LEDGER = '/api/v1/admin/gifts/transactions'

function requests() {
  const urls: URL[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (url.pathname === LEDGER) urls.push(url)
  })
  return urls
}

function Where() {
  const location = useLocation()
  return <output aria-label="Location">{location.pathname + location.search}</output>
}

function renderAt(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      {
        path: ROUTES.diamondTransactions,
        element: (
          <>
            <GiftTransactionsPage />
            <Where />
          </>
        ),
      },
      { path: '/users/:userId', element: <UserDetailPage /> },
      { path: '/hosts', element: <HostsPage /> },
    ],
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

function lastQuery(urls: URL[]) {
  return Object.fromEntries(urls.at(-1)?.searchParams ?? [])
}

beforeEach(() => {
  resetMockCatalog()
  resetMockHosts()
  seedMockHosts()
  server.events.removeAllListeners()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('where it lives', () => {
  it('is the fourth Diamonds entry, on ledger.view, which ADMIN holds', () => {
    const diamonds = NAV_SECTIONS.find((section) => section.id === 'diamonds')
    const item = diamonds?.items.find(
      (entry) => entry.to === ROUTES.diamondTransactions,
    )
    expect(item?.label).toBe('Gift transactions')
    expect(item?.permission).toBe(PERMISSIONS.ledgerView)
    expect(permissionsForRole('ADMIN')).toContain(PERMISSIONS.ledgerView)
  })

  it('builds the entry-point links from the two filters that work', () => {
    expect(ROUTES.giftLedger({ senderId: 'u1' })).toBe(
      '/diamonds/transactions?senderId=u1',
    )
    expect(ROUTES.giftLedger({ receiverId: 'u2' })).toBe(
      '/diamonds/transactions?receiverId=u2',
    )
  })
})

describe('what a row shows', () => {
  it('renders the gift as it was sent, and names the current one beside it', async () => {
    /*
     * ⚠️ The fixture's snapshot differs from the live gift. Rendering
     * "Chocolate Box" as the row's gift would mean a catalog rename rewrites
     * the ledger.
     */
    renderAt(ROUTES.diamondTransactions)
    const first = (await screen.findAllByText('Chocolate Box (as sent)'))[0]!
    const row = first.closest('tr')!
    expect(
      within(row).getByText('Now named “Chocolate Box” in the catalog'),
    ).toBeInTheDocument()
  })

  it('shows quantities above one', async () => {
    renderAt(ROUTES.diamondTransactions)
    expect(await screen.findByText('× 99')).toBeInTheDocument()
    expect(screen.getByText('× 10')).toBeInTheDocument()
  })

  it('links each party to their user record', async () => {
    renderAt(ROUTES.diamondTransactions)
    const links = await screen.findAllByRole('link', { name: 'App Developer' })
    expect(links[0]).toHaveAttribute('href', ROUTES.user(MOCK_LEDGER_RECEIVER))
  })

  it('says once why every amount is zero, and only when it is', async () => {
    renderAt(ROUTES.diamondTransactions)
    expect(await screen.findByText(/sent at a price of 0 Diamonds/)).toBeInTheDocument()
  })

  it('drops the explanation once a row on the page cost something', async () => {
    const row = mockTransactions()[21]!
    Object.assign(row, { unitPrice: 50, totalPrice: 50, hostEarnings: 35 })
    renderAt(ROUTES.diamondTransactions)
    expect(await screen.findByText('Receiver earned 35')).toBeInTheDocument()
    expect(screen.queryByText(/sent at a price of 0 Diamonds/)).toBeNull()
  })
})

describe('filters arrive by link', () => {
  it('forwards receiverId and names the receiver — not the sender — on the chip', async () => {
    /*
     * ⚠️ MOCK_LEDGER_SENDER also RECEIVES on some rows. Naming the chip from
     * the wrong party would read "Received by: App Developer" here.
     */
    const urls = requests()
    renderAt(ROUTES.giftLedger({ receiverId: MOCK_LEDGER_SENDER }))
    await screen.findAllByText('Chocolate Box (as sent)')
    expect(lastQuery(urls)).toMatchObject({ receiverId: MOCK_LEDGER_SENDER })
    expect(screen.getByText('Received by:').parentElement).toHaveTextContent(
      'call chat',
    )
  })

  it('falls back to the id, and an honest empty state, for an unknown person', async () => {
    renderAt(ROUTES.giftLedger({ senderId: 'cm_nobody' }))
    expect(await screen.findByText('No gifts match this view')).toBeInTheDocument()
    expect(screen.getByText('Sent by:').parentElement).toHaveTextContent('cm_nobody')
  })

  it.each(['', '%20%20'])(
    'ignores a blank value (%j) instead of showing a filter that filters nothing',
    async (blank) => {
      /* Live: `senderId=` answers all 22. */
      const urls = requests()
      renderAt(`/diamonds/transactions?senderId=${blank}`)
      await screen.findAllByText('Chocolate Box (as sent)')
      expect(lastQuery(urls)).not.toHaveProperty('senderId')
      expect(screen.queryByText('Sent by:')).toBeNull()
    },
  )

  it('never names a person the rows on screen do not belong to', async () => {
    /*
     * A server that ignored the filter — as it ignores `giftId` and `userId`
     * — would return rows for other people. The chip must then fall back to
     * the id rather than borrow the first row's name.
     */
    server.use(
      http.get(
        `${API_PREFIX}/admin/gifts/transactions`,
        async ({ request }) => {
          const url = new URL(request.url)
          url.searchParams.delete('receiverId')
          const response = await fetch(url)
          return HttpResponse.json(await response.json())
        },
        { once: true },
      ),
    )
    renderAt(ROUTES.giftLedger({ receiverId: 'cm_other' }))
    await screen.findAllByText('Chocolate Box (as sent)')
    expect(screen.getByText('Received by:').parentElement).toHaveTextContent('cm_other')
  })

  it('narrows to one room from a row, and clears back to everything', async () => {
    const urls = requests()
    const user = renderAt(ROUTES.diamondTransactions)
    const buttons = await screen.findAllByRole('button', {
      name: /Only gifts sent in room/,
    })
    await user.click(buttons[0]!)
    await waitFor(() =>
      expect(lastQuery(urls)).toMatchObject({ contextId: 'cmvph9tft00kp01p68mid7a91' }),
    )
    expect(screen.queryByRole('button', { name: /Only gifts sent in room/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Remove Room filter' }))
    await waitFor(() => expect(lastQuery(urls)).not.toHaveProperty('contextId'))
  })
})

describe('paging the server does not bound', () => {
  it('clamps an oversized limit to 100', async () => {
    /* Live: `limit=101` answers 101 rows (plan.md O5). */
    const urls = requests()
    renderAt('/diamonds/transactions?limit=500')
    await screen.findAllByText('Chocolate Box (as sent)')
    expect(lastQuery(urls)).toMatchObject({ limit: '100' })
  })

  it('says a page past the end is past the end, and goes back', async () => {
    const user = renderAt('/diamonds/transactions?page=9')
    expect(await screen.findByText('This page is past the end')).toBeInTheDocument()
    expect(screen.getByText(/22 gifts in this view/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to the first page' }))
    await screen.findAllByText('Chocolate Box (as sent)')
    expect(screen.getByRole('status', { name: 'Location' })).not.toHaveTextContent(
      'page=',
    )
  })

  it('tells a failure apart from an empty ledger', async () => {
    server.use(
      http.get(`${API_PREFIX}/admin/gifts/transactions`, () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Database unavailable.' } },
          { status: 500 },
        ),
      ),
    )
    renderAt(ROUTES.diamondTransactions)
    expect(await screen.findByText('Database unavailable.')).toBeInTheDocument()
    expect(screen.queryByText('No gifts sent yet')).toBeNull()
  })
})

describe('the entry points', () => {
  it('links the user record’s gift figures to the filtered ledger', async () => {
    const target = users[0]!
    const user = renderAt(ROUTES.user(target.id))
    await user.click(await screen.findByRole('tab', { name: 'Finance' }))
    expect(await screen.findByRole('link', { name: 'See gifts sent' })).toHaveAttribute(
      'href',
      ROUTES.giftLedger({ senderId: target.id }),
    )
    expect(
      await screen.findByRole('link', { name: 'See gifts received' }),
    ).toHaveAttribute('href', ROUTES.giftLedger({ receiverId: target.id }))
  })

  it('shows a Moderator the user record without the ledger links', async () => {
    /* MODERATOR holds `users.view` and not `ledger.view`. */
    signInMockAdmin('MODERATOR')
    const user = renderAt(ROUTES.user(users[0]!.id))
    await user.click(await screen.findByRole('tab', { name: 'Finance' }))
    expect(await screen.findByText('Gifts sent')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'See gifts sent' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'See gifts received' })).toBeNull()
  })

  it('links a host’s gifts to the ledger beside the count, not as it', async () => {
    /*
     * ⚠️ The roster counter disagrees with the ledger live (plan.md O15), so
     * the count stays plain text and the link is labelled for what it opens.
     */
    renderAt('/hosts')
    await screen.findByText('Alex Rivers')
    const links = await screen.findAllByRole('link', { name: 'Gifts received' })
    expect(links[0]?.getAttribute('href')).toMatch(
      /^\/diamonds\/transactions\?receiverId=/,
    )
    expect(screen.queryByRole('link', { name: /\d+ gifts/ })).toBeNull()
  })
})
