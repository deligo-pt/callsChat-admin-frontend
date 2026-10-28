import { describe, expect, it } from 'vitest'

import type { Emoji, EmojiPack } from '@/types/catalog'

import {
  buildUpdateEmojiPayload,
  buildUpdatePackPayload,
  checkCatalogFile,
  describeOwner,
  emojiFormSchema,
  MAX_EMOJI_FILE_BYTES,
  packFormSchema,
  shortcodeOwner,
  suggestShortcode,
  toEmojiFormValues,
  toPackFormValues,
  validateRows,
} from './emojiForm'

/** Phase G4. Fixtures follow the live packs, measured 2026-10-28. */

const LOTTIE = JSON.stringify({
  v: '5.7.4',
  w: 10,
  h: 10,
  fr: 30,
  ip: 0,
  op: 30,
  layers: [],
})

const blushing: Emoji = {
  id: 'e1',
  name: 'Blushing',
  shortcode: ':blushing:',
  type: 'ANIMATED',
  fileUrl: '/api/v1/media/download/catalog/emojis/blushing.json',
  isActive: true,
}
const retired: Emoji = {
  id: 'e2',
  name: 'Probe A',
  shortcode: ':probe_a:',
  isActive: false,
}

const official: EmojiPack = {
  id: 'p1',
  name: 'Official Emojis',
  isActive: true,
  emojis: [blushing],
}
const probe: EmojiPack = {
  id: 'p2',
  name: '[TEST] Probe Pack',
  isActive: false,
  isPremium: true,
  emojis: [retired],
}
const packs = [official, probe]

describe('who holds a shortcode', () => {
  it('finds it in another pack', () => {
    expect(shortcodeOwner(':blushing:', packs)?.pack.id).toBe('p1')
  })

  it('finds an inactive emoji, which still holds its shortcode', () => {
    /* ⚠️ Measured: a deactivated emoji's shortcode cannot be reused. */
    const owner = shortcodeOwner(':probe_a:', packs)
    expect(owner?.emoji.id).toBe('e2')
    expect(describeOwner(owner!)).toMatch(/which is inactive/)
  })

  it('does not count the emoji being edited against itself', () => {
    expect(shortcodeOwner(':blushing:', packs, 'e1')).toBeNull()
  })

  it('names the emoji and the pack', () => {
    expect(describeOwner(shortcodeOwner(':blushing:', packs)!)).toMatch(
      /Blushing in Official Emojis/,
    )
  })
})

describe('suggested shortcodes', () => {
  it.each([
    ['heart_eyes.json', ':heart_eyes:'],
    ['Heart Eyes.png', ':heart_eyes:'],
    ['cross-eyes face.webp', ':cross_eyes_face:'],
    ['---.json', ''],
  ])('%s → %s', (file, expected) => {
    expect(suggestShortcode(file)).toBe(expected)
  })
})

describe('forms', () => {
  it('holds a pack name to 2–100', () => {
    expect(packFormSchema.safeParse({ name: 'A', isPremium: false }).success).toBe(
      false,
    )
    expect(packFormSchema.safeParse({ name: 'AB', isPremium: false }).success).toBe(
      true,
    )
    expect(
      packFormSchema.safeParse({ name: 'P'.repeat(101), isPremium: false }).success,
    ).toBe(false)
  })

  it.each([':ok_1:', ':a:'])('accepts the shortcode %s', (shortcode) => {
    expect(
      emojiFormSchema.safeParse({ name: 'x', shortcode, type: 'STATIC' }).success,
    ).toBe(true)
  })

  it.each(['plain', ':Upper:', ':has space:', '::', ':dash-ed:'])(
    'refuses the shortcode %s, as the server does',
    (shortcode) => {
      expect(
        emojiFormSchema.safeParse({ name: 'x', shortcode, type: 'STATIC' }).success,
      ).toBe(false)
    },
  )

  it('defaults a stored emoji of unknown type to ANIMATED, the live norm', () => {
    expect(toEmojiFormValues({ id: 'x' }).type).toBe('ANIMATED')
  })
})

describe('what an edit sends', () => {
  it('sends only changed emoji fields', () => {
    const values = { ...toEmojiFormValues(blushing), shortcode: ':blush:' }
    expect(buildUpdateEmojiPayload(values, blushing, null)).toEqual({
      shortcode: ':blush:',
    })
  })

  it('sends nothing when nothing changed', () => {
    expect(
      buildUpdateEmojiPayload(toEmojiFormValues(blushing), blushing, null),
    ).toEqual({})
    expect(buildUpdatePackPayload(toPackFormValues(probe), probe, null)).toEqual({})
  })

  it('sends a new file and the premium flag when they change', () => {
    expect(
      buildUpdatePackPayload(
        { name: official.name!, isPremium: true },
        official,
        'https://m/c.png',
      ),
    ).toEqual({ isPremium: true, coverUrl: 'https://m/c.png' })
  })
})

describe('a bulk batch', () => {
  it('flags taken shortcodes, duplicates within the batch, and bad formats', () => {
    const problems = validateRows(
      [
        { name: 'One', shortcode: ':new_one:' },
        { name: 'Two', shortcode: ':blushing:' },
        { name: 'Three', shortcode: ':new_one:' },
        { name: 'Four', shortcode: 'bad' },
        { name: ' ', shortcode: ':fine:' },
      ],
      packs,
    )
    expect(problems[0]).toBeNull()
    expect(problems[1]).toMatch(/Already used by Blushing/)
    expect(problems[2]).toMatch(/same shortcode/)
    expect(problems[3]).toMatch(/:name:/)
    expect(problems[4]).toMatch(/Name is required/)
  })
})

describe('files', () => {
  const file = (name: string, body: string, type: string) =>
    new File([body], name, { type })

  it('implies ANIMATED for a Lottie, STATIC for a PNG, nothing for a WebP', async () => {
    const lottie = await checkCatalogFile(
      file('a.json', LOTTIE, 'application/json'),
      'emojis',
    )
    const png = await checkCatalogFile(file('a.png', 'p', 'image/png'), 'emojis')
    const webp = await checkCatalogFile(file('a.webp', 'w', 'image/webp'), 'emojis')
    expect(lottie.ok && lottie.impliedType).toBe('ANIMATED')
    expect(png.ok && png.impliedType).toBe('STATIC')
    expect(webp.ok && webp.impliedType).toBeNull()
  })

  it('refuses JSON that is not a Lottie animation', async () => {
    expect(
      (await checkCatalogFile(file('a.json', '{}', 'application/json'), 'emojis')).ok,
    ).toBe(false)
  })

  it('refuses a Lottie as a pack cover — the packs folder takes images only', async () => {
    /* Measured from the server's per-folder MIME error. */
    const verdict = await checkCatalogFile(
      file('c.json', LOTTIE, 'application/json'),
      'packs',
    )
    expect(!verdict.ok && verdict.message).toMatch(/takes only images for pack covers/)
  })

  it('accepts JPEG for a cover and refuses it for an emoji', async () => {
    const jpeg = file('c.jpg', 'j', 'image/jpeg')
    expect((await checkCatalogFile(jpeg, 'packs')).ok).toBe(true)
    expect((await checkCatalogFile(jpeg, 'emojis')).ok).toBe(false)
  })

  it('refuses a file over 5 MB', async () => {
    const big = file('a.png', 'p', 'image/png')
    Object.defineProperty(big, 'size', { value: MAX_EMOJI_FILE_BYTES + 1 })
    expect((await checkCatalogFile(big, 'emojis')).ok).toBe(false)
  })
})
