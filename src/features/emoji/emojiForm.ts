import { z } from 'zod'

import { isLottieFile, resolveMime } from '@/lib/catalogFile'
import {
  ALLOWED_UPLOAD_MIME,
  MAX_CATALOG_NAME,
  MIN_PACK_NAME,
  SHORTCODE_PATTERN,
  type Emoji,
  type EmojiPack,
  type EmojiType,
  type UpdateEmojiPackPayload,
  type UpdateEmojiPayload,
  type UploadFolder,
} from '@/types/catalog'

/**
 * The emoji pack and emoji editors' contract (plan.md §4, phase G4).
 *
 * MEASURED against the live backend on 2026-10-28:
 *
 *   - pack names 2–100, emoji names 1–100;
 *   - `type` is `STATIC | ANIMATED`, and **an omitted type is stored as
 *     `STATIC`** on single and bulk create alike, with `sortOrder: 0` — so
 *     both are always sent;
 *   - ⚠️ **shortcodes are unique across every pack, and a deactivated emoji
 *     still holds its shortcode** — a duplicate answers `409
 *     RECORD_ALREADY_EXISTS` with *"this unknown field"*;
 *   - ⚠️ **bulk create silently skips duplicates**: two sent, one duplicate,
 *     answered `201 {count: 1}` with no word on which.
 *
 * The last two are why {@link shortcodeOwner} exists. The admin list includes
 * inactive emojis, so the panel can name the owner of a taken shortcode
 * *before* sending — which is the only way the bulk route's silence is safe.
 */

export const SHORTCODE_MESSAGE =
  'Use the form :name: — lowercase letters, digits and underscores.'

/* ------------------------------------------------------------------ *
 * Shortcodes
 * ------------------------------------------------------------------ */

export interface ShortcodeOwner {
  readonly emoji: Emoji
  readonly pack: EmojiPack
}

/** Who already holds this shortcode, across every pack, inactive included. */
export function shortcodeOwner(
  shortcode: string,
  packs: readonly EmojiPack[],
  exceptEmojiId?: string,
): ShortcodeOwner | null {
  for (const pack of packs) {
    for (const emoji of pack.emojis ?? []) {
      if (emoji.id !== exceptEmojiId && emoji.shortcode === shortcode) {
        return { emoji, pack }
      }
    }
  }
  return null
}

export function describeOwner(owner: ShortcodeOwner): string {
  const name = owner.emoji.name?.trim() || 'another emoji'
  const pack = owner.pack.name?.trim() || 'another pack'
  const inactive = owner.emoji.isActive === true ? '' : ', which is inactive'
  return `Already used by ${name} in ${pack}${inactive}. Shortcodes are unique across all packs, and a deactivated emoji keeps its shortcode.`
}

/**
 * ⚠️ Re-worded because the service will not (plan.md O4). Reached only when
 * the shortcode was taken after the list loaded — the pre-check catches the
 * rest.
 */
export const TAKEN_MESSAGE =
  'This shortcode is already taken — possibly just now, by someone else. Shortcodes are unique across all packs, including inactive emojis.'

/** `Heart Eyes.json` → `:heart_eyes:`. */
export function suggestShortcode(filename: string): string {
  const base = filename
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base ? `:${base}:` : ''
}

/* ------------------------------------------------------------------ *
 * Bulk
 * ------------------------------------------------------------------ */

/** Ours, not the server's — no limit was found. A batch past this is a migration. */
export const MAX_BULK = 50

/** Every row's problem, in the operator's terms, or `null` when it may be sent. */
export function validateRows(
  rows: readonly { readonly name: string; readonly shortcode: string }[],
  packs: readonly EmojiPack[],
): (string | null)[] {
  const seen = new Map<string, number>()
  rows.forEach((row, index) => {
    const code = row.shortcode.trim()
    if (!seen.has(code)) seen.set(code, index)
  })

  return rows.map((row, index) => {
    const name = row.name.trim()
    const code = row.shortcode.trim()
    if (!name) return 'Name is required.'
    if (name.length > MAX_CATALOG_NAME) return 'Name: at most 100 characters.'
    if (!SHORTCODE_PATTERN.test(code)) return SHORTCODE_MESSAGE
    const owner = shortcodeOwner(code, packs)
    if (owner) return describeOwner(owner)
    if (seen.get(code) !== index)
      return 'Another file in this batch uses the same shortcode.'
    return null
  })
}

/* ------------------------------------------------------------------ *
 * Forms
 * ------------------------------------------------------------------ */

export const packFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(MIN_PACK_NAME, 'Pack name must be at least 2 characters')
    .max(MAX_CATALOG_NAME, 'At most 100 characters'),
  isPremium: z.boolean(),
})
export type PackFormValues = z.infer<typeof packFormSchema>

export function toPackFormValues(pack: EmojiPack | null): PackFormValues {
  return { name: pack?.name ?? '', isPremium: pack?.isPremium === true }
}

export function buildUpdatePackPayload(
  values: PackFormValues,
  pack: EmojiPack,
  coverUrl: string | null,
): UpdateEmojiPackPayload {
  const name = values.name.trim()
  return {
    ...(name !== (pack.name ?? '') ? { name } : {}),
    ...(values.isPremium !== (pack.isPremium === true)
      ? { isPremium: values.isPremium }
      : {}),
    ...(coverUrl ? { coverUrl } : {}),
  }
}

export const emojiFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(MAX_CATALOG_NAME, 'At most 100 characters'),
  shortcode: z.string().trim().regex(SHORTCODE_PATTERN, SHORTCODE_MESSAGE),
  type: z.enum(['STATIC', 'ANIMATED']),
})
export type EmojiFormValues = z.infer<typeof emojiFormSchema>

export const EMOJI_FORM_FIELDS = ['name', 'shortcode', 'type'] as const

export function toEmojiFormValues(emoji: Emoji | null): EmojiFormValues {
  return {
    name: emoji?.name ?? '',
    shortcode: emoji?.shortcode ?? '',
    type: emoji?.type === 'STATIC' ? 'STATIC' : 'ANIMATED',
  }
}

export function buildUpdateEmojiPayload(
  values: EmojiFormValues,
  emoji: Emoji,
  fileUrl: string | null,
): UpdateEmojiPayload {
  const name = values.name.trim()
  const shortcode = values.shortcode.trim()
  return {
    ...(name !== (emoji.name ?? '') ? { name } : {}),
    ...(shortcode !== (emoji.shortcode ?? '') ? { shortcode } : {}),
    ...(values.type !== emoji.type ? { type: values.type } : {}),
    ...(fileUrl ? { fileUrl } : {}),
  }
}

/** The next free position at the end of a list. */
export function nextSortOrder(
  rows: readonly { sortOrder?: number | null | undefined }[],
): number {
  const orders = rows
    .map((row) => row.sortOrder)
    .filter((order): order is number => typeof order === 'number')
  return orders.length === 0 ? 0 : Math.max(...orders) + 1
}

/** `application/json` → `JSON`, for a picked file's placeholder tile. */
export function fileBadge(mimetype: string): string {
  return (mimetype.split('/')[1] ?? 'FILE').toUpperCase()
}

/* ------------------------------------------------------------------ *
 * Files
 * ------------------------------------------------------------------ */

/** 5 MB — **ours**; the upload route has no limit we could find. */
export const MAX_EMOJI_FILE_BYTES = 5 * 1024 * 1024

export const EMOJI_FILE_ACCEPT =
  '.json,application/json,.png,image/png,.webp,image/webp'
export const COVER_FILE_ACCEPT = '.png,image/png,.webp,image/webp,.jpg,.jpeg,image/jpeg'

export type FileVerdict =
  | {
      readonly ok: true
      readonly mimetype: string
      /** The type the file implies, where it implies one. */
      readonly impliedType: EmojiType | null
    }
  | { readonly ok: false; readonly message: string }

/**
 * Check a file against the folder it will be uploaded to.
 *
 * ⚠️ **The folder lists are the server's**, measured from its own error:
 * `emojis` takes PNG, WebP and JSON; `packs` takes PNG, WebP and JPEG. A pack
 * cover therefore cannot be a Lottie file, although the one live pack's cover
 * is — it was not uploaded through this route.
 */
export async function checkCatalogFile(
  file: File,
  folder: Extract<UploadFolder, 'emojis' | 'packs'>,
): Promise<FileVerdict> {
  const mimetype = resolveMime(file)
  const allowed = ALLOWED_UPLOAD_MIME[folder]

  if (!allowed.includes(mimetype)) {
    return {
      ok: false,
      message:
        folder === 'packs'
          ? /*
             * ⚠️ Measured on the upload service, not the apps: the seeded live
             * covers ARE Lottie files (from the emojis folder). New ones
             * cannot be uploaded as such.
             */
            `“${file.name}” is not a PNG, WebP or JPEG image. The upload service takes only images for pack covers.`
          : `“${file.name}” is not a Lottie (.json), PNG or WebP file.`,
    }
  }

  if (file.size > MAX_EMOJI_FILE_BYTES) {
    return { ok: false, message: `“${file.name}” is larger than 5 MB.` }
  }

  if (mimetype === 'application/json') {
    if (!(await isLottieFile(file))) {
      return {
        ok: false,
        message: `“${file.name}” is not a Lottie animation, or is larger than 2 MB.`,
      }
    }
    return { ok: true, mimetype, impliedType: 'ANIMATED' }
  }

  /*
   * A PNG cannot animate. WebP can, so it implies nothing and the operator
   * chooses.
   */
  return { ok: true, mimetype, impliedType: mimetype === 'image/png' ? 'STATIC' : null }
}
