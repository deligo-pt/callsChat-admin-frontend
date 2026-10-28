import { z } from 'zod'

import { isLottieFile, resolveMime } from '@/lib/catalogFile'
import {
  MAX_CATALOG_NAME,
  MIN_CATEGORY_NAME,
  MIN_GIFT_PRICE,
  type CreateGiftPayload,
  type Gift,
  type GiftAnimationType,
  type UpdateGiftPayload,
} from '@/types/catalog'

/**
 * The gift and category editors' contract (plan.md §4, phase G3).
 *
 * MEASURED against the live backend on 2026-10-28:
 *
 *   - names: 1–100 characters for a gift, 2–100 for a category;
 *   - `priceDiamonds`: an integer, at least 1, **no upper bound** (`1e8` saved);
 *   - `animationType`: `LOTTIE | WEBP | MP4`, from the server's enum error;
 *   - an unknown `categoryId` answers `422 FOREIGN_KEY_CONSTRAINT`.
 *
 * ⚠️ **The price floor only applies to a price that is sent.** Every live gift
 * is at 0, and the plan assumed that made every edit impossible without a
 * re-price. Measured: `PATCH {"name": "Heart Icon"}` on a 0-priced gift
 * succeeds. So the editor sends only what changed — a rename stays a rename,
 * and the 0 is neither saved over nor silently replaced.
 */

/* ------------------------------------------------------------------ *
 * Gift
 * ------------------------------------------------------------------ */

export interface GiftFormValues {
  name: string
  categoryId: string
  priceDiamonds: string
}

export const GIFT_FORM_FIELDS = ['name', 'categoryId', 'priceDiamonds'] as const

function isWholeNumber(value: string): boolean {
  return /^\d+$/.test(value)
}

/**
 * ⚠️ A factory, because "valid price" depends on the record. On create a price
 * is required. On edit, the **unchanged** stored value is always acceptable —
 * even 0, which the server would refuse if it were sent — because it is not
 * sent.
 */
export function giftFormSchema(storedPrice: number | null) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, 'Name is required')
        .max(MAX_CATALOG_NAME, 'At most 100 characters'),
      categoryId: z.string().min(1, 'Choose a category'),
      priceDiamonds: z.string().trim(),
    })
    .superRefine((values, context) => {
      if (storedPrice !== null && values.priceDiamonds === String(storedPrice)) return

      if (
        !isWholeNumber(values.priceDiamonds) ||
        Number(values.priceDiamonds) < MIN_GIFT_PRICE
      ) {
        context.addIssue({
          code: 'custom',
          path: ['priceDiamonds'],
          message:
            storedPrice === null
              ? 'Gift price must be at least 1 diamond'
              : `A new price must be a whole number of at least 1. Leave it at ${storedPrice} to keep the current price.`,
        })
      }
    })
}

export function toGiftFormValues(gift: Gift | null, categoryId = ''): GiftFormValues {
  if (!gift) return { name: '', categoryId, priceDiamonds: '' }
  return {
    name: gift.name ?? '',
    categoryId: gift.categoryId ?? '',
    priceDiamonds:
      typeof gift.priceDiamonds === 'number' ? String(gift.priceDiamonds) : '',
  }
}

/** An uploaded animation, ready to be written into a record. */
export interface UploadedAsset {
  readonly fileUrl: string
  readonly animationType: GiftAnimationType
}

/**
 * ⚠️ **Live data stores one file in both `iconUrl` and `animationUrl`**, and
 * the create route requires both. One upload fills both, as every existing
 * gift does.
 */
export function buildCreateGiftPayload(
  values: GiftFormValues,
  asset: UploadedAsset,
  sortOrder: number,
): CreateGiftPayload {
  return {
    categoryId: values.categoryId,
    name: values.name.trim(),
    priceDiamonds: Number(values.priceDiamonds),
    iconUrl: asset.fileUrl,
    animationUrl: asset.fileUrl,
    animationType: asset.animationType,
    sortOrder,
  }
}

/** Only what changed. An empty object means there is nothing to save. */
export function buildUpdateGiftPayload(
  values: GiftFormValues,
  gift: Gift,
  asset: UploadedAsset | null,
): UpdateGiftPayload {
  const name = values.name.trim()
  const price = values.priceDiamonds.trim()
  const stored =
    typeof gift.priceDiamonds === 'number' ? String(gift.priceDiamonds) : ''

  return {
    ...(name !== (gift.name ?? '') ? { name } : {}),
    ...(values.categoryId !== (gift.categoryId ?? '')
      ? { categoryId: values.categoryId }
      : {}),
    ...(price !== stored ? { priceDiamonds: Number(price) } : {}),
    ...(asset
      ? {
          iconUrl: asset.fileUrl,
          animationUrl: asset.fileUrl,
          animationType: asset.animationType,
        }
      : {}),
  }
}

/** The next free position at the end of a category. */
export function nextSortOrder(gifts: readonly Gift[]): number {
  const orders = gifts
    .map((gift) => gift.sortOrder)
    .filter((order): order is number => typeof order === 'number')
  return orders.length === 0 ? 0 : Math.max(...orders) + 1
}

/* ------------------------------------------------------------------ *
 * Category
 * ------------------------------------------------------------------ */

export const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(MIN_CATEGORY_NAME, 'Category name must be at least 2 characters')
    .max(MAX_CATALOG_NAME, 'At most 100 characters'),
})
export type CategoryFormValues = z.infer<typeof categoryFormSchema>

/* ------------------------------------------------------------------ *
 * The animation file
 * ------------------------------------------------------------------ */

/**
 * What the gift picker accepts, and the `animationType` each one is saved as.
 *
 * ⚠️ **Narrower than the upload route.** `upload-url` accepts `image/png` for
 * `gifts`, but the gift record's enum has no PNG value — a PNG could be
 * uploaded and then not described. So it is refused here, with the reason.
 */
export const GIFT_FILE_TYPES: Readonly<Record<string, GiftAnimationType>> = {
  'application/json': 'LOTTIE',
  'image/webp': 'WEBP',
  'video/mp4': 'MP4',
}

export const GIFT_FILE_ACCEPT = '.json,application/json,.webp,image/webp,.mp4,video/mp4'

/**
 * 10 MB, **ours, not the server's** — no limit was found on the upload route.
 * A Lottie file is held to `parseLottie`'s 2 MB instead, because one larger
 * than that would upload and then refuse to preview.
 */
export const MAX_GIFT_FILE_BYTES = 10 * 1024 * 1024

export type GiftFileVerdict =
  | {
      readonly ok: true
      readonly mimetype: string
      readonly animationType: GiftAnimationType
    }
  | { readonly ok: false; readonly message: string }

export async function checkGiftFile(file: File): Promise<GiftFileVerdict> {
  const mimetype = resolveMime(file)

  if (mimetype === 'image/png') {
    return {
      ok: false,
      message:
        'PNG can be stored but not described: a gift is LOTTIE, WEBP or MP4. Export it as WebP.',
    }
  }

  const animationType = GIFT_FILE_TYPES[mimetype]
  if (!animationType) {
    return {
      ok: false,
      message: `“${file.name}” is not a Lottie (.json), WebP or MP4 file.`,
    }
  }

  if (file.size > MAX_GIFT_FILE_BYTES) {
    return { ok: false, message: 'The file is larger than 10 MB.' }
  }

  /* Checked before upload — see `isLottieFile`. */
  if (animationType === 'LOTTIE' && !(await isLottieFile(file))) {
    return {
      ok: false,
      message: 'This JSON file is not a Lottie animation, or is larger than 2 MB.',
    }
  }

  return { ok: true, mimetype, animationType }
}
