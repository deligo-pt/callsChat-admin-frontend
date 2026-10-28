import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { beforeEach, describe, expect, it } from 'vitest'

import { ROUTES } from '@/app/routes'
import { AuthProvider } from '@/auth/AuthProvider'
import { PERMISSIONS } from '@/auth/permissions'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NAV_SECTIONS } from '@/layouts/navigation'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import {
  mockEmojiPacks,
  mockEmojis,
  mockStorageUploads,
  resetMockCatalog,
} from '@/mocks/handlers/catalog'
import { API_PREFIX } from '@/mocks/handlers/shared'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { EmojiPacksPage } from './EmojiPacksPage'

/**
 * Emoji packs — phase G4.
 *
 * ⚠️ As in G3, the storage PUT is answered by the mock and recorded; these
 * tests prove what the panel sends, not that storage accepts it (plan.md O13).
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
const lottie = (name: string) => new File([LOTTIE], name, { type: 'application/json' })

type User = ReturnType<typeof userEvent.setup>

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/emoji-packs', element: <EmojiPacksPage /> }],
    {
      initialEntries: ['/emoji-packs'],
    },
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

function captureBodies(method: string, path: string) {
  const bodies: unknown[] = []
  server.events.on('request:start', ({ request }) => {
    if (
      request.method === method &&
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

async function menu(user: User, owner: string, item: string) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${owner}` }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
}

function emojiNames(pack: string) {
  const list = screen.getByRole('list', { name: `Emojis in ${pack}` })
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.font-medium')?.textContent)
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

describe('where it lives', () => {
  it('is in Platform, beside Announcements, and Super-Admin-only', () => {
    /* plan.md §3.4: no price, so not Diamonds. §3.1: `gifts.configure`. */
    const platform = NAV_SECTIONS.find((section) => section.id === 'platform')
    const item = platform?.items.find((entry) => entry.to === ROUTES.emojiPacks)
    expect(ROUTES.emojiPacks).toBe('/emoji-packs')
    expect(item?.permission).toBe(PERMISSIONS.giftsConfigure)
    const diamonds = NAV_SECTIONS.find((section) => section.id === 'diamonds')
    expect(diamonds?.items.some((entry) => entry.to === ROUTES.emojiPacks)).toBe(false)
  })
})

describe('reading', () => {
  it('lists packs with their emojis, shortcodes and flags', async () => {
    renderScreen()
    await screen.findByRole('heading', { name: 'Official Emojis' })
    expect(emojiNames('Official Emojis')).toEqual([
      'Blushing',
      'Cool Sunglasses',
      'Heart Eyes',
      'Loudly Crying',
    ])
    expect(screen.getByText(':heart_eyes:')).toBeInTheDocument()
    expect(screen.getByText('Premium')).toBeInTheDocument()
    expect(screen.getByText('No emojis in this pack yet.')).toBeInTheDocument()
  })

  it('reorders an emoji with the measured batch', async () => {
    const bodies = captureBodies('PATCH', '/admin/emoji/emojis/reorder')
    const user = renderScreen()
    await user.click(await screen.findByRole('button', { name: 'Move Heart Eyes up' }))
    await waitFor(() =>
      expect(bodies).toEqual([
        {
          items: [
            { id: 'emoji_heart_eyes', sortOrder: 1 },
            { id: 'emoji_cool_sunglasses', sortOrder: 2 },
          ],
        },
      ]),
    )
  })
})

describe('adding one emoji', () => {
  it('uploads to the emojis folder and saves ANIMATED, appended — never the server defaults', async () => {
    /* ⚠️ Omitted, the server stores STATIC at sortOrder 0 (measured). */
    const user = renderScreen()
    await menu(user, 'Official Emojis', 'Add an emoji')
    const dialog = await screen.findByRole('dialog', { name: 'Add an emoji' })
    await user.upload(
      within(dialog).getByLabelText('Emoji file'),
      lottie('party_face.json'),
    )

    /* Name and shortcode suggested from the file. */
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/^Shortcode/)).toHaveValue(':party_face:'),
    )
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Party Face')

    await user.click(within(dialog).getByRole('button', { name: 'Add emoji' }))
    await screen.findByText('Emoji added.')

    const created = mockEmojis().find((emoji) => emoji.shortcode === ':party_face:')
    expect(created?.type).toBe('ANIMATED')
    expect(created?.sortOrder).toBe(4)
    expect(mockStorageUploads()[0]?.url).toContain('/catalog/emojis/')
  })

  it('names the owner of a taken shortcode before sending anything — inactive owners too', async () => {
    const owner = mockEmojis().find((emoji) => emoji.id === 'emoji_blushing') as {
      isActive: boolean
    }
    owner.isActive = false
    const bodies = captureBodies('POST', '/admin/emoji/emojis')

    const user = renderScreen()
    await menu(user, '[TEST] Premium Empty', 'Add an emoji')
    const dialog = await screen.findByRole('dialog', { name: 'Add an emoji' })
    await user.upload(
      within(dialog).getByLabelText('Emoji file'),
      lottie('blushing.json'),
    )
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/^Shortcode/)).toHaveValue(':blushing:'),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Add emoji' }))

    expect(
      await within(dialog).findByText(
        /Already used by Blushing in Official Emojis, which is inactive/,
      ),
    ).toBeInTheDocument()
    expect(bodies).toEqual([])
    expect(mockStorageUploads()).toHaveLength(0)
  })

  it('re-words the server’s “unknown field” when the shortcode was taken meanwhile', async () => {
    server.use(
      http.post(`${API_PREFIX}/admin/emoji/emojis`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'RECORD_ALREADY_EXISTS',
              message: 'A record with this unknown field already exists.',
            },
          },
          { status: 409 },
        ),
      ),
    )
    const user = renderScreen()
    await menu(user, 'Official Emojis', 'Add an emoji')
    const dialog = await screen.findByRole('dialog', { name: 'Add an emoji' })
    await user.upload(
      within(dialog).getByLabelText('Emoji file'),
      lottie('party_face.json'),
    )
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/^Shortcode/)).toHaveValue(':party_face:'),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Add emoji' }))

    expect(await within(dialog).findByText(/possibly just now/)).toBeInTheDocument()
    expect(screen.queryByText(/unknown field/)).toBeNull()

    /* A retry with a new shortcode reuses the upload. */
    server.resetHandlers()
    const shortcode = within(dialog).getByLabelText(/^Shortcode/)
    await user.clear(shortcode)
    await user.type(shortcode, ':party_face_2:')
    await user.click(within(dialog).getByRole('button', { name: 'Add emoji' }))
    await screen.findByText('Emoji added.')
    expect(mockStorageUploads()).toHaveLength(1)
  })

  it('edits only what changed', async () => {
    const bodies = captureBodies('PATCH', '/admin/emoji/emojis/emoji_heart_eyes')
    const user = renderScreen()
    await menu(user, 'Heart Eyes', 'Edit')
    const dialog = await screen.findByRole('dialog', { name: 'Edit emoji' })
    const shortcode = within(dialog).getByLabelText(/^Shortcode/)
    await user.clear(shortcode)
    await user.type(shortcode, ':heart_eyes_2:')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(bodies).toEqual([{ shortcode: ':heart_eyes_2:' }]))
  })
})

describe('adding several', () => {
  async function openBulk(user: User) {
    await menu(user, 'Official Emojis', 'Add several')
    return screen.findByRole('dialog', { name: 'Add several emojis' })
  }

  it('sends type and an appended sortOrder for every row', async () => {
    const bodies = captureBodies('POST', '/admin/emoji/emojis/bulk')
    const user = renderScreen()
    const dialog = await openBulk(user)
    await user.upload(within(dialog).getByLabelText('Emoji files'), [
      lottie('party_face.json'),
      lottie('sleepy.json'),
    ])
    await user.click(
      await within(dialog).findByRole('button', { name: 'Add 2 emojis' }),
    )

    await screen.findByText('2 emojis added.')
    expect(bodies).toEqual([
      {
        packId: 'pack_animated_expressions',
        emojis: [
          expect.objectContaining({
            shortcode: ':party_face:',
            type: 'ANIMATED',
            sortOrder: 4,
          }),
          expect.objectContaining({
            shortcode: ':sleepy:',
            type: 'ANIMATED',
            sortOrder: 5,
          }),
        ],
      },
    ])
    expect(mockStorageUploads()).toHaveLength(2)
  })

  it('stops a batch with a taken or repeated shortcode before uploading', async () => {
    const user = renderScreen()
    const dialog = await openBulk(user)
    await user.upload(within(dialog).getByLabelText('Emoji files'), [
      lottie('blushing.json'),
      lottie('party.json'),
      lottie('party.json'),
    ])
    await user.click(
      await within(dialog).findByRole('button', { name: 'Add 3 emojis' }),
    )

    expect(
      await within(dialog).findByText(/Already used by Blushing/),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/Another file in this batch/)).toBeInTheDocument()
    expect(mockStorageUploads()).toHaveLength(0)
  })

  it('names what the server skipped silently, and does not upload it again', async () => {
    /*
     * ⚠️ The live behaviour, forced: a `201` with a count lower than what
     * was sent. Here the second row's shortcode is taken between the
     * pre-check and the request — the race the pre-check cannot close.
     */
    server.use(
      http.post(`${API_PREFIX}/admin/emoji/emojis/bulk`, async ({ request }) => {
        const body = (await request.json()) as {
          packId: string
          emojis: { name: string; shortcode: string; fileUrl: string }[]
        }
        const first = body.emojis[0]!
        ;(mockEmojis() as unknown as Record<string, unknown>[]).push({
          id: 'emoji_raced',
          packId: body.packId,
          ...first,
          type: 'ANIMATED',
          sortOrder: 4,
          isActive: true,
        })
        return HttpResponse.json({ success: true, data: { count: 1 } }, { status: 201 })
      }),
    )

    const user = renderScreen()
    const dialog = await openBulk(user)
    await user.upload(within(dialog).getByLabelText('Emoji files'), [
      lottie('party_face.json'),
      lottie('sleepy.json'),
    ])
    await user.click(
      await within(dialog).findByRole('button', { name: 'Add 2 emojis' }),
    )

    expect(await within(dialog).findByText(/1 of 2 added/)).toBeInTheDocument()
    const remaining = within(dialog).getByRole('list', { name: 'Emojis to add' })
    expect(within(remaining).getAllByRole('listitem')).toHaveLength(1)
    expect(within(remaining).getByText(/sleepy\.json/)).toBeInTheDocument()
    expect(within(remaining).getByText(/the server skipped it/)).toBeInTheDocument()

    /* Retrying the survivor does not re-send its bytes. */
    const shortcode = within(remaining).getByLabelText('Shortcode for sleepy.json')
    await user.clear(shortcode)
    await user.type(shortcode, ':sleepy_2:')
    server.resetHandlers()
    await user.click(within(dialog).getByRole('button', { name: 'Add 1 emoji' }))
    await screen.findByText('1 emoji added.')
    expect(mockStorageUploads()).toHaveLength(2)
  })
})

describe('packs', () => {
  it('creates one with a cover image, appended', async () => {
    /* sortOrder is sent rather than left to the server, whose default is unmeasured for packs. */
    const bodies = captureBodies('POST', '/admin/emoji/packs')
    const user = renderScreen()
    const button = await screen.findByRole('button', { name: 'New pack' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'New emoji pack' })
    await user.type(within(dialog).getByLabelText(/^Name/), 'Seasonal')
    await user.upload(
      within(dialog).getByLabelText('Cover file'),
      new File(['png'], 'cover.png', { type: 'image/png' }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Create pack' }))

    await screen.findByText('Pack created.')
    const created = mockEmojiPacks().find((pack) => pack.name === 'Seasonal')
    expect(created?.sortOrder).toBe(2)
    expect(bodies).toEqual([
      expect.objectContaining({ name: 'Seasonal', sortOrder: 2 }),
    ])
    expect(mockStorageUploads()[0]?.url).toContain('/catalog/packs/')
  })

  it('refuses a Lottie cover at the picker', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderScreen()
    const button = await screen.findByRole('button', { name: 'New pack' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'New emoji pack' })
    await user.upload(within(dialog).getByLabelText('Cover file'), lottie('cover.json'))
    expect(
      await within(dialog).findByText(/“cover\.json” is not a PNG, WebP or JPEG image/),
    ).toBeInTheDocument()
    expect(mockStorageUploads()).toHaveLength(0)
  })

  it('marks a pack premium without claiming it costs anything', async () => {
    const bodies = captureBodies(
      'PATCH',
      '/admin/emoji/packs/pack_animated_expressions',
    )
    const user = renderScreen()
    await menu(user, 'Official Emojis', 'Edit pack')
    const dialog = await screen.findByRole('dialog', { name: 'Edit pack' })
    expect(within(dialog).getByText(/It sets no price/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('switch', { name: 'Premium' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(bodies).toEqual([{ isPremium: true }]))
  })
})

describe('switching off', () => {
  it('warns a pack takes its active emojis with it', async () => {
    const user = renderScreen()
    await menu(user, 'Official Emojis', 'Deactivate')
    const dialog = await screen.findByRole('dialog', { name: /Deactivate this pack/ })
    expect(
      within(dialog).getByText(/including emojis still marked Active/),
    ).toBeInTheDocument()
  })

  it('warns an emoji keeps its shortcode, and deactivates it', async () => {
    const user = renderScreen()
    await menu(user, 'Heart Eyes', 'Deactivate')
    const dialog = await screen.findByRole('dialog', { name: /Deactivate this emoji/ })
    expect(within(dialog).getByText(/It keeps its shortcode/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate emoji' }))
    await waitFor(() =>
      expect(
        mockEmojis().find((emoji) => emoji.id === 'emoji_heart_eyes')?.isActive,
      ).toBe(false),
    )
  })
})
