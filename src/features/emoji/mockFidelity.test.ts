import { beforeEach, describe, expect, it } from 'vitest'

import {
  createEmoji,
  createEmojisBulk,
  deactivateEmoji,
  fetchEmojiPacks,
  updateEmoji,
  updateEmojiPack,
} from '@/api/catalog'
import { isAppError } from '@/api/errors'
import { setSession } from '@/auth/tokenStore'
import { mockEmojis, resetMockCatalog } from '@/mocks/handlers/catalog'

/**
 * The emoji mock against what the live API did on 2026-10-28 — phase G4.
 *
 * ⚠️ Every case here was observed on `test-api.callschat.com` first, on the
 * inactive probe pack. Two of them contradicted the G1 mock: the bulk route
 * answered a duplicate with a 409 there and a silent skip live, and an
 * omitted `type` defaulted to ANIMATED there and STATIC live.
 */

const PACK = 'pack_animated_expressions'

async function failure(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    return isAppError(error) ? { status: error.status, message: error.message } : null
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

describe('the bulk route', () => {
  it('skips a duplicate silently and counts only what it created', async () => {
    /* Live: two sent, one taken → `201 {count: 1}`. */
    const count = await createEmojisBulk(PACK, [
      { name: 'New', shortcode: ':brand_new:', fileUrl: '/n.json' },
      { name: 'Dup', shortcode: ':blushing:', fileUrl: '/d.json' },
    ])
    expect(count).toBe(1)
    expect(
      mockEmojis().filter((emoji) => emoji.shortcode === ':blushing:'),
    ).toHaveLength(1)
  })

  it('refuses an empty batch, in the live wording', async () => {
    const result = await failure(() => createEmojisBulk(PACK, []))
    expect(result?.message).toContain('At least one emoji must be provided')
  })

  it('stores an omitted type as STATIC at sortOrder 0', async () => {
    await createEmojisBulk(PACK, [
      { name: 'X', shortcode: ':x_x:', fileUrl: '/x.json' },
    ])
    const created = mockEmojis().find((emoji) => emoji.shortcode === ':x_x:')
    expect(created?.type).toBe('STATIC')
    expect(created?.sortOrder).toBe(0)
  })
})

describe('shortcodes', () => {
  it('are unique across packs, on single create', async () => {
    const result = await failure(() =>
      createEmoji({
        packId: 'pack_premium_empty',
        name: 'Elsewhere',
        shortcode: ':blushing:',
        fileUrl: '/b.json',
      }),
    )
    expect(result?.status).toBe(409)
    expect(result?.message).toBe('A record with this unknown field already exists.')
  })

  it('stay taken after their emoji is deactivated', async () => {
    await deactivateEmoji('emoji_blushing')
    const result = await failure(() =>
      createEmoji({
        packId: PACK,
        name: 'Again',
        shortcode: ':blushing:',
        fileUrl: '/b.json',
      }),
    )
    expect(result?.status).toBe(409)
  })

  it('cannot be renamed onto another emoji’s', async () => {
    const result = await failure(() =>
      updateEmoji('emoji_heart_eyes', { shortcode: ':blushing:' }),
    )
    expect(result?.status).toBe(409)
  })

  it('may be kept by the emoji that holds it', async () => {
    await expect(
      updateEmoji('emoji_blushing', { shortcode: ':blushing:' }),
    ).resolves.toBeUndefined()
  })
})

describe('single create and edit', () => {
  it('stores an omitted type as STATIC at 0 here too', async () => {
    await createEmoji({
      packId: PACK,
      name: 'Y',
      shortcode: ':y_y:',
      fileUrl: '/y.json',
    })
    const created = mockEmojis().find((emoji) => emoji.shortcode === ':y_y:')
    expect(created?.type).toBe('STATIC')
    expect(created?.sortOrder).toBe(0)
  })

  it('refuses a type outside STATIC | ANIMATED', async () => {
    const result = await failure(() =>
      updateEmoji('emoji_blushing', { type: 'GIF' as 'STATIC' }),
    )
    expect(result?.message).toContain("Expected 'STATIC' | 'ANIMATED'")
  })

  it('changes the type on PATCH', async () => {
    await updateEmoji('emoji_blushing', { type: 'STATIC' })
    expect(mockEmojis().find((emoji) => emoji.id === 'emoji_blushing')?.type).toBe(
      'STATIC',
    )
  })
})

describe('packs', () => {
  it.each([
    ['one character', 'A', 'Pack name must be at least 2 characters'],
    ['101 characters', 'P'.repeat(101), 'at most 100 character(s)'],
  ])('refuse a name of %s', async (_, name, message) => {
    const result = await failure(() => updateEmojiPack(PACK, { name }))
    expect(result?.message).toContain(message)
  })

  it('list inactive emojis, which the shortcode check depends on', async () => {
    await deactivateEmoji('emoji_blushing')
    const packs = await fetchEmojiPacks()
    const blushing = packs
      .find((pack) => pack.id === PACK)
      ?.emojis?.find((emoji) => emoji.id === 'emoji_blushing')
    expect(blushing?.isActive).toBe(false)
  })
})
