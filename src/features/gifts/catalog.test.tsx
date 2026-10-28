import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { emptyMockCatalog, mockGifts, resetMockCatalog } from '@/mocks/handlers/catalog'
import { API_PREFIX } from '@/mocks/handlers/shared'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { GiftCatalogPage } from './GiftCatalogPage'

/**
 * The gift catalog — phase G2.
 *
 * ⚠️ The asset thumbnails are not exercised here: under `.env.test` the API
 * base is `http://localhost`, so `catalogAssetUrl` correctly refuses every
 * stored path. `components/media/CatalogAsset.test.tsx` covers the player.
 */

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/diamonds/gifts', element: <GiftCatalogPage /> }],
    { initialEntries: ['/diamonds/gifts'] },
  )

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TooltipProvider delayDuration={0}>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>,
  )

  return userEvent.setup()
}

function categoryNames() {
  return screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent)
}

function giftNames(category: string) {
  const list = screen.getByRole('list', { name: `Gifts in ${category}` })
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.font-medium')?.textContent)
}

/** Wait until the permission-gated controls exist — `/auth/me` lands late. */
async function waitForControls() {
  await screen.findByRole('button', { name: 'Move VIP Luxuries up' })
}

beforeEach(() => {
  resetMockCatalog()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('reading the catalog', () => {
  it('shows categories and their nested gifts in sortOrder', async () => {
    renderScreen()
    await screen.findByText('Popular Gifts')

    /* The retired set is at 99 — last, whatever order the server sent. */
    expect(categoryNames()).toEqual([
      'Popular Gifts',
      'VIP Luxuries',
      'Super Stage FX',
      '[TEST] Retired Set',
    ])
    expect(giftNames('Popular Gifts')).toEqual([
      'Heart Icon',
      'Rose Bouquet',
      'Chocolate Box',
    ])
  })

  it('marks an inactive category rather than hiding it', async () => {
    /* ⚠️ Soft delete: "deleted" is a state, never an absence (plan.md §2.5). */
    renderScreen()
    const heading = await screen.findByRole('heading', { name: '[TEST] Retired Set' })
    const section = heading.closest('li')
    expect(section).not.toBeNull()
    expect(within(section as HTMLElement).getByText('Inactive')).toBeInTheDocument()
  })

  it('says the live catalog is free, counting only gifts on sale', async () => {
    /*
     * ⚠️ plan.md O1: 8 active gifts at 0, plus the hostile fixture at 25.
     * The count is the assertion — 9 would mean the priced one was counted.
     */
    renderScreen()
    expect(
      await screen.findByText(/8 gifts on sale cost 0 diamonds\./),
    ).toBeInTheDocument()
  })

  it('stops warning once nothing on sale is free', async () => {
    for (const gift of mockGifts())
      (gift as { priceDiamonds: number }).priceDiamonds = 5
    renderScreen()
    await screen.findByText('Popular Gifts')
    expect(screen.queryByText(/cost 0 diamonds/)).toBeNull()
  })

  it('shows the price, a zero included, never a blank', async () => {
    renderScreen()
    await screen.findByText('Popular Gifts')
    expect(screen.getAllByText('0 diamonds')).toHaveLength(8)
    expect(screen.getByText('25 diamonds')).toBeInTheDocument()
  })

  it('shows the catalog version an operator can check against', async () => {
    renderScreen()
    expect(await screen.findByText('11')).toBeInTheDocument()
  })

  it('refuses a javascript: icon without dropping the gift', async () => {
    /* The hostile fixture stays listed, its asset flagged. */
    renderScreen()
    await screen.findByText('Popular Gifts')
    expect(screen.getByTitle('X'.repeat(400))).toBeInTheDocument()
    expect(screen.getByTitle('javascript:alert(document.domain)')).toHaveTextContent(
      'Unsafe asset URL',
    )
    expect(document.querySelector('[src^="javascript:"]')).toBeNull()
  })

  it('says so when there is no catalog', async () => {
    emptyMockCatalog()
    renderScreen()
    expect(await screen.findByText('No gift categories yet')).toBeInTheDocument()
  })
})

describe('the active filter is client-side', () => {
  it('never sends ?isActive, which the server ignores', async () => {
    /*
     * ⚠️ plan.md O3: `isActive=false` returns 8 active rows. A request
     * carrying it would look filtered and not be.
     */
    const urls: string[] = []
    server.events.on('request:start', ({ request }) => {
      urls.push(request.url)
    })

    const user = renderScreen()
    await screen.findByText('Popular Gifts')
    await user.click(screen.getByRole('combobox', { name: 'Show' }))
    await user.click(await screen.findByRole('option', { name: 'Inactive only' }))

    server.events.removeAllListeners()
    expect(urls.some((url) => url.includes('/admin/gifts'))).toBe(true)
    expect(urls.some((url) => url.includes('isActive'))).toBe(false)
  })

  it('hides active gifts on Inactive only, and says why a category is empty', async () => {
    ;(mockGifts()[1] as { isActive: boolean }).isActive = false

    const user = renderScreen()
    await screen.findByText('Popular Gifts')
    await user.click(screen.getByRole('combobox', { name: 'Show' }))
    await user.click(await screen.findByRole('option', { name: 'Inactive only' }))

    expect(giftNames('Popular Gifts')).toEqual(['Rose Bouquet'])
    expect(screen.getAllByText('No inactive gifts in this category.').length).toBe(2)
  })

  it('withdraws reordering while filtered', async () => {
    /*
     * ⚠️ The batch renumbers the whole group, hidden rows included — a move
     * on a filtered list would jump rows the operator cannot see.
     */
    const user = renderScreen()
    await waitForControls()
    await user.click(screen.getByRole('combobox', { name: 'Show' }))
    await user.click(await screen.findByRole('option', { name: 'Active only' }))

    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull()
    expect(screen.getByText(/Reordering is available on All gifts/)).toBeInTheDocument()
  })
})

describe('reordering', () => {
  it('moves a gift and shows the order the server now holds', async () => {
    const user = renderScreen()
    await waitForControls()

    await user.click(screen.getByRole('button', { name: 'Move Rose Bouquet up' }))

    await waitFor(() =>
      expect(giftNames('Popular Gifts')).toEqual([
        'Rose Bouquet',
        'Heart Icon',
        'Chocolate Box',
      ]),
    )
    /* Read back from the mock's state, not from what the screen painted. */
    const stored = mockGifts().filter((gift) => gift.categoryId === 'cat_popular')
    expect(stored.find((gift) => gift.name === 'Rose Bouquet')?.sortOrder).toBe(0)
    expect(stored.find((gift) => gift.name === 'Heart Icon')?.sortOrder).toBe(1)
  })

  it('sends only the rows that changed, in the measured batch shape', async () => {
    let body: unknown = null
    server.use(
      http.patch(
        `${API_PREFIX}/admin/gifts/categories/reorder`,
        async ({ request }) => {
          body = await request.json()
          return HttpResponse.json({ success: true, message: 'ok' })
        },
      ),
    )

    const user = renderScreen()
    await waitForControls()
    await user.click(screen.getByRole('button', { name: 'Move Super Stage FX down' }))

    /* The retired set sat at 99; it is renumbered to 2, not swapped to 2. */
    await waitFor(() =>
      expect(body).toEqual({
        items: [
          { id: 'cat_retired', sortOrder: 2 },
          { id: 'cat_fx', sortOrder: 3 },
        ],
      }),
    )
  })

  it('cannot move the first row up or the last row down', async () => {
    renderScreen()
    await waitForControls()
    expect(screen.getByRole('button', { name: 'Move Popular Gifts up' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Move [TEST] Retired Set down' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Heart Icon up' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Move Chocolate Box down' }),
    ).toBeDisabled()
  })

  it('reports a failed reorder and keeps the stored order', async () => {
    server.use(
      http.patch(`${API_PREFIX}/admin/gifts/reorder`, () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Reorder failed upstream.' } },
          { status: 500 },
        ),
      ),
    )

    const user = renderScreen()
    await waitForControls()
    await user.click(screen.getByRole('button', { name: 'Move Rose Bouquet up' }))

    expect(await screen.findByText('Reorder failed upstream.')).toBeInTheDocument()
    expect(giftNames('Popular Gifts')).toEqual([
      'Heart Icon',
      'Rose Bouquet',
      'Chocolate Box',
    ])
  })
})

describe('who may change the order', () => {
  it('an ADMIN reads the catalog and gets no reorder controls', async () => {
    /*
     * ⚠️ `gifts.configure` is Super-Admin-only (RBAC doc :52). The ADMIN can
     * read every price, which is the point of letting them in at all.
     *
     * ⚠️ **Waits for `/admin/auth/me` before asserting an absence.** The
     * controls are hidden for everyone until the session resolves, so an
     * immediate query would pass for a SUPER_ADMIN too and prove nothing.
     */
    let resolved = false
    server.events.on('response:mocked', ({ request }) => {
      if (request.url.includes('/admin/auth/me')) resolved = true
    })

    signInMockAdmin('ADMIN')
    renderScreen()
    await screen.findByText('Popular Gifts')
    await waitFor(() => expect(resolved).toBe(true))
    server.events.removeAllListeners()

    expect(screen.getAllByText('0 diamonds').length).toBe(8)
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull()
  })
})
