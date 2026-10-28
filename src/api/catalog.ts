import type { z } from 'zod'

import { apiClient } from '@/api/client'
import type { Pagination } from '@/types/common'
import {
  bulkEmojiResultSchema,
  catalogVersionSchema,
  emojiPackListSchema,
  giftCategoryListSchema,
  giftListSchema,
  giftTransactionListSchema,
  uploadUrlSchema,
  type CatalogVersion,
  type CreateEmojiPackPayload,
  type CreateEmojiPayload,
  type CreateGiftCategoryPayload,
  type CreateGiftPayload,
  type EmojiPack,
  type Gift,
  type GiftCategory,
  type GiftTransaction,
  type ReorderPayload,
  type UpdateEmojiPackPayload,
  type UpdateEmojiPayload,
  type UpdateGiftCategoryPayload,
  type UpdateGiftPayload,
  type UploadFolder,
  type UploadTarget,
  type UploadUrlRequest,
} from '@/types/catalog'

/**
 * Emoji & Virtual Gift catalog API (plan.md §2, phase G1).
 *
 * MEASURED against `https://test-api.callschat.com/api/v1` on 2026-10-28.
 * Four rules hold across this file:
 *
 * 1. **Only the ledger paginates.** Categories, gifts and packs answer bare
 *    arrays, and categories and packs nest their children.
 * 2. **Nothing is painted from a write response.** Every write bumps
 *    `catalogVersion` and flushes Redis; the list is refetched.
 * 3. **Delete is a soft delete** — `isActive: false`, the row stays listed,
 *    and `PATCH { isActive: true }` brings it back. Verified both ways.
 * 4. **Query parameters that the server ignores are never sent.** `isActive`
 *    on gifts and `userId`/`giftId`/`contextType`/`status` on the ledger all
 *    answer `200` and change nothing (plan.md O3, O6). A request carrying one
 *    would look filtered and not be.
 */

const CATEGORIES = '/admin/gifts/categories'
const GIFTS = '/admin/gifts'
const TRANSACTIONS = '/admin/gifts/transactions'
const PACKS = '/admin/emoji/packs'
const EMOJIS = '/admin/emoji/emojis'
const UPLOAD_URL = '/admin/catalog/upload-url'
const VERSION = '/catalog/version'

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/** `GET /admin/gifts/categories` — includes inactive rows, nests `gifts[]`. */
export async function fetchGiftCategories(
  signal?: AbortSignal,
): Promise<readonly GiftCategory[]> {
  const response = await apiClient.get<z.infer<typeof giftCategoryListSchema>>(
    CATEGORIES,
    {
      schema: giftCategoryListSchema,
      resource: 'gift-categories',
      ...(signal ? { signal } : {}),
    },
  )
  return response.data
}

/**
 * `GET /admin/gifts`.
 *
 * ⚠️ `categoryId` is forwarded but **not validated** by the server — an
 * unknown id answers `200` with `[]` rather than an error, so a typo returns
 * an empty catalog instead of a complaint. The caller sends only ids it has.
 */
export async function fetchGifts(
  categoryId?: string,
  signal?: AbortSignal,
): Promise<readonly Gift[]> {
  const response = await apiClient.get<z.infer<typeof giftListSchema>>(GIFTS, {
    ...(categoryId ? { params: { categoryId } } : {}),
    schema: giftListSchema,
    resource: 'gifts',
    ...(signal ? { signal } : {}),
  })
  return response.data
}

/** `GET /admin/emoji/packs` — includes inactive rows, nests `emojis[]`. */
export async function fetchEmojiPacks(
  signal?: AbortSignal,
): Promise<readonly EmojiPack[]> {
  const response = await apiClient.get<z.infer<typeof emojiPackListSchema>>(PACKS, {
    schema: emojiPackListSchema,
    resource: 'emoji-packs',
    ...(signal ? { signal } : {}),
  })
  return response.data
}

/**
 * The ledger's query. ⚠️ **Three parameters, because three work.**
 * `userId`, `giftId`, `contextType` and `status` are accepted and ignored.
 */
export interface GiftTransactionQuery {
  readonly senderId?: string | undefined
  readonly receiverId?: string | undefined
  readonly contextId?: string | undefined
  readonly page?: number | undefined
  readonly limit?: number | undefined
  readonly [key: string]: string | number | boolean | undefined
}

export interface GiftTransactionPage {
  readonly data: readonly GiftTransaction[]
  readonly pagination: Pagination
}

/**
 * `GET /admin/gifts/transactions`.
 *
 * ⚠️ **The only paginated route here, and the only one with no bounds
 * checking.** `limit=101`, `limit=0` and `page=0` all answer `200` (plan.md
 * O5). The caller clamps before sending; the server will not.
 */
export async function fetchGiftTransactions(
  query: GiftTransactionQuery,
  signal?: AbortSignal,
): Promise<GiftTransactionPage> {
  const response = await apiClient.get<z.infer<typeof giftTransactionListSchema>>(
    TRANSACTIONS,
    {
      params: query,
      schema: giftTransactionListSchema,
      resource: 'gift-transactions',
      ...(signal ? { signal } : {}),
    },
  )
  return { data: response.data, pagination: response.pagination }
}

/** `GET /catalog/version` — bumped atomically by every write. */
export async function fetchCatalogVersion(
  signal?: AbortSignal,
): Promise<CatalogVersion> {
  const response = await apiClient.get<z.infer<typeof catalogVersionSchema>>(VERSION, {
    schema: catalogVersionSchema,
    resource: 'catalog-version',
    ...(signal ? { signal } : {}),
  })
  return response.data
}

/* ------------------------------------------------------------------ *
 * Gift categories
 * ------------------------------------------------------------------ */

export async function createGiftCategory(
  payload: CreateGiftCategoryPayload,
): Promise<void> {
  await apiClient.post(CATEGORIES, { body: { ...payload }, resource: 'gift-category' })
}

export async function updateGiftCategory(
  id: string,
  payload: UpdateGiftCategoryPayload,
): Promise<void> {
  await apiClient.patch(`${CATEGORIES}/${encodeURIComponent(id)}`, {
    body: { ...payload },
    resource: 'gift-category',
  })
}

/**
 * ⚠️ **A soft delete.** Answers `"Gift category deactivated successfully."`
 * and returns the row with `isActive: false`; it stays in the admin list.
 * Reversible with `updateGiftCategory(id, { isActive: true })`.
 */
export async function deactivateGiftCategory(id: string): Promise<void> {
  await apiClient.delete(`${CATEGORIES}/${encodeURIComponent(id)}`, {
    resource: 'gift-category',
  })
}

export async function reorderGiftCategories(payload: ReorderPayload): Promise<void> {
  await apiClient.patch(`${CATEGORIES}/reorder`, {
    body: { ...payload },
    resource: 'gift-category-reorder',
  })
}

/* ------------------------------------------------------------------ *
 * Gifts
 * ------------------------------------------------------------------ */

export async function createGift(payload: CreateGiftPayload): Promise<void> {
  await apiClient.post(GIFTS, { body: { ...payload }, resource: 'gift' })
}

export async function updateGift(
  id: string,
  payload: UpdateGiftPayload,
): Promise<void> {
  await apiClient.patch(`${GIFTS}/${encodeURIComponent(id)}`, {
    body: { ...payload },
    resource: 'gift',
  })
}

export async function deactivateGift(id: string): Promise<void> {
  await apiClient.delete(`${GIFTS}/${encodeURIComponent(id)}`, { resource: 'gift' })
}

export async function reorderGifts(payload: ReorderPayload): Promise<void> {
  await apiClient.patch(`${GIFTS}/reorder`, {
    body: { ...payload },
    resource: 'gift-reorder',
  })
}

/* ------------------------------------------------------------------ *
 * Emoji packs and emojis
 * ------------------------------------------------------------------ */

export async function createEmojiPack(payload: CreateEmojiPackPayload): Promise<void> {
  await apiClient.post(PACKS, { body: { ...payload }, resource: 'emoji-pack' })
}

export async function updateEmojiPack(
  id: string,
  payload: UpdateEmojiPackPayload,
): Promise<void> {
  await apiClient.patch(`${PACKS}/${encodeURIComponent(id)}`, {
    body: { ...payload },
    resource: 'emoji-pack',
  })
}

export async function deactivateEmojiPack(id: string): Promise<void> {
  await apiClient.delete(`${PACKS}/${encodeURIComponent(id)}`, {
    resource: 'emoji-pack',
  })
}

export async function reorderEmojiPacks(payload: ReorderPayload): Promise<void> {
  await apiClient.patch(`${PACKS}/reorder`, {
    body: { ...payload },
    resource: 'emoji-pack-reorder',
  })
}

export async function createEmoji(payload: CreateEmojiPayload): Promise<void> {
  await apiClient.post(EMOJIS, { body: { ...payload }, resource: 'emoji' })
}

export async function updateEmoji(
  id: string,
  payload: UpdateEmojiPayload,
): Promise<void> {
  await apiClient.patch(`${EMOJIS}/${encodeURIComponent(id)}`, {
    body: { ...payload },
    resource: 'emoji',
  })
}

export async function deactivateEmoji(id: string): Promise<void> {
  await apiClient.delete(`${EMOJIS}/${encodeURIComponent(id)}`, { resource: 'emoji' })
}

export async function reorderEmojis(payload: ReorderPayload): Promise<void> {
  await apiClient.patch(`${EMOJIS}/reorder`, {
    body: { ...payload },
    resource: 'emoji-reorder',
  })
}

/**
 * `POST /admin/emoji/emojis/bulk`.
 *
 * ⚠️ Answers `{ "count": 2 }` and nothing else — no created records — so the
 * caller refetches rather than patching a list from the response.
 *
 * ⚠️ A duplicate shortcode answers `RECORD_ALREADY_EXISTS` with the message
 * *"A record with this unknown field already exists."* The field name never
 * resolves (plan.md O4); the caller re-words it to name the shortcode.
 */
export async function createEmojisBulk(
  packId: string,
  emojis: readonly Omit<CreateEmojiPayload, 'packId'>[],
): Promise<number> {
  /*
   * ⚠️ **The count is the only evidence of what happened.** Measured
   * 2026-10-28: two emojis sent, one a duplicate, answered `201 {count: 1}`.
   * The route skips duplicates silently, so the caller compares this to what
   * it sent — a `201` alone does not mean everything was created.
   */
  const response = await apiClient.post<z.infer<typeof bulkEmojiResultSchema>>(
    `${EMOJIS}/bulk`,
    {
      body: { packId, emojis },
      schema: bulkEmojiResultSchema,
      resource: 'emoji-bulk',
    },
  )
  return response.data.count
}

/* ------------------------------------------------------------------ *
 * Uploads
 * ------------------------------------------------------------------ */

/**
 * Phase one of the two-phase upload: ask for a pre-signed PUT.
 *
 * ⚠️ **MIME is validated per folder**, with a message worth surfacing
 * verbatim: `"Invalid MIME type 'application/x-msdownload' for folder
 * 'gifts'. Allowed: image/png, image/webp, application/json, video/mp4"`.
 */
export async function requestUploadUrl(
  payload: UploadUrlRequest,
): Promise<UploadTarget> {
  const response = await apiClient.post<z.infer<typeof uploadUrlSchema>>(UPLOAD_URL, {
    body: { ...payload },
    schema: uploadUrlSchema,
    resource: 'catalog-upload-url',
  })
  return response.data
}

/**
 * Phase two: PUT the bytes **straight to storage**.
 *
 * ⚠️ **`apiClient` is deliberately not used, and must not be.** This request
 * does not go to our API: it goes to a pre-signed S3 URL that already carries
 * its own credentials in the query string. Sending our `Authorization` header
 * there would leak an admin bearer token to a storage host, and S3 rejects
 * requests whose signed headers do not match anyway.
 *
 * ⚠️ `XMLHttpRequest` rather than `fetch`, for the one reason that still
 * justifies it: upload progress. `fetch` has no request-progress event, and a
 * Lottie file large enough to need a direct-to-storage upload is large enough
 * that a silent bar is a broken one.
 */
export function uploadToStorage(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
  /**
   * ⚠️ Passed explicitly because `file.type` can be empty for a `.json` file
   * (G3). The PUT must carry the same type the `upload-url` request named, or
   * storage serves the file back as `application/octet-stream`.
   */
  contentType: string = file.type,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', uploadUrl, true)
    request.setRequestHeader('Content-Type', contentType)

    request.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    }

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve()
        return
      }
      /*
       * ⚠️ The storage host answers XML, not our JSON envelope, so there is
       * no `error.message` to surface. The status is all there is.
       */
      reject(new Error(`The file could not be uploaded (status ${request.status}).`))
    }

    request.onerror = () =>
      reject(
        new Error('The file could not be uploaded. The storage host did not respond.'),
      )
    request.onabort = () => reject(new Error('The upload was cancelled.'))

    request.send(file)
  })
}

/**
 * The whole two-phase upload: ask for a pre-signed PUT, then send the bytes
 * straight to storage. Answers the `fileUrl` to write into the record.
 *
 * ⚠️ **Touches no cache.** Nothing about the catalog changes until a record
 * is saved with this URL; an uploaded file nobody saved is an orphan in
 * storage, not a catalog state.
 *
 * ⚠️ **Unverified end to end** (plan.md O13): the storage host was
 * unreachable from the machine the contract was measured on, and every signed
 * URL carries the CRC32 of an empty body.
 */
export async function uploadCatalogFile(
  file: File,
  mimetype: string,
  folder: UploadFolder,
  onProgress: (percent: number) => void,
): Promise<string> {
  const target = await requestUploadUrl({ filename: file.name, mimetype, folder })
  await uploadToStorage(target.uploadUrl, file, onProgress, mimetype)
  return target.fileUrl
}
