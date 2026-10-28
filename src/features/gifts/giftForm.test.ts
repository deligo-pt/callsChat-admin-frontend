import { describe, expect, it } from 'vitest'

import type { Gift } from '@/types/catalog'

import {
  buildCreateGiftPayload,
  buildUpdateGiftPayload,
  categoryFormSchema,
  checkGiftFile,
  giftFormSchema,
  MAX_GIFT_FILE_BYTES,
  nextSortOrder,
  toGiftFormValues,
} from './giftForm'

/**
 * The gift editor's contract — phase G3. Every rule below was measured live
 * on 2026-10-28; the fixture is the live Heart Icon, at 0 diamonds.
 */

const heart: Gift = {
  id: 'gift-heart_icon',
  categoryId: 'cat_popular',
  name: 'Heart Icon',
  iconUrl: '/api/v1/media/download/catalog/gifts/heart_icon.json',
  animationUrl: '/api/v1/media/download/catalog/gifts/heart_icon.json',
  animationType: 'LOTTIE',
  priceDiamonds: 0,
  sortOrder: 0,
  isActive: true,
}

const LOTTIE = JSON.stringify({
  v: '5.7.4',
  w: 10,
  h: 10,
  fr: 30,
  ip: 0,
  op: 30,
  layers: [],
})

function file(name: string, body: string, type: string) {
  return new File([body], name, { type })
}

describe('the price, on create', () => {
  const schema = giftFormSchema(null)
  const base = { name: 'Rose', categoryId: 'cat_popular' }

  it.each([
    ['empty', ''],
    ['zero', '0'],
    ['a decimal', '1.5'],
    ['negative', '-3'],
    ['words', 'ten'],
  ])('refuses %s', (_, priceDiamonds) => {
    expect(schema.safeParse({ ...base, priceDiamonds }).success).toBe(false)
  })

  it('accepts a whole number of at least 1', () => {
    expect(schema.safeParse({ ...base, priceDiamonds: '1' }).success).toBe(true)
  })
})

describe('the price, on edit — the 0 that cannot be saved', () => {
  const schema = giftFormSchema(0)
  const values = toGiftFormValues(heart)

  it('accepts the unchanged 0, because it will not be sent', () => {
    /*
     * ⚠️ **The plan assumed the opposite** (O1): that every edit of a free
     * gift forced a re-price. Measured: `PATCH {"name": …}` on a 0-priced
     * gift succeeds. Only a *sent* 0 is refused.
     */
    expect(schema.safeParse(values).success).toBe(true)
  })

  it('refuses a new price of 0, written differently', () => {
    expect(schema.safeParse({ ...values, priceDiamonds: '00' }).success).toBe(false)
  })

  it('says how to keep the current price', () => {
    const result = schema.safeParse({ ...values, priceDiamonds: '' })
    expect(result.error?.issues[0]?.message).toMatch(/Leave it at 0/)
  })
})

describe('names', () => {
  it('caps a gift name at 100, as the server does', () => {
    const schema = giftFormSchema(null)
    const base = { categoryId: 'c', priceDiamonds: '5' }
    expect(schema.safeParse({ ...base, name: 'N'.repeat(100) }).success).toBe(true)
    expect(schema.safeParse({ ...base, name: 'N'.repeat(101) }).success).toBe(false)
    expect(schema.safeParse({ ...base, name: '   ' }).success).toBe(false)
  })

  it('holds a category name to 2–100', () => {
    expect(categoryFormSchema.safeParse({ name: 'A' }).success).toBe(false)
    expect(categoryFormSchema.safeParse({ name: 'AB' }).success).toBe(true)
    expect(categoryFormSchema.safeParse({ name: 'C'.repeat(101) }).success).toBe(false)
  })
})

describe('what an edit sends', () => {
  it('sends only the name when only the name changed — even on a free gift', () => {
    const payload = buildUpdateGiftPayload(
      { ...toGiftFormValues(heart), name: 'Heart' },
      heart,
      null,
    )
    expect(payload).toEqual({ name: 'Heart' })
    expect(payload).not.toHaveProperty('priceDiamonds')
  })

  it('sends nothing when nothing changed', () => {
    expect(buildUpdateGiftPayload(toGiftFormValues(heart), heart, null)).toEqual({})
  })

  it('sends a changed price and category as numbers and ids', () => {
    expect(
      buildUpdateGiftPayload(
        { name: 'Heart Icon', categoryId: 'cat_fx', priceDiamonds: '25' },
        heart,
        null,
      ),
    ).toEqual({ categoryId: 'cat_fx', priceDiamonds: 25 })
  })

  it('writes a new file into icon and animation alike, with its type', () => {
    const asset = {
      fileUrl: 'https://media.callschat.com/x.webp',
      animationType: 'WEBP' as const,
    }
    expect(buildUpdateGiftPayload(toGiftFormValues(heart), heart, asset)).toEqual({
      iconUrl: asset.fileUrl,
      animationUrl: asset.fileUrl,
      animationType: 'WEBP',
    })
  })
})

describe('what a create sends', () => {
  it('fills both URLs from one upload, as every live gift does', () => {
    const payload = buildCreateGiftPayload(
      { name: ' Rose ', categoryId: 'cat_popular', priceDiamonds: '10' },
      { fileUrl: 'https://media.callschat.com/rose.json', animationType: 'LOTTIE' },
      3,
    )
    expect(payload).toEqual({
      categoryId: 'cat_popular',
      name: 'Rose',
      priceDiamonds: 10,
      iconUrl: 'https://media.callschat.com/rose.json',
      animationUrl: 'https://media.callschat.com/rose.json',
      animationType: 'LOTTIE',
      sortOrder: 3,
    })
  })

  it('appends after the highest sortOrder, not after the count', () => {
    /* The live probe category sits at 50 with siblings at 0. */
    expect(
      nextSortOrder([
        { id: 'a', sortOrder: 0 },
        { id: 'b', sortOrder: 50 },
      ]),
    ).toBe(51)
    expect(nextSortOrder([])).toBe(0)
  })
})

describe('the animation file', () => {
  it.each([
    ['a Lottie', 'rose.json', LOTTIE, 'application/json', 'LOTTIE'],
    ['a WebP', 'rose.webp', 'RIFF', 'image/webp', 'WEBP'],
    ['an MP4', 'rose.mp4', 'mp4', 'video/mp4', 'MP4'],
  ])('accepts %s as %s', async (_, name, body, type, expected) => {
    const verdict = await checkGiftFile(file(name, body, type))
    expect(verdict.ok && verdict.animationType).toBe(expected)
  })

  it('resolves a typeless .json by its extension, and reports the type to send', async () => {
    const verdict = await checkGiftFile(file('rose.json', LOTTIE, ''))
    expect(verdict.ok && verdict.mimetype).toBe('application/json')
  })

  it('refuses PNG, which storage accepts and the gift record cannot describe', async () => {
    const verdict = await checkGiftFile(file('rose.png', 'png', 'image/png'))
    expect(verdict.ok).toBe(false)
    expect(!verdict.ok && verdict.message).toMatch(/WebP/)
  })

  it('refuses JSON that is not a Lottie animation, before uploading it', async () => {
    const verdict = await checkGiftFile(
      file('rose.json', '{"hello":1}', 'application/json'),
    )
    expect(verdict.ok).toBe(false)
  })

  it('refuses anything else by name', async () => {
    const verdict = await checkGiftFile(
      file('rose.exe', 'MZ', 'application/x-msdownload'),
    )
    expect(!verdict.ok && verdict.message).toMatch(/rose\.exe/)
  })

  it('refuses a file over 10 MB', async () => {
    const big = file('rose.mp4', 'x', 'video/mp4')
    Object.defineProperty(big, 'size', { value: MAX_GIFT_FILE_BYTES + 1 })
    expect((await checkGiftFile(big)).ok).toBe(false)
  })
})
