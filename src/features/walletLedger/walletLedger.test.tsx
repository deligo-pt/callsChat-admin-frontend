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
import { NAV_SECTIONS } from '@/layouts/navigation'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { API_PREFIX } from '@/mocks/handlers/shared'
import {
  clearMockWalletTransactions,
  mockWalletTransactions,
  resetMockWalletTransactions,
} from '@/mocks/handlers/walletTransactions'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { readWalletFilters } from './useWalletLedgerParams'
import { WalletTransactionsPage } from './WalletTransactionsPage'

/**
 * The wallet ledger page — plan.md phase T2.
 *
 * The mock answers as staging did on all 46 captured queries
 * (`types/walletTransactions.test.ts`), so the numbers here are staging's.
 */

const DEVELOPER = 'cmv5jz04e000201o5mtu3alad'

function requests() {
  const urls: URL[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/admin/wallet/transactions')) urls.push(url)
  })
  return urls
}

function lastQuery(urls: URL[]) {
  return Object.fromEntries(urls.at(-1)?.searchParams ?? [])
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
        path: ROUTES.walletTransactions,
        element: (
          <>
            <WalletTransactionsPage />
            <Where />
          </>
        ),
      },
      { path: '/users/:userId', element: <p>User record</p> },
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

function chip(label: string) {
  return screen.getByRole('button', { name: `Remove ${label} filter` }).parentElement
}

function page(data: unknown[]) {
  return {
    success: true,
    data,
    pagination: {
      total: data.length,
      page: 1,
      limit: 25,
      totalPages: 1,
      hasMore: false,
    },
    summary: {
      totalTransactions: data.length,
      totalVolumeDiamonds: 0,
      totalCreditDiamonds: 0,
      totalDebitDiamonds: 0,
    },
  }
}

function location() {
  return screen.getByLabelText('Location').textContent ?? ''
}

function summary() {
  return within(screen.getByRole('region', { name: /this view|all wallets/i }))
}

async function table() {
  return within(await screen.findByRole('table'))
}

beforeEach(() => {
  resetMockWalletTransactions()
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
  it('is a Diamonds entry on ledger.view, which ADMIN holds and MODERATOR does not', () => {
    const diamonds = NAV_SECTIONS.find((section) => section.id === 'diamonds')
    const item = diamonds?.items.find((entry) => entry.to === ROUTES.walletTransactions)
    expect(item?.label).toBe('Wallet transactions')
    expect(item?.permission).toBe(PERMISSIONS.ledgerView)
    expect(permissionsForRole('ADMIN')).toContain(PERMISSIONS.ledgerView)
    expect(permissionsForRole('MODERATOR')).not.toContain(PERMISSIONS.ledgerView)
  })

  it('builds links into a filtered view', () => {
    expect(ROUTES.walletLedger({ userId: 'u1' })).toBe(
      '/diamonds/wallet-transactions?userId=u1',
    )
  })
})

describe('the first view', () => {
  it('asks for 25 newest rows and shows the all-time totals', async () => {
    const urls = requests()
    renderAt(ROUTES.walletTransactions)
    const rows = await table()
    expect(rows.getAllByRole('row')).toHaveLength(26)
    expect(lastQuery(urls)).toEqual({ page: '1', limit: '25' })

    expect(screen.getByRole('heading', { name: 'All wallets, all time' })).toBeVisible()
    expect(summary().getByText('59')).toBeVisible()
    expect(summary().getByText('+13,570')).toBeVisible()
    expect(summary().getByText('−4,121')).toBeVisible()
  })

  it('draws credits, debits and free gifts differently', async () => {
    renderAt(`${ROUTES.walletTransactions}?limit=100`)
    const rows = await table()
    expect(rows.getAllByText('Diamonds credited').length).toBeGreaterThan(0)
    expect(rows.getAllByText('Diamonds debited').length).toBeGreaterThan(0)
    /* ⚠️ B2: labelled CREDIT by the server, drawn as Free. */
    expect(rows.getAllByText('Free')).toHaveLength(23)
  })

  it('names every source in words, never as a raw id', async () => {
    const ADMIN = 'cmv80oug40000b9kzd52qpjds'
    server.use(
      http.get(`${API_PREFIX}/admin/users/${ADMIN}`, () =>
        HttpResponse.json({
          success: true,
          data: {
            identity: { id: ADMIN, displayName: 'Super Administrator', username: null },
          },
        }),
      ),
    )
    renderAt(`${ROUTES.walletTransactions}?limit=100`)
    const rows = await table()

    /* The Source cells — the admin also has a wallet, so the Account column links them too. */
    const sources = () =>
      rows.getAllByText('Adjusted by').map((caption) => caption.parentElement!)
    expect(sources()).toHaveLength(11)
    await waitFor(() =>
      expect(sources().every((cell) => within(cell).queryByRole('link'))).toBe(true),
    )
    for (const cell of sources()) {
      const link = within(cell).getByRole('link')
      expect(link).toHaveTextContent('Super Administrator')
      expect(link).toHaveAttribute('href', ROUTES.user(ADMIN))
    }

    expect(rows.getAllByText('Heart Icon').length).toBeGreaterThan(0)
    expect(rows.getAllByText('Creator Studio')).toHaveLength(5)
    expect(rows.getAllByText('Top-up request')).toHaveLength(4)
    expect(rows.getAllByText('bKash').length).toBeGreaterThan(0)

    /* No reference id is printed anywhere in the table. */
    const text = screen.getByRole('table').textContent ?? ''
    expect(text).not.toContain(ADMIN)
    expect(text).not.toMatch(/cmv[a-z0-9]{6}/)
    expect(text).not.toContain('gift-heart_icon')
  })

  it('still links an admin whose record cannot be read, without the id', async () => {
    renderAt(`${ROUTES.walletTransactions}?type=ADMIN_ADJUSTMENT`)
    const rows = await table()
    const links = await rows.findAllByRole('link', { name: 'View admin' })
    expect(links).toHaveLength(11)
  })

  it('asks for each admin once, however many rows they made', async () => {
    const asked: string[] = []
    server.events.on('request:start', ({ request }) => {
      const path = new URL(request.url).pathname
      if (/\/admin\/users\/[^/]+$/.test(path)) asked.push(path)
    })
    renderAt(`${ROUTES.walletTransactions}?type=ADMIN_ADJUSTMENT`)
    await (await table()).findAllByRole('link', { name: 'View admin' })
    expect(asked).toHaveLength(1)
  })
})

describe('the sign decides, not the label', () => {
  it('draws a negative amount as a debit, whatever direction says', async () => {
    const row = { ...mockWalletTransactions().find((r) => r.amount > 0)!, amount: -5 }
    expect(row.direction).toBe('CREDIT')
    server.use(
      http.get(`${API_PREFIX}/admin/wallet/transactions`, () =>
        HttpResponse.json(page([row])),
      ),
    )
    renderAt(ROUTES.walletTransactions)
    const rows = await table()
    expect(rows.getByText('Diamonds debited')).toBeInTheDocument()
    expect(rows.queryByText('Diamonds credited')).not.toBeInTheDocument()
  })
})

describe('the filters', () => {
  it('sends a type, and shows it as a chip', async () => {
    const urls = requests()
    const user = renderAt(ROUTES.walletTransactions)
    await table()
    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: 'Top-up' }))

    await waitFor(() => expect(lastQuery(urls)).toMatchObject({ type: 'TOP_UP' }))
    expect(location()).toContain('type=TOP_UP')
    expect(await screen.findByText('Type:', { exact: false })).toBeInTheDocument()
    await waitFor(() => expect(summary().getByText('4')).toBeVisible())
  })

  it('corrects the summary for direction, which the server ignores (B3)', async () => {
    renderAt(`${ROUTES.walletTransactions}?direction=DEBIT`)
    await table()
    await waitFor(() => expect(summary().getByText('17')).toBeVisible())
    expect(summary().getByText('+0')).toBeVisible()
    expect(summary().getByText('−4,121')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'This view' })).toBeVisible()
  })

  it('says where free gifts go when a direction is chosen (B2)', async () => {
    renderAt(ROUTES.walletTransactions)
    expect(
      screen.getByRole('combobox', { name: 'Direction' }),
    ).toHaveAccessibleDescription(
      'Free gifts (0 Diamonds) are neither credits nor debits.',
    )
  })

  it('turns Bangladesh days into UTC bounds', async () => {
    const urls = requests()
    renderAt(`${ROUTES.walletTransactions}?fromDate=2026-10-29&toDate=2026-10-29`)
    await screen.findByRole('table')
    expect(lastQuery(urls)).toMatchObject({
      startDate: '2026-10-28T18:00:00.000Z',
      endDate: '2026-10-29T17:59:59.999Z',
    })
  })

  it('refuses an end date before the start, with a reason', async () => {
    const urls = requests()
    const user = renderAt(`${ROUTES.walletTransactions}?fromDate=2026-10-29`)
    await table()
    const to = screen.getByLabelText('To')
    await user.type(to, '2026-10-01')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The end date is before the start date.',
    )
    expect(to).toHaveAttribute('aria-invalid', 'true')
    expect(location()).not.toContain('toDate')
    expect(urls.every((url) => !url.searchParams.has('endDate'))).toBe(true)
  })

  it('takes a minimum amount on Enter, and refuses a fraction', async () => {
    const urls = requests()
    const user = renderAt(ROUTES.walletTransactions)
    await table()
    const min = screen.getByLabelText('At least (Diamonds)')

    await user.type(min, '1.5{Enter}')
    expect(screen.getByRole('alert')).toBeVisible()
    expect(location()).not.toContain('minAmount')

    await user.clear(min)
    await user.type(min, '100{Enter}')
    await waitFor(() => expect(lastQuery(urls)).toMatchObject({ minAmount: '100' }))
    await waitFor(() => expect(summary().getByText('14')).toBeVisible())
  })

  it('commits the search on Enter', async () => {
    const urls = requests()
    const user = renderAt(ROUTES.walletTransactions)
    await table()
    await user.type(screen.getByLabelText('Search'), 'BKASH{Enter}')
    await waitFor(() => expect(lastQuery(urls)).toMatchObject({ search: 'BKASH' }))
  })

  it('sorts oldest first', async () => {
    const urls = requests()
    const user = renderAt(ROUTES.walletTransactions)
    await table()
    await user.click(screen.getByRole('combobox', { name: 'Order' }))
    await user.click(await screen.findByRole('option', { name: 'Oldest first' }))
    await waitFor(() => expect(lastQuery(urls)).toMatchObject({ sort: 'asc' }))
  })

  it('names the account in its chip, from its rows', async () => {
    renderAt(`${ROUTES.walletTransactions}?userId=${DEVELOPER}`)
    await table()
    await waitFor(() =>
      expect(chip('Account')).toHaveTextContent('Account:App Developer'),
    )
    expect(summary().getByText('17')).toBeVisible()
  })

  it('never names the account from a row that is not theirs', async () => {
    /* A server that ignored `userId` would hand back someone else's rows. */
    const other = mockWalletTransactions().find((row) => row.userId !== DEVELOPER)!
    server.use(
      http.get(`${API_PREFIX}/admin/wallet/transactions`, () =>
        HttpResponse.json(page([other])),
      ),
    )
    renderAt(`${ROUTES.walletTransactions}?userId=${DEVELOPER}`)
    await table()
    expect(chip('Account')).toHaveTextContent('Account:This account')
  })

  it('returns to page 1 when a filter changes', async () => {
    const user = renderAt(`${ROUTES.walletTransactions}?page=2`)
    await table()
    await user.click(screen.getByRole('combobox', { name: 'Direction' }))
    await user.click(await screen.findByRole('option', { name: 'Credits' }))
    await waitFor(() => expect(location()).toContain('direction=CREDIT'))
    expect(location()).not.toContain('page=')
  })

  it('clears every filter at once', async () => {
    const user = renderAt(
      `${ROUTES.walletTransactions}?type=TOP_UP&direction=CREDIT&minAmount=100`,
    )
    await table()
    await user.click(screen.getByRole('button', { name: /clear all/i }))
    await waitFor(() => expect(location()).toBe(ROUTES.walletTransactions))
  })
})

describe('a pasted link with bad values', () => {
  it.each([
    ['type=top_up', {}],
    ['type=', {}],
    ['direction=credit', {}],
    ['minAmount=1.5', {}],
    ['minAmount=0', {}],
    ['fromDate=2026-02-31', {}],
    ['fromDate=2026-10-29&toDate=2026-10-01', { fromDate: '2026-10-29' }],
    ['type=TOP_UP_PURCHASE', { type: 'TOP_UP_PURCHASE' }],
    [`userId=${'x'.repeat(65)}`, {}],
  ])('%s is read as %j', (search, expected) => {
    expect(readWalletFilters(new URLSearchParams(search))).toEqual(expected)
  })

  it('still loads, and never sends the bad value', async () => {
    const urls = requests()
    renderAt(`${ROUTES.walletTransactions}?type=top_up&limit=500&direction=`)
    expect((await table()).getAllByRole('row').length).toBeGreaterThan(1)
    expect(lastQuery(urls)).toEqual({ page: '1', limit: '100' })
  })
})

describe('when there is nothing to show', () => {
  it('says nothing has moved yet, without filters', async () => {
    clearMockWalletTransactions()
    renderAt(ROUTES.walletTransactions)
    expect(await screen.findByText('No wallet transactions yet')).toBeVisible()
  })

  it('offers to clear the filters when they match nothing', async () => {
    const user = renderAt(`${ROUTES.walletTransactions}?search=zzzz`)
    expect(await screen.findByText('No transactions match this view')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(location()).toBe(ROUTES.walletTransactions))
  })

  it('tells a page past the end apart from an empty view', async () => {
    const user = renderAt(`${ROUTES.walletTransactions}?page=99`)
    expect(await screen.findByText('This page is past the end')).toBeVisible()
    expect(screen.getByText(/There are 59 transactions/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Go to the first page' }))
    await waitFor(() => expect(location()).toBe(ROUTES.walletTransactions))
  })

  it('shows the server error and lets the operator retry', async () => {
    server.use(
      http.get(`${API_PREFIX}/admin/wallet/transactions`, () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'INTERNAL',
              message: 'Ledger unavailable',
              correlationId: 'c-1',
            },
          },
          { status: 500 },
        ),
      ),
    )
    renderAt(ROUTES.walletTransactions)
    expect(await screen.findByText('Ledger unavailable')).toBeVisible()
    expect(screen.getByRole('button', { name: /retry|try again/i })).toBeVisible()
  })
})

describe('who sees what', () => {
  it('links each account to its record', async () => {
    const user = renderAt(`${ROUTES.walletTransactions}?userId=${DEVELOPER}`)
    const rows = await table()
    const links = await rows.findAllByRole('link', { name: 'App Developer' })
    expect(links[0]).toHaveAttribute('href', ROUTES.user(DEVELOPER))
    await user.click(links[0]!)
    expect(await screen.findByText('User record')).toBeVisible()
  })
})
