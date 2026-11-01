import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { adjustWallet } from '@/api/wallet'
import { ROUTES } from '@/app/routes'
import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { API_PREFIX } from '@/mocks/handlers/shared'
import { resetMockWalletTransactions } from '@/mocks/handlers/walletTransactions'
import { users } from '@/mocks/seed'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { UserDetailPage } from '../UserDetailPage'

/**
 * Wallet history on the user's Finance tab — plan.md T4.
 */

const TARGET = users.find((user) => user.wallet.availableDiamonds > 1000)!
let startingBalance = 0

function Where() {
  const location = useLocation()
  return (
    <>
      <output aria-label="Location">{location.pathname + location.search}</output>
      <output aria-label="State">{JSON.stringify(location.state ?? null)}</output>
    </>
  )
}

function renderAt(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      {
        path: '/users/:userId',
        element: (
          <>
            <UserDetailPage />
            <Where />
          </>
        ),
      },
      { path: `${ROUTES.walletTransactions}/:transactionId`, element: <Where /> },
      { path: ROUTES.walletTransactions, element: <Where /> },
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

const FINANCE = `${ROUTES.user(TARGET.id)}?tab=finance`

function location() {
  return screen.getByLabelText('Location').textContent ?? ''
}

async function history() {
  return within(await screen.findByRole('region', { name: 'Wallet history' }))
}

/** The loaded entries — not the loading skeleton's placeholders. */
async function entries() {
  const list = await screen.findByRole('list', { name: 'Newest wallet entries' })
  return within(list).getAllByRole('listitem')
}

async function credit(times: number) {
  for (let index = 0; index < times; index += 1) {
    await adjustWallet({
      userId: TARGET.id,
      amount: 10 + index,
      note: `Seeded credit number ${index + 1}.`,
    })
  }
}

function watchLedger() {
  const asked: URL[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/admin/wallet/transactions')) asked.push(url)
  })
  return asked
}

beforeEach(() => {
  resetMockWalletTransactions()
  server.events.removeAllListeners()
  startingBalance = TARGET.wallet.availableDiamonds
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

afterEach(() => {
  TARGET.wallet.availableDiamonds = startingBalance
})

describe('the Finance tab, by URL', () => {
  it('opens from ?tab=finance', async () => {
    renderAt(FINANCE)
    expect(
      await screen.findByRole('tab', { name: 'Finance', selected: true }),
    ).toBeVisible()
  })

  it('writes the tab to the URL, and clears it for the first tab', async () => {
    const user = renderAt(ROUTES.user(TARGET.id))
    await user.click(await screen.findByRole('tab', { name: 'Finance' }))
    await waitFor(() => expect(location()).toBe(FINANCE))
    await user.click(screen.getByRole('tab', { name: 'Overview' }))
    await waitFor(() => expect(location()).toBe(ROUTES.user(TARGET.id)))
  })

  it('switches on click and keeps the choice once the URL catches up', async () => {
    const user = renderAt(ROUTES.user(TARGET.id))
    await user.click(await screen.findByRole('tab', { name: 'Access & restrictions' }))
    /*
     * ⚠️ The one-tick flicker back to the old tab (fixed 2026-11-01) does not
     * reproduce here — the memory router writes the URL synchronously. It
     * shows only in a real browser, where `tests/e2e/rbac.spec.ts` catches it.
     */
    expect(screen.getByRole('tab', { name: 'Access & restrictions' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await waitFor(() => expect(location()).toContain('tab=access'))
    expect(screen.getByRole('tab', { name: 'Access & restrictions' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('falls back to the first tab for one it does not know', async () => {
    renderAt(`${ROUTES.user(TARGET.id)}?tab=nonsense`)
    expect(
      await screen.findByRole('tab', { name: 'Overview', selected: true }),
    ).toBeVisible()
  })
})

describe('the history', () => {
  it('says so when the account has no wallet activity', async () => {
    renderAt(FINANCE)
    expect(await (await history()).findByText(/No wallet activity yet/)).toBeVisible()
  })

  it('lists the five newest by default, with totals and a way to all of them', async () => {
    await credit(12)
    const asked = watchLedger()
    renderAt(FINANCE)
    const list = await history()

    const rows = await entries()
    expect(rows).toHaveLength(5)
    expect(within(rows[0]!).getByRole('link', { name: 'Adjustment' })).toBeVisible()
    /* Newest first: the twelfth credit, of 21. */
    expect(within(rows[0]!).getByText('+21')).toBeVisible()

    expect(Object.fromEntries(asked.at(-1)!.searchParams)).toEqual({
      userId: TARGET.id,
      page: '1',
      limit: '5',
    })
    expect(list.getByRole('link', { name: /See all 12/ })).toHaveAttribute(
      'href',
      ROUTES.walletLedger({ userId: TARGET.id }),
    )
    const credited = Array.from({ length: 12 }, (_, i) => 10 + i).reduce(
      (a, b) => a + b,
    )
    expect(list.getByText(`+${credited}`)).toBeVisible()
  })

  it('opens an entry, carrying the way back to this tab', async () => {
    await credit(1)
    const user = renderAt(FINANCE)
    await user.click(await (await history()).findByRole('link', { name: 'Adjustment' }))
    await waitFor(() =>
      expect(location()).toMatch(/^\/diamonds\/wallet-transactions\/.+/),
    )
    expect(JSON.parse(screen.getByLabelText('State').textContent ?? '{}')).toEqual({
      backTo: FINANCE,
      backLabel: TARGET.displayName,
    })
  })

  it('keeps the adjusting admin a link of its own', async () => {
    await credit(1)
    const user = renderAt(FINANCE)
    await history()
    const row = (await entries())[0]!
    await waitFor(() => expect(within(row).getAllByRole('link')).toHaveLength(2))
    const links = within(row).getAllByRole('link')
    await user.click(links[1]!)
    await waitFor(() => expect(location()).toMatch(/^\/users\//))
    expect(location()).not.toContain('wallet-transactions')
  })

  it('shows a new adjustment at once, without a reload', async () => {
    const user = renderAt(FINANCE)
    const list = await history()
    await list.findByText(/No wallet activity yet/)

    await user.click(
      screen.getByRole('button', { name: /adjust the diamond balance/i }),
    )
    const form = await screen.findByRole('dialog', { name: /adjust diamond balance/i })
    await user.type(within(form).getByLabelText(/^Amount/), '75')
    await user.type(
      within(form).getByLabelText(/^Note/),
      'Compensation for a dropped call.',
    )
    await user.click(within(form).getByRole('button', { name: /review adjustment/i }))
    const confirm = await screen.findByRole('dialog', { name: /credit this wallet/i })
    await user.type(within(confirm).getByLabelText(/type/i), '75')
    await user.click(
      within(confirm).getByRole('button', { name: /credit the wallet/i }),
    )

    await waitFor(async () =>
      expect(within((await entries())[0]!).getByText('+75')).toBeVisible(),
    )
    expect(list.getByRole('link', { name: /See all 1/ })).toBeVisible()
  })

  it('keeps an outage inside the section, with a retry', async () => {
    server.use(
      http.get(`${API_PREFIX}/admin/wallet/transactions`, () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'INTERNAL', message: 'Ledger unavailable' },
          },
          { status: 500 },
        ),
      ),
    )
    renderAt(FINANCE)
    const list = await history()
    expect(await list.findByRole('alert')).toHaveTextContent('Ledger unavailable')
    expect(list.getByRole('button', { name: 'Try again' })).toBeVisible()
    /* The rest of Finance is untouched. */
    expect(screen.getByText('Diamond summary')).toBeVisible()
  })
})

describe('who sees it', () => {
  it('is there for an ADMIN', async () => {
    signInMockAdmin('ADMIN')
    renderAt(FINANCE)
    expect(await screen.findByRole('region', { name: 'Wallet history' })).toBeVisible()
  })

  it('is not there for a MODERATOR, and is never asked for', async () => {
    signInMockAdmin('MODERATOR')
    const asked = watchLedger()
    renderAt(FINANCE)
    expect(await screen.findByText('Diamond summary')).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Wallet history' })).toBeNull()
    expect(screen.queryByText(/wallet history below/)).toBeNull()
    expect(asked).toHaveLength(0)
  })
})
