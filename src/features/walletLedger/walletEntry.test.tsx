import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { ROUTES } from '@/app/routes'
import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { API_PREFIX } from '@/mocks/handlers/shared'
import {
  mockWalletTransactions,
  resetMockWalletTransactions,
} from '@/mocks/handlers/walletTransactions'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { methodName, trxIdOf } from '@/lib/walletLabels'
import { WalletTransactionPage } from './WalletTransactionPage'
import { WalletTransactionsPage } from './WalletTransactionsPage'

/**
 * One wallet entry, and the way in and out of it — plan.md phase T3.
 *
 * ⚠️ Measured on staging 2026-11-01 before this was written: there is no
 * `GET /admin/wallet/requests/:id`, and the queue's `search` does not match a
 * request id — but it does match the payment TrxID in the entry's note.
 */

const ADMIN = 'cmv80oug40000b9kzd52qpjds'

function entry(
  predicate: (row: ReturnType<typeof mockWalletTransactions>[number]) => boolean,
) {
  const row = mockWalletTransactions().find(predicate)
  if (!row) throw new Error('No such seeded entry')
  return row
}

function Where() {
  const location = useLocation()
  return <output aria-label="Location">{location.pathname + location.search}</output>
}

function renderAt(entryPath: string, state?: unknown) {
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
      {
        path: `${ROUTES.walletTransactions}/:transactionId`,
        element: (
          <>
            <WalletTransactionPage />
            <Where />
          </>
        ),
      },
      { path: '/users/:userId', element: <Where /> },
      { path: ROUTES.topUps, element: <Where /> },
      { path: ROUTES.diamondTransactions, element: <Where /> },
    ],
    {
      initialEntries: [
        state === undefined ? entryPath : { pathname: entryPath, state },
      ],
    },
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

function location() {
  return screen.getByLabelText('Location').textContent ?? ''
}

async function card(name: string) {
  return within(await screen.findByRole('region', { name }))
}

function nameAdmin(id = ADMIN, displayName = 'Super Administrator') {
  server.use(
    http.get(`${API_PREFIX}/admin/users/${id}`, () =>
      HttpResponse.json({
        success: true,
        data: { identity: { id, displayName, username: null } },
      }),
    ),
  )
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

describe('from the ledger and back', () => {
  it('opens a row, and returns to the same filtered view', async () => {
    const user = renderAt(`${ROUTES.walletTransactions}?type=ADMIN_ADJUSTMENT`)
    const table = within(await screen.findByRole('table'))
    const [first] = table.getAllByRole('row').slice(1)
    await user.click(within(first!).getByText('Adjustment'))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Adjustment' }),
    ).toBeVisible()
    expect(location()).toMatch(/^\/diamonds\/wallet-transactions\/[^/?]+$/)

    await user.click(screen.getAllByRole('link', { name: /Wallet transactions/ })[0]!)
    await waitFor(() =>
      expect(location()).toBe(`${ROUTES.walletTransactions}?type=ADMIN_ADJUSTMENT`),
    )
  })

  it('keeps the filters when opened from the time link too', async () => {
    const user = renderAt(`${ROUTES.walletTransactions}?direction=DEBIT`)
    const table = within(await screen.findByRole('table'))
    const [first] = table.getAllByRole('row').slice(1)
    await user.click(within(first!).getAllByRole('link')[0]!)
    await screen.findByRole('heading', { level: 1 })
    expect(
      screen.getAllByRole('link', { name: /Wallet transactions/ })[0],
    ).toHaveAttribute('href', `${ROUTES.walletTransactions}?direction=DEBIT`)
  })

  it('makes the time a real link to the entry, for a new tab', async () => {
    renderAt(ROUTES.walletTransactions)
    const table = within(await screen.findByRole('table'))
    const newest = mockWalletTransactions()[0]!
    const [first] = table.getAllByRole('row').slice(1)
    expect(within(first!).getAllByRole('link')[0]).toHaveAttribute(
      'href',
      ROUTES.walletTransaction(newest.id),
    )
  })

  it('opens the account, not the entry, when its link in a row is clicked', async () => {
    const user = renderAt(ROUTES.walletTransactions)
    const table = within(await screen.findByRole('table'))
    const [link] = await table.findAllByRole('link', { name: 'App Developer' })
    await user.click(link!)
    await waitFor(() => expect(location()).toMatch(/^\/users\//))
  })

  it('opens the entry with Enter on a focused row', async () => {
    const user = renderAt(ROUTES.walletTransactions)
    const table = within(await screen.findByRole('table'))
    const [first] = table.getAllByRole('row').slice(1)
    first!.focus()
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(location()).toBe(
        ROUTES.walletTransaction(mockWalletTransactions()[0]!.id),
      ),
    )
  })

  it('goes back to the plain ledger when opened directly', async () => {
    const row = entry((r) => r.type === 'ADMIN_ADJUSTMENT')
    renderAt(ROUTES.walletTransaction(row.id))
    await screen.findByRole('heading', { level: 1 })
    expect(
      screen.getAllByRole('link', { name: /Wallet transactions/ })[0],
    ).toHaveAttribute('href', ROUTES.walletTransactions)
  })

  it('never follows a path smuggled into the back state', async () => {
    const row = entry((r) => r.type === 'ADMIN_ADJUSTMENT')
    renderAt(ROUTES.walletTransaction(row.id), { from: '/settings' })
    await screen.findByRole('heading', { level: 1 })
    for (const link of screen.getAllByRole('link', { name: /Wallet transactions/ })) {
      expect(link).toHaveAttribute('href', ROUTES.walletTransactions)
    }
  })
})

describe('back to the account it was opened from (T4)', () => {
  const row = () => entry((r) => r.type === 'ADMIN_ADJUSTMENT')

  it('returns to the Finance tab, named for the account', async () => {
    renderAt(ROUTES.walletTransaction(row().id), {
      backTo: '/users/u_42?tab=finance',
      backLabel: '  Rakibul Khan  ',
    })
    const back = await screen.findByRole('link', { name: 'Rakibul Khan' })
    expect(back).toHaveAttribute('href', '/users/u_42?tab=finance')
    expect(screen.queryByRole('link', { name: /Wallet transactions/ })).toBeNull()
  })

  it('caps a long name', async () => {
    renderAt(ROUTES.walletTransaction(row().id), {
      backTo: '/users/u_42',
      backLabel: 'N'.repeat(200),
    })
    expect(await screen.findByRole('link', { name: 'N'.repeat(60) })).toBeVisible()
  })

  it('says where it goes even without a name', async () => {
    renderAt(ROUTES.walletTransaction(row().id), { backTo: '/users/u_42' })
    expect(
      await screen.findByRole('link', { name: 'Back to the account' }),
    ).toHaveAttribute('href', '/users/u_42')
  })

  it.each([
    '/settings',
    'https://evil.example/users/u_42',
    '//evil.example/users/u_42',
    '/users/u_42/../../settings',
    '/users/u_42?tab=finance&next=/settings',
    '/users/',
  ])('refuses %j, and goes to the ledger instead', async (backTo) => {
    renderAt(ROUTES.walletTransaction(row().id), { backTo, backLabel: 'Trap' })
    const back = await screen.findByRole('link', { name: /Wallet transactions/ })
    expect(back).toHaveAttribute('href', ROUTES.walletTransactions)
    expect(screen.queryByRole('link', { name: 'Trap' })).toBeNull()
  })
})

describe('an adjustment', () => {
  it('names the admin, and shows the balance then and now', async () => {
    nameAdmin()
    const row = entry((r) => r.type === 'ADMIN_ADJUSTMENT' && r.amount > 0)
    renderAt(ROUTES.walletTransaction(row.id))

    expect(await screen.findByText(`+${row.amount}`)).toBeVisible()
    expect(screen.getByText('Diamonds credited')).toBeVisible()

    const source = await card('Source')
    const admin = await source.findByRole('link', { name: 'Super Administrator' })
    expect(admin).toHaveAttribute('href', ROUTES.user(ADMIN))

    const account = await card('Account')
    expect(account.getByText('Balance after this')).toBeVisible()
    expect(
      account.getByText(`${row.balanceAfter!.toLocaleString('en-US')} Diamonds`),
    ).toBeVisible()
    /* The newest entry for this account: its balance now. */
    const newest = mockWalletTransactions().find((r) => r.userId === row.userId)!
    expect(
      account.getAllByText(`${newest.balanceAfter!.toLocaleString('en-US')} Diamonds`)
        .length,
    ).toBeGreaterThan(0)
    expect(
      account.getByRole('link', { name: 'All their wallet transactions' }),
    ).toHaveAttribute('href', ROUTES.walletLedger({ userId: row.userId }))
  })

  it('draws a debit as a debit', async () => {
    const row = entry((r) => r.type === 'ADMIN_ADJUSTMENT' && r.amount < 0)
    renderAt(ROUTES.walletTransaction(row.id))
    expect(await screen.findByText('Diamonds debited')).toBeVisible()
    expect(screen.getByText(`−${Math.abs(row.amount)}`)).toBeVisible()
  })

  it('shows the note as plain text', async () => {
    const row = entry((r) => r.type === 'ADMIN_ADJUSTMENT')
    renderAt(ROUTES.walletTransaction(row.id))
    expect(await (await card('Note')).findByText(row.note!)).toBeVisible()
  })

  it('keeps ids out of sight, under Technical details', async () => {
    nameAdmin()
    const row = entry((r) => r.type === 'ADMIN_ADJUSTMENT')
    renderAt(ROUTES.walletTransaction(row.id))
    await (await card('Source')).findByRole('link', { name: 'Super Administrator' })

    const details = screen.getByText('Technical details').closest('details')!
    expect(details).not.toHaveAttribute('open')
    for (const region of screen.getAllByRole('region')) {
      expect(region.textContent).not.toContain(ADMIN)
      expect(region.textContent).not.toContain(row.id)
    }
    expect(within(details).getByLabelText(/Reference ID/)).toBeInTheDocument()
  })
})

describe('a top-up', () => {
  const row = () => entry((r) => r.type === 'TOP_UP')
  const trx = () => trxIdOf(row().note)!

  function serveRequest(found: boolean) {
    const searched: string[] = []
    server.use(
      http.get(`${API_PREFIX}/admin/wallet/requests`, ({ request }) => {
        searched.push(new URL(request.url).searchParams.get('search') ?? '')
        const items = found
          ? [
              {
                id: row().refId,
                userId: row().userId,
                diamonds: 1080,
                amountBdt: 500,
                method: 'BKASH',
                transactionId: trx(),
                status: 'APPROVED',
                reviewedById: ADMIN,
                reviewedAt: '2026-10-30T10:00:00.000Z',
                createdAt: '2026-10-30T09:00:00.000Z',
                package: { id: 'p1', title: 'Starter pack' },
              },
            ]
          : []
        return HttpResponse.json({
          success: true,
          data: { items, total: items.length, page: 1, limit: 100, totalPages: 1 },
        })
      }),
    )
    return searched
  }

  it('finds its request by the TrxID, and shows what was paid and who approved it', async () => {
    nameAdmin()
    const searched = serveRequest(true)
    renderAt(ROUTES.walletTransaction(row().id))

    const source = await card('Source')
    expect(await source.findByText('Starter pack')).toBeVisible()
    expect(searched).toEqual([trx()])
    expect(source.getByText('bKash')).toBeVisible()
    expect(source.getByText(/500/)).toBeVisible()
    expect(source.getByText(trx())).toBeVisible()
    expect(
      await source.findByRole('link', { name: 'Super Administrator' }),
    ).toBeVisible()
    expect(
      source.getByRole('link', { name: /Open in Top-up requests/ }),
    ).toHaveAttribute('href', ROUTES.topUpsFor(trx()))
  })

  it('never takes another request that happens to match the search', async () => {
    server.use(
      http.get(`${API_PREFIX}/admin/wallet/requests`, () =>
        HttpResponse.json({
          success: true,
          data: {
            items: [
              {
                id: 'someone-elses-request',
                amountBdt: 9999,
                method: 'NAGAD',
                transactionId: trx(),
                package: { id: 'p9', title: 'Wrong pack' },
              },
            ],
            total: 1,
            page: 1,
            limit: 100,
            totalPages: 1,
          },
        }),
      ),
    )
    renderAt(ROUTES.walletTransaction(row().id))
    expect(
      await (await card('Source')).findByText(/could not be found in the top-up queue/),
    ).toBeVisible()
    expect(screen.queryByText('Wrong pack')).not.toBeInTheDocument()
  })

  it('says so when the queue does not have the request', async () => {
    serveRequest(false)
    renderAt(ROUTES.walletTransaction(row().id))
    expect(
      await (await card('Source')).findByText(/could not be found in the top-up queue/),
    ).toBeVisible()
    expect((await card('Source')).getByText('bKash')).toBeVisible()
  })
})

describe('a gift and a conversion', () => {
  it('names the gift, and opens the sender’s gifts', async () => {
    const row = entry((r) => r.type === 'GIFT_SENT' && r.refId === 'gift-heart_icon')
    renderAt(ROUTES.walletTransaction(row.id))
    const source = await card('Source')
    expect(await source.findByText('Heart Icon')).toBeVisible()
    expect(
      source.getByRole('link', { name: /Their gift transactions/ }),
    ).toHaveAttribute('href', ROUTES.giftLedger({ senderId: row.userId }))
  })

  it('calls a free gift Free', async () => {
    const row = entry((r) => r.type === 'GIFT_SENT' && r.amount === 0)
    renderAt(ROUTES.walletTransaction(row.id))
    expect(await screen.findByText('Diamonds · Free')).toBeVisible()
  })

  it('explains a conversion', async () => {
    const row = entry((r) => r.type === 'CREATOR_EARNINGS_CONVERT')
    renderAt(ROUTES.walletTransaction(row.id))
    expect(await (await card('Source')).findByText('Creator Studio')).toBeVisible()
  })
})

describe('when it cannot be shown', () => {
  it('says the entry was not found, with a way back', async () => {
    renderAt(ROUTES.walletTransaction('nope'))
    expect(await screen.findByText('Transaction not found')).toBeVisible()
    expect(
      screen.getAllByRole('link', { name: /Wallet transactions/ })[0],
    ).toHaveAttribute('href', ROUTES.walletTransactions)
  })

  it('shows the server error with a retry', async () => {
    const row = mockWalletTransactions()[0]!
    server.use(
      http.get(`${API_PREFIX}/admin/wallet/transactions/:id`, () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'INTERNAL', message: 'Ledger unavailable' },
          },
          { status: 500 },
        ),
      ),
    )
    renderAt(ROUTES.walletTransaction(row.id))
    expect(await screen.findByText('Ledger unavailable')).toBeVisible()
    expect(screen.getByRole('button', { name: /retry|try again/i })).toBeVisible()
  })
})

describe('reading a top-up note', () => {
  it.each([
    ['Manual top-up via BKASH (TrxID: KUYGG655HHY)', 'KUYGG655HHY'],
    ['Manual top-up via BKASH (TrxID: C6H TSTARA)', 'C6H TSTARA'],
    ['Manual top-up via NAGAD (TrxID:  TEST_TRX_NGD4410 )', 'TEST_TRX_NGD4410'],
    ['Manual top-up via BKASH', null],
    [null, null],
  ])('the TrxID in %j is %j', (note, trxId) => {
    expect(trxIdOf(note)).toBe(trxId)
  })

  it.each([
    ['BKASH', 'bKash'],
    ['nagad', 'Nagad'],
    ['BANK_TRANSFER', 'Bank transfer'],
    ['', null],
  ])('method %j reads %j', (raw, name) => {
    expect(methodName(raw)).toBe(name)
  })
})
