import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createGift,
  createGiftCategory,
  deactivateGift,
  deactivateGiftCategory,
  fetchCatalogVersion,
  fetchGiftCategories,
  reorderGiftCategories,
  reorderGifts,
  updateGift,
  updateGiftCategory,
  uploadCatalogFile,
} from '@/api/catalog'
import { queryKeys } from '@/api/queryKeys'
import type {
  CreateGiftCategoryPayload,
  CreateGiftPayload,
  ReorderPayload,
  UpdateGiftCategoryPayload,
  UpdateGiftPayload,
} from '@/types/catalog'

/**
 * Reading and ordering the gift catalog (plan.md §4, phase G2).
 *
 * ⚠️ **One query, not two.** `GET /admin/gifts/categories` nests every gift,
 * inactive ones included, so the category list *is* the gift list. A second
 * `GET /admin/gifts` would be a second copy of the same rows that could
 * disagree with the first mid-refetch.
 */
export function useGiftCatalogQuery() {
  return useQuery({
    queryKey: queryKeys.gifts.list({ view: 'categories' }),
    queryFn: ({ signal }) => fetchGiftCategories(signal),
    staleTime: 0,
  })
}

/**
 * `GET /catalog/version` — bumped by every write, measured.
 *
 * Shown so an operator can tell their change reached the cache clients read
 * from, rather than taking a toast's word for it.
 */
export function useCatalogVersionQuery() {
  return useQuery({
    queryKey: queryKeys.gifts.detail('catalog-version'),
    queryFn: ({ signal }) => fetchCatalogVersion(signal),
    staleTime: 0,
  })
}

export type ReorderTarget = 'categories' | 'gifts'

/**
 * ⚠️ **Invalidates `gifts.all`, which covers the version as well as the
 * list.** A reorder bumps `giftVersion`; refetching only the list would leave
 * the version line claiming the old number beside the new order.
 */
export function useReorderMutation() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({
      target,
      payload,
    }: {
      target: ReorderTarget
      payload: ReorderPayload
    }) =>
      target === 'categories' ? reorderGiftCategories(payload) : reorderGifts(payload),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.gifts.all })
    },
  })
}

/* ------------------------------------------------------------------ *
 * Writes — phase G3
 * ------------------------------------------------------------------ */

/**
 * ⚠️ **Every write invalidates `gifts.all` and none paints from its
 * response** — the same rule as the reorder above, for the same reason: the
 * version moves with every write, and the nested list is the only source of
 * truth for both categories and gifts.
 */
function useCatalogWrite<TVariables>(write: (variables: TVariables) => Promise<void>) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: write,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.gifts.all })
    },
  })
}

export function useCreateGiftMutation() {
  return useCatalogWrite((payload: CreateGiftPayload) => createGift(payload))
}

export function useUpdateGiftMutation() {
  return useCatalogWrite(
    ({ id, payload }: { id: string; payload: UpdateGiftPayload }) =>
      updateGift(id, payload),
  )
}

/**
 * Off sale or back on. ⚠️ Deactivation is the route's soft `DELETE`;
 * reactivation is `PATCH {isActive: true}` — there is no "restore" route, and
 * both were verified on a probe gift.
 */
export function useSetGiftActiveMutation() {
  return useCatalogWrite(({ id, active }: { id: string; active: boolean }) =>
    active ? updateGift(id, { isActive: true }) : deactivateGift(id),
  )
}

export function useCreateCategoryMutation() {
  return useCatalogWrite((payload: CreateGiftCategoryPayload) =>
    createGiftCategory(payload),
  )
}

export function useUpdateCategoryMutation() {
  return useCatalogWrite(
    ({ id, payload }: { id: string; payload: UpdateGiftCategoryPayload }) =>
      updateGiftCategory(id, payload),
  )
}

export function useSetCategoryActiveMutation() {
  return useCatalogWrite(({ id, active }: { id: string; active: boolean }) =>
    active ? updateGiftCategory(id, { isActive: true }) : deactivateGiftCategory(id),
  )
}

/**
 * The gift's half of the two-phase upload — `catalog/gifts`. See
 * `uploadCatalogFile`.
 */
export function uploadGiftFile(
  file: File,
  mimetype: string,
  onProgress: (percent: number) => void,
): Promise<string> {
  return uploadCatalogFile(file, mimetype, 'gifts', onProgress)
}
