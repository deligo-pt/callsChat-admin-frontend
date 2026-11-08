import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { NotFoundError } from '@/api/errors'
import {
  createLegalDocument,
  deleteLegalDocument,
  fetchAllLegalDocuments,
  fetchLegalDocument,
  publishLegalDocument,
  updateLegalDocument,
} from '@/api/legal'
import { queryKeys } from '@/api/queryKeys'
import type {
  LegalDocumentCreate,
  LegalDocumentUpdate,
  LegalPublishInput,
} from '@/types/legal'

/**
 * Reads and writes for the legal module (plan.md LG1, LG3).
 *
 * The whole collection is one query: there are four types and a handful of
 * versions each, the server ignores `search`, and every tab and card is a view
 * of the same rows. Filtering happens here, not in the URL sent to the API.
 *
 * Every write invalidates everything under `legal`: a publish archives a
 * different row, so no single record can be patched in isolation.
 */
export function useLegalDocuments() {
  return useQuery({
    queryKey: queryKeys.legal.list({}),
    queryFn: ({ signal }) => fetchAllLegalDocuments({}, signal),
  })
}

export function useLegalDocument(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.legal.detail(id ?? ''),
    queryFn: ({ signal }) => fetchLegalDocument(id ?? '', signal),
    enabled: Boolean(id),
    retry: (count, error) => (error instanceof NotFoundError ? false : count < 1),
  })
}

export function useCreateLegalDocument() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (payload: LegalDocumentCreate) => {
      const created = await createLegalDocument(payload)
      /*
       * ⚠️ Server quirk (plan.md O5): on CREATE a sent subtitle is stored as
       * the intro, while an UPDATE re-derives the intro from the Markdown
       * (both measured). Re-sending the content straight away puts the right
       * intro in place. If this second call fails, the draft still exists and
       * the next save fixes the intro, so the error is not surfaced as a
       * failed create.
       */
      if (payload.subtitle) {
        try {
          return await updateLegalDocument(created.id, {
            contentMarkdown: payload.contentMarkdown,
          })
        } catch {
          return created
        }
      }
      return created
    },
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.legal.all }),
  })
}

export function useUpdateLegalDocument(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (payload: LegalDocumentUpdate) => updateLegalDocument(id, payload),
    onSuccess: (doc) => client.setQueryData(queryKeys.legal.detail(id), doc),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.legal.all }),
  })
}

export function useDeleteLegalDocument() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteLegalDocument(id),
    onSuccess: (_message, id) =>
      client.removeQueries({ queryKey: queryKeys.legal.detail(id) }),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.legal.lists() }),
  })
}

/**
 * ⚠️ Irreversible. Refetches everything afterwards rather than trusting the
 * response, whose shape is unmeasured (plan.md O1).
 */
export function usePublishLegalDocument() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LegalPublishInput }) =>
      publishLegalDocument(id, payload),
    /*
     * ⚠️ Not awaited. Returning the promise makes TanStack wait for the refetch
     * before the caller's `onSuccess`. By then the edit page has re-rendered the
     * now-PUBLISHED doc as "can't be edited", which unmounts the dialog. Its
     * `onSuccess` — the redirect to History — is then dropped, and the operator
     * is left on the edit URL. Firing the refetch without waiting lets the
     * redirect happen first.
     */
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.legal.all })
    },
  })
}
