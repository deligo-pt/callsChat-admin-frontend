import { beforeEach, describe, expect, it } from 'vitest'

import {
  createEmoji,
  createEmojisBulk,
  createGift,
  createGiftCategory,
  deactivateGift,
  fetchCatalogVersion,
  fetchEmojiPacks,
  fetchGiftCategories,
  fetchGiftTransactions,
  fetchGifts,
  reorderGifts,
  requestUploadUrl,
  updateGift,
} from '@/api/catalog'
import { isAppError } from '@/api/errors'
import { setSession } from '@/auth/tokenStore'
import {
  emptyMockCatalog,
  mockCatalogVersions,
  mockGifts,
  resetMockCatalog,
} from '@/mocks/handlers/catalog'

/**
 * Does the mock behave like the backend that was measured? — phase G1.
 *
 * ⚠️ Every assertion is pinned to a response observed on
 * `test-api.callschat.com` on 2026-10-28, **including the defects**. A mock
 * that is better behaved than the server hides the reason the client has
 * guards.
 */

async function failure(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    return isAppError(error) ? error.message : String(error)
  }
  throw new Error('expected the call to fail, and it did not')
}

beforeEach(() => {
  resetMockCatalog()
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the shapes the server actually sends', () => {
  it('nests gifts inside their category', async () => {
    /* ⚠️ The category list is also the gift list — measured. */
    const categories = await fetchGiftCategories()
    const popular = categories.find((c) => c.id === 'cat_popular')
    expect(popular?.gifts?.length).toBeGreaterThan(0)
  })

  it('lists inactive categories, because the admin list is not the storefront', async () => {
    const categories = await fetchGiftCategories()
    expect(categories.some((c) => c.isActive === false)).toBe(true)
  })

  it('nests emojis inside their pack', async () => {
    const packs = await fetchEmojiPacks()
    expect(packs[0]?.emojis?.length).toBeGreaterThan(0)
  })

  it('paginates the ledger and nothing else', async () => {
    const page = await fetchGiftTransactions({ limit: 5 })
    expect(page.pagination.total).toBe(22)
    expect(page.data).toHaveLength(5)
  })
})

describe('the catalog is priced below its own validator', () => {
  it('serves gifts at zero', async () => {
    /*
     * ⚠️ All 8 live gifts are `priceDiamonds: 0` (plan.md O1). The READ schema
     * must not enforce the write rule, or it would reject the entire live
     * catalog.
     */
    const gifts = await fetchGifts()
    expect(gifts.some((g) => g.priceDiamonds === 0)).toBe(true)
  })

  it('refuses to save a gift at zero, in the update wording', async () => {
    expect(
      await failure(() => updateGift('gift-teddy_bear', { priceDiamonds: 0 })),
    ).toBe('body/priceDiamonds Number must be greater than 0')
  })

  it('refuses to create one at zero, in the OTHER wording', async () => {
    /* ⚠️ Same rule, two messages. Each is reused where it belongs. */
    const message = await failure(() =>
      createGift({
        categoryId: 'cat_popular',
        name: 'Free',
        iconUrl: '/x.json',
        animationUrl: '/x.json',
        priceDiamonds: 0,
      }),
    )
    expect(message).toBe('body/priceDiamonds Gift price must be at least 1 diamond')
  })

  it('means every stored gift is unsaveable at its current price', async () => {
    /*
     * ⚠️ The consequence an operator meets: editing a gift's NAME forces a
     * price change, because the stored price cannot be sent back.
     */
    const stored = mockGifts().find((g) => g.id === 'gift-teddy_bear')!
    expect(stored.priceDiamonds).toBe(0)
    expect(
      await failure(() =>
        updateGift(stored.id, { name: 'Renamed', priceDiamonds: stored.priceDiamonds }),
      ),
    ).toContain('greater than 0')
  })
})

describe('ignored query parameters are reproduced as ignored', () => {
  it('ignores ?isActive on gifts, exactly as the server does', async () => {
    /*
     * ⚠️ The live route answers `isActive=false` with eight ACTIVE rows
     * (plan.md O3). A mock that filtered would let a dead control pass its
     * test and do nothing in production.
     */
    const all = await fetchGifts()
    const { apiClient } = await import('@/api/client')
    const raw = await apiClient.get<{ data: unknown[] }>('/admin/gifts', {
      params: { isActive: false },
      resource: 'probe',
    })
    expect(raw.data).toHaveLength(all.length)
  })

  it('answers an unknown categoryId with an empty list, not an error', async () => {
    expect(await fetchGifts('GARBAGE')).toEqual([])
  })

  it('applies senderId and receiverId, which DO work', async () => {
    const all = await fetchGiftTransactions({ limit: 100 })
    const sent = await fetchGiftTransactions({
      limit: 100,
      senderId: 'cmv6ekev300t901o5lz8yjf49',
    })
    expect(sent.pagination.total).toBeGreaterThan(0)
    expect(sent.pagination.total).toBeLessThan(all.pagination.total)
  })

  it('accepts limit=0 and page=0 without complaint', async () => {
    /*
     * ⚠️ No bounds checking at all, unlike every other list on this backend
     * (plan.md O5). Reproduced so the client's own clamp has something to be
     * tested against.
     */
    await expect(fetchGiftTransactions({ limit: 0 })).resolves.toBeDefined()
    await expect(fetchGiftTransactions({ page: 0 })).resolves.toBeDefined()
  })
})

describe('the ledger records what was sent, not what exists now', () => {
  it('carries a snapshot that differs from the live gift', async () => {
    /*
     * ⚠️ The fixture's snapshot name deliberately differs from the catalog
     * record's. A row rendering "Chocolate Box" instead of
     * "Chocolate Box (as sent)" is reading the live gift — which means
     * renaming a gift rewrites financial history.
     */
    const page = await fetchGiftTransactions({ limit: 1 })
    const row = page.data[0]!
    expect(row.snapshotName).toBe('Chocolate Box (as sent)')
    expect(row.gift?.name).toBe('Chocolate Box')
    expect(row.snapshotName).not.toBe(row.gift?.name)
  })

  it('reports zero earnings, because the catalog is free', async () => {
    const page = await fetchGiftTransactions({ limit: 22 })
    expect(page.data.every((r) => r.totalPrice === 0 && r.hostEarnings === 0)).toBe(
      true,
    )
  })
})

describe('soft delete, and the version bump', () => {
  it('deactivates rather than removing, and the row stays listed', async () => {
    await deactivateGift('gift-teddy_bear')
    const gifts = await fetchGifts()
    const row = gifts.find((g) => g.id === 'gift-teddy_bear')
    expect(row).toBeDefined()
    expect(row?.isActive).toBe(false)
  })

  it('is reversible', async () => {
    await deactivateGift('gift-teddy_bear')
    await updateGift('gift-teddy_bear', { isActive: true })
    const gifts = await fetchGifts()
    expect(gifts.find((g) => g.id === 'gift-teddy_bear')?.isActive).toBe(true)
  })

  it('bumps the catalog version on every write', async () => {
    /* ⚠️ Measured live: gift 3 → 11 across one session of probes. */
    const before = (await fetchCatalogVersion()).giftVersion
    await createGiftCategory({ name: 'Probe Set' })
    expect((await fetchCatalogVersion()).giftVersion).toBe(before + 1)
    expect(mockCatalogVersions().gift).toBe(before + 1)
  })
})

describe('reordering', () => {
  it('refuses an empty batch', async () => {
    expect(await failure(() => reorderGifts({ items: [] }))).toBe(
      'body/items At least one item must be supplied for reordering',
    )
  })

  it('applies a batch of id and sortOrder', async () => {
    await reorderGifts({ items: [{ id: 'gift-teddy_bear', sortOrder: 50 }] })
    expect(mockGifts().find((g) => g.id === 'gift-teddy_bear')?.sortOrder).toBe(50)
  })
})

describe('emoji shortcodes', () => {
  it('enforces the :name: format', async () => {
    const message = await failure(() =>
      createEmoji({
        packId: 'pack_animated_expressions',
        name: 'Bad',
        shortcode: 'plain_text',
        fileUrl: '/x.json',
      }),
    )
    expect(message).toContain('must be in format :name:')
  })

  it('refuses a duplicate with the backend’s own broken message', async () => {
    /*
     * ⚠️ *"A record with this unknown field already exists."* — "unknown" is
     * literal; the field name never resolves (plan.md O4). Reproduced so the
     * client's re-wording has something real to catch.
     */
    const message = await failure(() =>
      createEmoji({
        packId: 'pack_animated_expressions',
        name: 'Dup',
        shortcode: ':blushing:',
        fileUrl: '/x.json',
      }),
    )
    expect(message).toBe('A record with this unknown field already exists.')
  })

  it('answers a bulk upload with a count and nothing else', async () => {
    await expect(
      createEmojisBulk('pack_animated_expressions', [
        { name: 'A', shortcode: ':probe_a:', fileUrl: '/a.json' },
        { name: 'B', shortcode: ':probe_b:', fileUrl: '/b.json' },
      ]),
    ).resolves.toBe(2)

    const packs = await fetchEmojiPacks()
    const pack = packs.find((p) => p.id === 'pack_animated_expressions')
    expect(pack?.emojis?.some((e) => e.shortcode === ':probe_a:')).toBe(true)
  })
})

describe('the upload handshake', () => {
  it('validates MIME per folder, with the service’s own wording', async () => {
    const message = await failure(() =>
      requestUploadUrl({
        filename: 'x.exe',
        mimetype: 'application/x-msdownload',
        folder: 'gifts',
      }),
    )
    expect(message).toContain("Invalid MIME type 'application/x-msdownload'")
    expect(message).toContain(
      'Allowed: image/png, image/webp, application/json, video/mp4',
    )
  })

  it('refuses jpeg for gifts and accepts it for packs', async () => {
    /* ⚠️ The allowed set differs per partition — measured. */
    expect(
      await failure(() =>
        requestUploadUrl({
          filename: 'c.jpg',
          mimetype: 'image/jpeg',
          folder: 'gifts',
        }),
      ),
    ).toContain('Invalid MIME type')

    await expect(
      requestUploadUrl({ filename: 'c.jpg', mimetype: 'image/jpeg', folder: 'packs' }),
    ).resolves.toMatchObject({ fileKey: expect.stringContaining('catalog/packs/') })
  })

  it('validates the folder enum', async () => {
    const message = await failure(() =>
      requestUploadUrl({
        filename: 'x.png',
        mimetype: 'image/png',
        folder: 'GARBAGE' as never,
      }),
    )
    expect(message).toContain("Expected 'emojis' | 'gifts' | 'packs'")
  })

  it('returns an ABSOLUTE url, while stored records are relative', async () => {
    /* ⚠️ Two URL shapes in one system (plan.md O10). */
    const target = await requestUploadUrl({
      filename: 'x.png',
      mimetype: 'image/png',
      folder: 'gifts',
    })
    expect(target.fileUrl).toMatch(/^https:\/\//)

    const gifts = await fetchGifts()
    expect(gifts[0]?.iconUrl).toMatch(/^\/api\/v1\//)
  })
})

describe('a fresh deployment', () => {
  it('shows empty lists rather than failing', async () => {
    emptyMockCatalog()
    expect(await fetchGiftCategories()).toEqual([])
    expect(await fetchEmojiPacks()).toEqual([])
    expect((await fetchGiftTransactions({})).pagination.total).toBe(0)
  })
})
