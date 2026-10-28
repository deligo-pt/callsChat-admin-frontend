import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import {
  mockGiftCategories,
  mockGifts,
  mockStorageUploads,
  resetMockCatalog,
} from '@/mocks/handlers/catalog'
import { API_PREFIX } from '@/mocks/handlers/shared'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { GiftCatalogPage } from './GiftCatalogPage'

/**
 * Creating and editing gifts and categories — phase G3.
 *
 * ⚠️ The storage PUT is answered by the mock's `media.callschat.com` handler,
 * which records what arrived. The real host could not be reached when this
 * was measured (plan.md O13), so these tests prove what the panel *sends* —
 * not that storage accepts it.
 */

const LOTTIE = JSON.stringify({
  v: '5.7.4',
  w: 10,
  h: 10,
  fr: 30,
  ip: 0,
  op: 30,
  layers: [],
})

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

/** Bodies of every write to a route, in order. */
function captureBodies(method: 'post' | 'patch', path: string) {
  const bodies: unknown[] = []
  server.events.on('request:start', ({ request }) => {
    if (
      request.method === method.toUpperCase() &&
      new URL(request.url).pathname === `/api/v1${path}`
    ) {
      void request
        .clone()
        .json()
        .then((body: unknown) => bodies.push(body))
    }
  })
  return bodies
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }))
}

/** Create buttons wait for the catalog, and the menus for `/auth/me`. */
async function clickWhenEnabled(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const button = await screen.findByRole('button', { name })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
}

async function openNewGift(user: ReturnType<typeof userEvent.setup>) {
  const button = await screen.findByRole('button', { name: 'New gift' })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
  return screen.findByRole('dialog', { name: 'New gift' })
}

beforeEach(() => {
  resetMockCatalog()
  server.events.removeAllListeners()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('creating a gift', () => {
  it('uploads the file to storage, then saves one URL as icon and animation', async () => {
    const user = renderScreen()
    const dialog = await openNewGift(user)

    await user.type(within(dialog).getByLabelText(/^Name/), 'Golden Rose')
    await user.click(within(dialog).getByRole('combobox', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'VIP Luxuries' }))
    await user.type(within(dialog).getByLabelText(/^Price in diamonds/), '120')
    await user.upload(
      within(dialog).getByLabelText('Animation file'),
      new File([LOTTIE], 'golden_rose.json', { type: 'application/json' }),
    )
    expect(await within(dialog).findByText('golden_rose.json')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Create gift' }))
    await screen.findByText('Gift created.')

    /* The bytes went to storage with the type the upload-url request named. */
    expect(mockStorageUploads()).toHaveLength(1)
    expect(mockStorageUploads()[0]?.contentType).toBe('application/json')
    expect(mockStorageUploads()[0]?.size).toBe(LOTTIE.length)

    const created = mockGifts().find((gift) => gift.name === 'Golden Rose')
    expect(created?.categoryId).toBe('cat_luxury')
    expect(created?.priceDiamonds).toBe(120)
    expect(created?.animationType).toBe('LOTTIE')
    expect(created?.iconUrl).toBe(created?.animationUrl)
    expect(created?.iconUrl).toMatch(/^https:\/\/media\.callschat\.com\//)
    /* Appended after the category's last gift (sortOrder 2). */
    expect(created?.sortOrder).toBe(3)
  })

  it('will not create a gift without a file', async () => {
    const user = renderScreen()
    const dialog = await openNewGift(user)
    await user.type(within(dialog).getByLabelText(/^Name/), 'Golden Rose')
    await user.click(within(dialog).getByRole('combobox', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'VIP Luxuries' }))
    await user.type(within(dialog).getByLabelText(/^Price in diamonds/), '5')
    await user.click(within(dialog).getByRole('button', { name: 'Create gift' }))

    expect(
      await within(dialog).findByText('Choose the gift’s animation file.'),
    ).toBeInTheDocument()
    expect(mockStorageUploads()).toHaveLength(0)
  })

  it('refuses a PNG at the picker, before anything is uploaded', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderScreen()
    const dialog = await openNewGift(user)
    await user.upload(
      within(dialog).getByLabelText('Animation file'),
      new File(['png'], 'rose.png', { type: 'image/png' }),
    )
    expect(await within(dialog).findByText(/Export it as WebP/)).toBeInTheDocument()
  })

  it('saves nothing when storage refuses the bytes', async () => {
    server.use(
      http.put(
        'https://media.callschat.com/calls-chat-media/*',
        () =>
          new HttpResponse('<Error><Code>BadDigest</Code></Error>', { status: 400 }),
      ),
    )
    const before = mockGifts().length

    const user = renderScreen()
    const dialog = await openNewGift(user)
    await user.type(within(dialog).getByLabelText(/^Name/), 'Golden Rose')
    await user.click(within(dialog).getByRole('combobox', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'VIP Luxuries' }))
    await user.type(within(dialog).getByLabelText(/^Price in diamonds/), '5')
    await user.upload(
      within(dialog).getByLabelText('Animation file'),
      new File([LOTTIE], 'golden_rose.json', { type: 'application/json' }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Create gift' }))

    expect(
      await within(dialog).findByText(/status 400.*Nothing was saved/),
    ).toBeInTheDocument()
    expect(mockGifts()).toHaveLength(before)
  })

  it('reuses an upload when the save after it fails, rather than uploading twice', async () => {
    let attempts = 0
    server.use(
      http.post(`${API_PREFIX}/admin/gifts`, () => {
        attempts += 1
        if (attempts === 1) {
          return HttpResponse.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Database unavailable.' } },
            { status: 500 },
          )
        }
        return HttpResponse.json({ success: true, data: {} }, { status: 201 })
      }),
    )

    const user = renderScreen()
    const dialog = await openNewGift(user)
    await user.type(within(dialog).getByLabelText(/^Name/), 'Golden Rose')
    await user.click(within(dialog).getByRole('combobox', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'VIP Luxuries' }))
    await user.type(within(dialog).getByLabelText(/^Price in diamonds/), '5')
    await user.upload(
      within(dialog).getByLabelText('Animation file'),
      new File([LOTTIE], 'golden_rose.json', { type: 'application/json' }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Create gift' }))
    expect(await within(dialog).findByText('Database unavailable.')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Create gift' }))
    await screen.findByText('Gift created.')

    expect(attempts).toBe(2)
    expect(mockStorageUploads()).toHaveLength(1)
  })
})

describe('editing a free gift', () => {
  it('renames it without touching the price — the 0 is not sent', async () => {
    /*
     * ⚠️ The headline of G3. The live API refuses a *sent* 0 but accepts a
     * body without a price (measured), so a rename must stay a rename.
     */
    const bodies = captureBodies('patch', '/admin/gifts/gift-heart_icon')
    const user = renderScreen()
    await openMenu(user, 'Heart Icon')
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit gift' })

    expect(within(dialog).getByText(/This gift is free/)).toBeInTheDocument()
    const name = within(dialog).getByLabelText(/^Name/)
    await user.clear(name)
    await user.type(name, 'Big Heart')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await screen.findByText('Gift updated.')
    expect(bodies).toEqual([{ name: 'Big Heart' }])
    expect(
      mockGifts().find((gift) => gift.id === 'gift-heart_icon')?.priceDiamonds,
    ).toBe(0)
  })

  it('refuses a new price of 0 without sending anything', async () => {
    const bodies = captureBodies('patch', '/admin/gifts/gift-heart_icon')
    const user = renderScreen()
    await openMenu(user, 'Heart Icon')
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit gift' })

    const price = within(dialog).getByLabelText(/^Price in diamonds/)
    await user.clear(price)
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await within(dialog).findByText(/Leave it at 0/)).toBeInTheDocument()
    expect(bodies).toEqual([])
  })

  it('re-prices it when given a real price, spelled back with separators', async () => {
    const user = renderScreen()
    await openMenu(user, 'Heart Icon')
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit gift' })

    const price = within(dialog).getByLabelText(/^Price in diamonds/)
    await user.clear(price)
    await user.type(price, '25000')
    expect(within(dialog).getByText(/25,000 diamonds per gift/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(
        mockGifts().find((gift) => gift.id === 'gift-heart_icon')?.priceDiamonds,
      ).toBe(25000),
    )
  })

  it('says the category is gone when it was removed underneath the operator', async () => {
    const user = renderScreen()
    await openMenu(user, 'Heart Icon')
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit gift' })

    await user.click(within(dialog).getByRole('combobox', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'Super Stage FX' }))
    /* Gone server-side after the form was opened. */
    const categories = mockGiftCategories() as unknown as { id: string }[]
    categories.splice(
      categories.findIndex((category) => category.id === 'cat_fx'),
      1,
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(
      await within(dialog).findByText(
        'That category no longer exists. Choose another.',
      ),
    ).toBeInTheDocument()
  })
})

describe('switching things off', () => {
  it('deactivates a gift and keeps it listed', async () => {
    const user = renderScreen()
    await openMenu(user, 'Rose Bouquet')
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate' }))
    const dialog = await screen.findByRole('dialog', { name: /Deactivate this gift/ })
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate gift' }))

    await screen.findByText('Rose Bouquet deactivated.')
    expect(mockGifts().find((gift) => gift.name === 'Rose Bouquet')?.isActive).toBe(
      false,
    )
    expect(screen.getByText('Rose Bouquet')).toBeInTheDocument()
  })

  it('reactivates through PATCH isActive, there being no restore route', async () => {
    ;(mockGifts()[1] as { isActive: boolean }).isActive = false
    const bodies = captureBodies('patch', '/admin/gifts/gift-rose_bouquet')

    const user = renderScreen()
    await openMenu(user, 'Rose Bouquet')
    await user.click(await screen.findByRole('menuitem', { name: 'Reactivate' }))
    const dialog = await screen.findByRole('dialog', { name: /Reactivate this gift/ })
    await user.click(within(dialog).getByRole('button', { name: 'Reactivate gift' }))

    await screen.findByText('Rose Bouquet reactivated.')
    expect(bodies).toEqual([{ isActive: true }])
  })

  it('warns that deactivating a category hides its active gifts too', async () => {
    /* Measured 2026-10-28 against `GET /gifts/catalog`. */
    const user = renderScreen()
    await openMenu(user, 'Popular Gifts')
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate' }))
    const dialog = await screen.findByRole('dialog', {
      name: /Deactivate this category/,
    })

    expect(
      within(dialog).getByText(/including gifts that are still marked Active/),
    ).toBeInTheDocument()
  })
})

describe('categories', () => {
  it('cannot be created before the list has loaded', async () => {
    /*
     * ⚠️ A new category is appended after the last one. Before the list
     * arrives there is no last one, and it would land at 0 — on top. Found by
     * this suite racing the session against the catalog.
     */
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(`${API_PREFIX}/admin/gifts/categories`, async () => {
        await held
        await delay(0)
        return HttpResponse.json({ success: true, data: [] })
      }),
    )

    renderScreen()
    const button = await screen.findByRole('button', { name: 'New category' })
    expect(button).toBeDisabled()
    release()
    await waitFor(() => expect(button).toBeEnabled())
  })

  it('creates one at the end of the list', async () => {
    const user = renderScreen()
    await clickWhenEnabled(user, 'New category')
    const dialog = await screen.findByRole('dialog', { name: 'New category' })
    await user.type(within(dialog).getByLabelText(/^Name/), 'Seasonal')
    await user.click(within(dialog).getByRole('button', { name: 'Create category' }))

    await screen.findByText('Category created.')
    /* After the retired set at 99. */
    expect(mockGiftCategories().find((row) => row.name === 'Seasonal')?.sortOrder).toBe(
      100,
    )
  })

  it('refuses a one-letter name, as the server does', async () => {
    const user = renderScreen()
    await clickWhenEnabled(user, 'New category')
    const dialog = await screen.findByRole('dialog', { name: 'New category' })
    await user.type(within(dialog).getByLabelText(/^Name/), 'S')
    await user.click(within(dialog).getByRole('button', { name: 'Create category' }))

    expect(
      await within(dialog).findByText('Category name must be at least 2 characters'),
    ).toBeInTheDocument()
  })

  it('renames one', async () => {
    const user = renderScreen()
    await openMenu(user, 'Popular Gifts')
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename category' })
    const name = within(dialog).getByLabelText(/^Name/)
    await user.clear(name)
    await user.type(name, 'Favourites')
    await user.click(within(dialog).getByRole('button', { name: 'Save name' }))

    await screen.findByText('Category renamed.')
    expect(mockGiftCategories().find((row) => row.id === 'cat_popular')?.name).toBe(
      'Favourites',
    )
  })

  it('opens a new gift in the category it was added from', async () => {
    const user = renderScreen()
    await openMenu(user, 'Super Stage FX')
    await user.click(await screen.findByRole('menuitem', { name: 'Add a gift here' }))
    const dialog = await screen.findByRole('dialog', { name: 'New gift' })
    expect(
      within(dialog).getByRole('combobox', { name: /Category/ }),
    ).toHaveTextContent('Super Stage FX')
  })
})

describe('who may write', () => {
  it('gives an ADMIN no create button and no row actions', async () => {
    let resolved = false
    server.events.on('response:mocked', ({ request }) => {
      if (request.url.includes('/admin/auth/me')) resolved = true
    })

    signInMockAdmin('ADMIN')
    renderScreen()
    await screen.findByText('Popular Gifts')
    await waitFor(() => expect(resolved).toBe(true))

    expect(screen.queryByRole('button', { name: 'New gift' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New category' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Actions for / })).toBeNull()
  })
})
