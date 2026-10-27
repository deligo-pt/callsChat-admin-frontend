import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import {
  mockDiamondPackages,
  resetMockWallet,
  seedMockWallet,
} from '@/mocks/handlers/wallet'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { PackagesPage } from './PackagesPage'

/**
 * The diamond price list — phase W4.
 *
 * ⚠️ Everything on this page is live. The tests that matter are the ones about
 * who may change it and what a change does, not about the table.
 */

function renderScreen(role: 'SUPER_ADMIN' | 'ADMIN' = 'SUPER_ADMIN') {
  signInMockAdmin(role)

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/diamonds/packages', element: <PackagesPage /> }],
    { initialEntries: ['/diamonds/packages'] },
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

/**
 * Has `AuthProvider` resolved `GET /admin/auth/me` yet?
 *
 * ⚠️ **Every permission assertion on this page needs this, and a negative one
 * needs it most.** `can()` returns false until the request lands, so
 * "the Edit button is absent" passes for an ADMIN *and* for a Super Admin who
 * simply has not been authorised yet — a test that cannot tell those apart is
 * not testing permissions. Waiting on the response itself is the only signal
 * on this screen that distinguishes "denied" from "not asked yet".
 */
let authSettled = false

function whenAuthSettled() {
  return waitFor(() => expect(authSettled).toBe(true))
}

beforeEach(() => {
  resetMockWallet()
  setViewport(1440)

  authSettled = false
  server.events.removeAllListeners('response:mocked')
  server.events.on('response:mocked', ({ request }) => {
    if (new URL(request.url).pathname.endsWith('/admin/auth/me')) authSettled = true
  })
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the list', () => {
  it('shows inactive tiers, because the admin list is not the storefront', async () => {
    /*
     * ⚠️ Filtering hidden tiers out would make a withdrawn package look
     * deleted and leave nobody able to switch it back on.
     */
    seedMockWallet()
    renderScreen()

    expect(await screen.findByText('Starter Pack')).toBeInTheDocument()
    expect(screen.getByText('Retired Tier')).toBeInTheDocument()
    expect(screen.getByText('Hidden')).toBeInTheDocument()
    expect(screen.getAllByText('On sale').length).toBe(2)
  })

  it('keeps a fractional USD price intact', async () => {
    /* ⚠️ `priceUsd: 25.5` must not be rounded to $26 or dropped. */
    seedMockWallet()
    renderScreen()

    expect(await screen.findByText('$25.50')).toBeInTheDocument()
  })

  it('says buyers cannot top up at all when the list is empty', async () => {
    renderScreen()
    expect(await screen.findByText('No packages yet')).toBeInTheDocument()
    expect(screen.getByText(/no way to add diamonds/i)).toBeInTheDocument()
  })
})

describe('who may change the price list', () => {
  it('gives a Super Admin the controls', async () => {
    seedMockWallet()
    renderScreen('SUPER_ADMIN')

    await screen.findByText('Starter Pack')
    await whenAuthSettled()

    expect(
      await screen.findByRole('button', { name: 'New package' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Edit Starter Pack' }),
    ).toBeInTheDocument()
  })

  it('shows an ADMIN the list and none of the controls', async () => {
    /*
     * ⚠️ Not theatre, unlike the top-up queue's gate.
     * `doc/RBAC, Security, and Privacy.md:52` reserves pricing for Super Admin
     * with the rest of the finance class, so hiding these reflects the
     * backend's policy rather than inventing one. An ADMIN still needs to read
     * the list — it is how they answer "what did this person buy".
     */
    seedMockWallet()
    renderScreen('ADMIN')

    expect(await screen.findByText('Starter Pack')).toBeInTheDocument()
    await whenAuthSettled()

    expect(screen.queryByRole('button', { name: 'New package' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull()
  })
})

describe('creating', () => {
  it('refuses the server’s three required fields, in the server’s words', async () => {
    const user = renderScreen()
    await screen.findByText('No packages yet')
    await user.click(await screen.findByRole('button', { name: 'New package' }))
    const dialog = await screen.findByRole('dialog', { name: /new package/i })
    await user.click(within(dialog).getByRole('button', { name: /create package/i }))

    expect(await within(dialog).findByText('Title is required')).toBeInTheDocument()
    expect(
      within(dialog).getByText('Base diamonds must be positive'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('BDT price must be positive')).toBeInTheDocument()
    expect(mockDiamondPackages()).toHaveLength(0)
  })

  it('creates a package with the values typed', async () => {
    const user = renderScreen()
    await screen.findByText('No packages yet')
    await user.click(await screen.findByRole('button', { name: 'New package' }))
    const dialog = await screen.findByRole('dialog', { name: /new package/i })

    await user.type(within(dialog).getByLabelText(/^Title/), 'Vault of Kings')
    await user.type(within(dialog).getByLabelText(/^Diamonds/), '25000')
    await user.type(within(dialog).getByLabelText(/Price \(BDT\)/), '30000')
    await user.type(within(dialog).getByLabelText(/Sort order/), '8')
    await user.click(within(dialog).getByRole('button', { name: /create package/i }))

    await waitFor(() => expect(mockDiamondPackages()).toHaveLength(1))
    const created = mockDiamondPackages()[0]
    expect(created?.title).toBe('Vault of Kings')
    expect(created?.diamonds).toBe(25000)
    expect(created?.priceBdt).toBe(30000)
    expect(created?.sortOrder).toBe(8)
  })

  it('omits an empty optional instead of sending zero', async () => {
    /*
     * ⚠️ Sending `priceUsd: 0` would publish a free package. "The operator did
     * not fill this in" has exactly one safe encoding, and it is not a number.
     */
    const user = renderScreen()
    await screen.findByText('No packages yet')
    await user.click(await screen.findByRole('button', { name: 'New package' }))
    const dialog = await screen.findByRole('dialog', { name: /new package/i })

    await user.type(within(dialog).getByLabelText(/^Title/), 'No USD Tier')
    await user.type(within(dialog).getByLabelText(/^Diamonds/), '100')
    await user.type(within(dialog).getByLabelText(/Price \(BDT\)/), '120')
    await user.type(within(dialog).getByLabelText(/Sort order/), '1')
    await user.click(within(dialog).getByRole('button', { name: /create package/i }))

    await waitFor(() => expect(mockDiamondPackages()).toHaveLength(1))
    expect(mockDiamondPackages()[0]?.priceUsd).toBeNull()
  })

  it('allows a sort order of zero, which a "must be positive" rule would not', async () => {
    const user = renderScreen()
    await screen.findByText('No packages yet')
    await user.click(await screen.findByRole('button', { name: 'New package' }))
    const dialog = await screen.findByRole('dialog', { name: /new package/i })

    await user.type(within(dialog).getByLabelText(/^Title/), 'First Tier')
    await user.type(within(dialog).getByLabelText(/^Diamonds/), '10')
    await user.type(within(dialog).getByLabelText(/Price \(BDT\)/), '15')
    await user.type(within(dialog).getByLabelText(/Sort order/), '0')
    await user.click(within(dialog).getByRole('button', { name: /create package/i }))

    await waitFor(() => expect(mockDiamondPackages()).toHaveLength(1))
    expect(mockDiamondPackages()[0]?.sortOrder).toBe(0)
  })
})

describe('editing', () => {
  it('seeds the form from the row and saves the change', async () => {
    seedMockWallet()
    const user = renderScreen()
    await screen.findByText('Starter Pack')
    await user.click(await screen.findByRole('button', { name: 'Edit Starter Pack' }))
    const dialog = await screen.findByRole('dialog', { name: /edit package/i })

    expect(within(dialog).getByLabelText(/^Title/)).toHaveValue('Starter Pack')
    expect(within(dialog).getByLabelText(/Sort order/)).toHaveValue('1')

    await user.clear(within(dialog).getByLabelText(/^Title/))
    await user.type(within(dialog).getByLabelText(/^Title/), 'Starter Bundle')
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(
        mockDiamondPackages().find((p) => p.id === 'pkg-diamond-tier-1')?.title,
      ).toBe('Starter Bundle'),
    )
  })

  it('re-seeds when the operator switches rows', async () => {
    /*
     * ⚠️ Without a `key` on the dialog, react-hook-form keeps the first row's
     * `defaultValues` — so opening the second package shows the first one's
     * prices, and saving writes the wrong numbers under the right name.
     */
    seedMockWallet()
    const user = renderScreen()
    await screen.findByText('Starter Pack')
    await user.click(await screen.findByRole('button', { name: 'Edit Starter Pack' }))
    let dialog = await screen.findByRole('dialog', { name: /edit package/i })
    expect(within(dialog).getByLabelText(/Price \(BDT\)/)).toHaveValue('120')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    await user.click(await screen.findByRole('button', { name: 'Edit Diamond Chest' }))
    dialog = await screen.findByRole('dialog', { name: /edit package/i })
    expect(within(dialog).getByLabelText(/Price \(BDT\)/)).toHaveValue('3000')
    expect(within(dialog).getByLabelText(/^Title/)).toHaveValue('Diamond Chest')
  })

  it('clears a badge rather than silently keeping it', async () => {
    /*
     * ⚠️ `badgeText` cleared in the form must be sent as `null`, not omitted
     * — a partial PATCH that leaves the key out would do nothing at all.
     */
    seedMockWallet()
    const user = renderScreen()
    await screen.findByText('Diamond Chest')
    await user.click(await screen.findByRole('button', { name: 'Edit Diamond Chest' }))
    const dialog = await screen.findByRole('dialog', { name: /edit package/i })
    await user.clear(within(dialog).getByLabelText(/^Badge/))
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(
        mockDiamondPackages().find((p) => p.id === 'pkg-diamond-tier-4')?.badgeText,
      ).toBeNull(),
    )
  })
})

describe('deleting', () => {
  it('names the package and offers the safer alternative', async () => {
    seedMockWallet()
    const user = renderScreen()
    await screen.findByText('Retired Tier')
    await user.click(await screen.findByRole('button', { name: 'Delete Retired Tier' }))
    const dialog = await screen.findByRole('dialog', { name: /delete this package/i })

    expect(within(dialog).getByText(/Retired Tier/)).toBeInTheDocument()
    expect(within(dialog).getByText(/switch it off instead/i)).toBeInTheDocument()
    /* Nothing removed yet. */
    expect(mockDiamondPackages()).toHaveLength(3)
  })

  it('removes it once confirmed', async () => {
    seedMockWallet()
    const user = renderScreen()
    await screen.findByText('Retired Tier')
    await user.click(await screen.findByRole('button', { name: 'Delete Retired Tier' }))
    const dialog = await screen.findByRole('dialog', { name: /delete this package/i })
    await user.click(within(dialog).getByRole('button', { name: /delete package/i }))

    await waitFor(() => expect(mockDiamondPackages()).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
