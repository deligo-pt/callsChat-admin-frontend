import { z } from 'zod'

import { envelopeSchema, idSchema, isoDateTime, paginatedSchema } from '@/types/common'

/**
 * Emoji & Virtual Gift catalog contracts (plan.md §2, phase G1).
 *
 * MEASURED against `https://test-api.callschat.com/api/v1` on 2026-10-28 with
 * a `SUPER_ADMIN` token.
 *
 * ⚠️ **Unlike the last two features, every shape here was observed on a
 * populated table** — 3 categories, 8 gifts, 1 pack of 12 emojis and 22
 * transactions. The rows are still permissive, because the backend is still
 * free to add a field, but nothing below is a guess about what arrives.
 */

/* -------------------------------------------------------------------------
 * Shared
 * ---------------------------------------------------------------------- */

/**
 * ⚠️ **Media URLs are plain strings, never `z.url()`.** The catalog stores
 * root-relative paths (`/api/v1/media/download/...`) which `z.url()` rejects,
 * and the upload route returns absolute ones. Both are legitimate; the
 * resolution happens at render in `lib/mediaUrl.ts`, and a poisoned value is
 * defused there rather than blanking a whole record at the contract boundary.
 */
const mediaUrl = z.string()

/** Every catalog row carries these. */
const catalogRowFields = {
  id: idSchema,
  name: z.string().nullable().optional(),
  sortOrder: z.number().nullable().optional(),
  isActive: z.boolean().nullable().optional(),
  createdAt: isoDateTime.or(z.string()).nullable().optional(),
  updatedAt: isoDateTime.or(z.string()).nullable().optional(),
}

/* -------------------------------------------------------------------------
 * Gifts
 * ---------------------------------------------------------------------- */

/**
 * ⚠️ **Measured from the server's own enum error**, 2026-10-28:
 * `"Invalid enum value. Expected 'LOTTIE' | 'WEBP' | 'MP4'"`. G1 guessed
 * `IMAGE | VIDEO` from the announcement module's vocabulary, and the guess was
 * wrong — which is the whole argument for measuring before writing.
 */
export const GIFT_ANIMATION_TYPES = ['LOTTIE', 'WEBP', 'MP4'] as const
export const giftAnimationTypeSchema = z.enum(GIFT_ANIMATION_TYPES)
export type GiftAnimationType = z.infer<typeof giftAnimationTypeSchema>

export const giftSchema = z.object({
  ...catalogRowFields,
  categoryId: idSchema.nullable().optional(),

  /**
   * ⚠️ **`iconUrl` is the same `.json` Lottie file as `animationUrl` on every
   * live gift.** There is no static thumbnail in this catalog, so nothing may
   * assume this is an image — see `isLottieAsset`.
   */
  iconUrl: mediaUrl.nullable().optional(),
  animationUrl: mediaUrl.nullable().optional(),
  animationType: giftAnimationTypeSchema.or(z.string()).nullable().optional(),

  /**
   * ⚠️ **Every live gift is `0`, and the API refuses to save `0`** (plan.md
   * O1): `PATCH {"priceDiamonds": 0}` answers
   * `400 "Number must be greater than 0"`. So the stored value is outside the
   * range the write schema allows, and this read schema must therefore NOT
   * enforce the write rule — doing so would reject the entire live catalog.
   */
  priceDiamonds: z.number().nullable().optional(),
})
export type Gift = z.infer<typeof giftSchema>

export const giftCategorySchema = z.object({
  ...catalogRowFields,
  /** ⚠️ Nested by the server — the category list is also the gift list. */
  gifts: z.array(giftSchema).nullable().optional(),
})
export type GiftCategory = z.infer<typeof giftCategorySchema>

/** ⚠️ Bare arrays. Neither list paginates — measured. */
export const giftCategoryListSchema = envelopeSchema(z.array(giftCategorySchema))
export const giftListSchema = envelopeSchema(z.array(giftSchema))

/* -------------------------------------------------------------------------
 * Emoji
 * ---------------------------------------------------------------------- */

export const EMOJI_TYPES = ['ANIMATED', 'STATIC'] as const
export const emojiTypeSchema = z.enum(EMOJI_TYPES)
export type EmojiType = z.infer<typeof emojiTypeSchema>

export const emojiSchema = z.object({
  ...catalogRowFields,
  packId: idSchema.nullable().optional(),
  /** ⚠️ `:lowercase_with_underscores:` — the server validates the format. */
  shortcode: z.string().nullable().optional(),
  fileUrl: mediaUrl.nullable().optional(),
  type: emojiTypeSchema.or(z.string()).nullable().optional(),
})
export type Emoji = z.infer<typeof emojiSchema>

export const emojiPackSchema = z.object({
  ...catalogRowFields,
  coverUrl: mediaUrl.nullable().optional(),
  /**
   * ⚠️ A flag, **not a price.** Nothing in this contract sells a premium pack
   * for diamonds, which is why emoji packs live in Platform rather than under
   * Diamonds (plan.md §3.4).
   */
  isPremium: z.boolean().nullable().optional(),
  emojis: z.array(emojiSchema).nullable().optional(),
})
export type EmojiPack = z.infer<typeof emojiPackSchema>

export const emojiPackListSchema = envelopeSchema(z.array(emojiPackSchema))

/* -------------------------------------------------------------------------
 * The gift transaction ledger
 * ---------------------------------------------------------------------- */

export const giftTransactionPartySchema = z.object({
  id: idSchema,
  displayName: z.string().nullable().optional(),
  /** ⚠️ Relative, like every avatar on this backend (plan.md O10). */
  avatarUrl: z.string().nullable().optional(),
  equippedFrame: z.unknown().nullable().optional(),
})

export const giftTransactionSchema = z.object({
  id: idSchema,
  giftId: idSchema.nullable().optional(),
  senderId: idSchema.nullable().optional(),
  receiverId: idSchema.nullable().optional(),

  contextType: z.string().nullable().optional(),
  contextId: z.string().nullable().optional(),

  quantity: z.number().nullable().optional(),
  unitPrice: z.number().nullable().optional(),
  totalPrice: z.number().nullable().optional(),
  /** The receiver's share. ⚠️ `0` on all 22 live rows — see `priceDiamonds`. */
  hostEarnings: z.number().nullable().optional(),

  status: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),

  /**
   * ⚠️ **The snapshot is what must be rendered, never the live `gift` below.**
   * These three record what the gift *was* at the moment it was sent; `gift`
   * is what it is now. On a financial audit screen, rendering the live record
   * means renaming or re-pricing a gift silently rewrites history.
   */
  snapshotName: z.string().nullable().optional(),
  snapshotIconUrl: mediaUrl.nullable().optional(),
  snapshotAnimationUrl: mediaUrl.nullable().optional(),

  createdAt: isoDateTime.or(z.string()).nullable().optional(),

  /** The current catalog record. Present for context, not for display. */
  gift: giftSchema.nullable().optional(),
  sender: giftTransactionPartySchema.nullable().optional(),
  receiver: giftTransactionPartySchema.nullable().optional(),
})
export type GiftTransaction = z.infer<typeof giftTransactionSchema>

/** ⚠️ The only paginated route in this feature. */
export const giftTransactionListSchema = paginatedSchema(giftTransactionSchema)

/* -------------------------------------------------------------------------
 * Catalog version
 * ---------------------------------------------------------------------- */

/**
 * `GET /catalog/version` — bumped atomically by every write (measured: gift
 * 3 → 11 across one session of probes).
 */
export const catalogVersionSchema = envelopeSchema(
  z.object({
    giftVersion: z.number(),
    emojiVersion: z.number(),
    updatedAt: isoDateTime.or(z.string()).nullable().optional(),
  }),
)
export type CatalogVersion = z.infer<typeof catalogVersionSchema>['data']

/* -------------------------------------------------------------------------
 * Writes
 * ---------------------------------------------------------------------- */

/** The server's floor, measured: `"Gift price must be at least 1 diamond"`. */
export const MIN_GIFT_PRICE = 1

/** `"Category name must be at least 2 characters"`, measured. */
export const MIN_CATEGORY_NAME = 2

/**
 * `"String must contain at most 100 character(s)"` — measured on both gift and
 * category names, 2026-10-28.
 */
export const MAX_CATALOG_NAME = 100

export const createGiftCategorySchema = z.object({
  name: z
    .string()
    .min(MIN_CATEGORY_NAME, 'Category name must be at least 2 characters')
    .max(MAX_CATALOG_NAME, 'At most 100 characters'),
  sortOrder: z.number().int().optional(),
})
export type CreateGiftCategoryPayload = z.infer<typeof createGiftCategorySchema>

export const updateGiftCategorySchema = createGiftCategorySchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
export type UpdateGiftCategoryPayload = z.infer<typeof updateGiftCategorySchema>

/**
 * `POST /admin/gifts`. Measured required set: `categoryId`, `name`,
 * `iconUrl`, `animationUrl`, `priceDiamonds`.
 *
 * ⚠️ **`animationUrl` is required**, although the doc presents it as the
 * optional half of a pair. Omitting it answers `body/animationUrl Invalid
 * input`.
 */
export const createGiftSchema = z.object({
  categoryId: idSchema,
  name: z.string().min(1).max(MAX_CATALOG_NAME, 'At most 100 characters'),
  iconUrl: z.string().min(1),
  animationUrl: z.string().min(1),
  animationType: giftAnimationTypeSchema.optional(),
  priceDiamonds: z
    .number()
    .int()
    .min(MIN_GIFT_PRICE, 'Gift price must be at least 1 diamond'),
  sortOrder: z.number().int().optional(),
})
export type CreateGiftPayload = z.infer<typeof createGiftSchema>

/** ⚠️ Update uses the server's **other** wording for the same rule. */
export const updateGiftSchema = createGiftSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => value.priceDiamonds === undefined || value.priceDiamonds > 0, {
    message: 'Number must be greater than 0',
    path: ['priceDiamonds'],
  })
export type UpdateGiftPayload = z.infer<typeof updateGiftSchema>

/** `"Pack name must be at least 2 characters"`, measured 2026-10-28. */
export const MIN_PACK_NAME = 2

export const createEmojiPackSchema = z.object({
  name: z
    .string()
    .min(MIN_PACK_NAME, 'Pack name must be at least 2 characters')
    .max(MAX_CATALOG_NAME, 'At most 100 characters'),
  coverUrl: z.string().min(1),
  sortOrder: z.number().int().optional(),
  isPremium: z.boolean().optional(),
})
export type CreateEmojiPackPayload = z.infer<typeof createEmojiPackSchema>

export const updateEmojiPackSchema = createEmojiPackSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
export type UpdateEmojiPackPayload = z.infer<typeof updateEmojiPackSchema>

/**
 * ⚠️ The server's own pattern, reproduced exactly:
 * `"Shortcode must be in format :name:, lowercase alphanumeric and underscores"`
 */
export const SHORTCODE_PATTERN = /^:[a-z0-9_]+:$/

export const createEmojiSchema = z.object({
  packId: idSchema,
  name: z.string().min(1).max(MAX_CATALOG_NAME, 'At most 100 characters'),
  shortcode: z
    .string()
    .regex(
      SHORTCODE_PATTERN,
      'Shortcode must be in format :name:, lowercase alphanumeric and underscores',
    ),
  fileUrl: z.string().min(1),
  /**
   * ⚠️ **Optional on the wire, required in practice.** Omitted, the server
   * stores `STATIC` — measured on both single and bulk create, 2026-10-28 —
   * while every live emoji is an animated Lottie. The panel always sends it.
   */
  type: emojiTypeSchema.optional(),
  sortOrder: z.number().int().optional(),
})
export type CreateEmojiPayload = z.infer<typeof createEmojiSchema>

export const updateEmojiSchema = createEmojiSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
export type UpdateEmojiPayload = z.infer<typeof updateEmojiSchema>

/** `POST /admin/emoji/emojis/bulk` answers `{ count }` and nothing else. */
export const bulkEmojiResultSchema = envelopeSchema(z.object({ count: z.number() }))

/* -------------------------------------------------------------------------
 * Reordering
 * ---------------------------------------------------------------------- */

/**
 * The batch every reorder route takes, measured identical on all four:
 * `{"items":[{"id":"...","sortOrder":0}]}`.
 *
 * An empty array is refused — `"At least one item must be supplied for
 * reordering"` — so the caller never sends a no-op.
 */
export const reorderSchema = z.object({
  items: z
    .array(z.object({ id: idSchema, sortOrder: z.number().int() }))
    .min(1, 'At least one item must be supplied for reordering'),
})
export type ReorderPayload = z.infer<typeof reorderSchema>

/* -------------------------------------------------------------------------
 * Uploads
 * ---------------------------------------------------------------------- */

export const UPLOAD_FOLDERS = ['emojis', 'gifts', 'packs'] as const
export const uploadFolderSchema = z.enum(UPLOAD_FOLDERS)
export type UploadFolder = z.infer<typeof uploadFolderSchema>

/**
 * ⚠️ **MIME is validated per folder**, server-side, with a usable message.
 * Mirrored here so the file picker can refuse before a round trip — and so the
 * two can be compared when they drift.
 */
export const ALLOWED_UPLOAD_MIME: Readonly<Record<UploadFolder, readonly string[]>> = {
  gifts: ['image/png', 'image/webp', 'application/json', 'video/mp4'],
  emojis: ['image/png', 'image/webp', 'application/json'],
  packs: ['image/png', 'image/webp', 'image/jpeg'],
}

export const uploadUrlRequestSchema = z.object({
  filename: z.string().min(1),
  mimetype: z.string().min(1),
  folder: uploadFolderSchema.optional(),
})
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>

export const uploadUrlSchema = envelopeSchema(
  z.object({
    uploadUrl: z.string(),
    fileUrl: z.string(),
    fileKey: z.string(),
    expiresIn: z.number().nullable().optional(),
  }),
)
export type UploadTarget = z.infer<typeof uploadUrlSchema>['data']

/** The ledger's ceiling — ⚠️ **not enforced server-side** (plan.md O5). */
export const MAX_LEDGER_LIMIT = 100
