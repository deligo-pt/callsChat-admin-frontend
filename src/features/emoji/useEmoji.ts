import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createEmoji,
  createEmojiPack,
  createEmojisBulk,
  deactivateEmoji,
  deactivateEmojiPack,
  fetchCatalogVersion,
  fetchEmojiPacks,
  reorderEmojiPacks,
  reorderEmojis,
  updateEmoji,
  updateEmojiPack,
  uploadCatalogFile,
} from '@/api/catalog'
import { queryKeys } from '@/api/queryKeys'
import type {
  CreateEmojiPackPayload,
  CreateEmojiPayload,
  ReorderPayload,
  UpdateEmojiPackPayload,
  UpdateEmojiPayload,
  UploadFolder,
} from '@/types/catalog'

/**
 * Reading and writing emoji packs (plan.md §4, phase G4).
 *
 * ⚠️ **One query.** `GET /admin/emoji/packs` nests every emoji, inactive ones
 * included, so the pack list *is* the emoji list — and it is the list
 * `shortcodeOwner` searches, which is why inactive rows must never be
 * filtered out before it sees them.
 */
export function useEmojiPacksQuery() {
  return useQuery({
    queryKey: queryKeys.emojiPacks.list(),
    queryFn: ({ signal }) => fetchEmojiPacks(signal),
    staleTime: 0,
  })
}

/** `emojiVersion` from `GET /catalog/version`, bumped by every write here. */
export function useEmojiVersionQuery() {
  return useQuery({
    queryKey: queryKeys.emojiPacks.detail('catalog-version'),
    queryFn: ({ signal }) => fetchCatalogVersion(signal),
    staleTime: 0,
  })
}

/**
 * ⚠️ **Every write invalidates `emojiPacks.all` and none paints from its
 * response** — the bulk route answers a bare count, so there is nothing to
 * paint from even if we wanted to.
 */
function useEmojiWrite<TVariables, TResult = void>(
  write: (variables: TVariables) => Promise<TResult>,
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: write,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.emojiPacks.all })
    },
  })
}

export type ReorderTarget = 'packs' | 'emojis'

export function useReorderMutation() {
  return useEmojiWrite(
    ({ target, payload }: { target: ReorderTarget; payload: ReorderPayload }) =>
      target === 'packs' ? reorderEmojiPacks(payload) : reorderEmojis(payload),
  )
}

export function useCreatePackMutation() {
  return useEmojiWrite((payload: CreateEmojiPackPayload) => createEmojiPack(payload))
}

export function useUpdatePackMutation() {
  return useEmojiWrite(
    ({ id, payload }: { id: string; payload: UpdateEmojiPackPayload }) =>
      updateEmojiPack(id, payload),
  )
}

/** Soft `DELETE` off, `PATCH {isActive: true}` on — the gift catalog's pair. */
export function useSetPackActiveMutation() {
  return useEmojiWrite(({ id, active }: { id: string; active: boolean }) =>
    active ? updateEmojiPack(id, { isActive: true }) : deactivateEmojiPack(id),
  )
}

export function useCreateEmojiMutation() {
  return useEmojiWrite((payload: CreateEmojiPayload) => createEmoji(payload))
}

export function useUpdateEmojiMutation() {
  return useEmojiWrite(({ id, payload }: { id: string; payload: UpdateEmojiPayload }) =>
    updateEmoji(id, payload),
  )
}

export function useSetEmojiActiveMutation() {
  return useEmojiWrite(({ id, active }: { id: string; active: boolean }) =>
    active ? updateEmoji(id, { isActive: true }) : deactivateEmoji(id),
  )
}

export function useBulkEmojiMutation() {
  return useEmojiWrite(
    ({
      packId,
      emojis,
    }: {
      packId: string
      emojis: readonly Omit<CreateEmojiPayload, 'packId'>[]
    }) => createEmojisBulk(packId, emojis),
  )
}

export function uploadEmojiFile(
  file: File,
  mimetype: string,
  folder: Extract<UploadFolder, 'emojis' | 'packs'>,
  onProgress: (percent: number) => void,
): Promise<string> {
  return uploadCatalogFile(file, mimetype, folder, onProgress)
}
