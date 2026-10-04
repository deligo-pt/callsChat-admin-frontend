import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  createAnnouncement,
  deleteAnnouncement,
  fetchAnnouncementStats,
  fetchAnnouncements,
  setAnnouncementPin,
  updateAnnouncement,
  uploadAnnouncementMedia,
  type AnnouncementPage,
} from '@/api/announcements'
import { queryKeys } from '@/api/queryKeys'
import type {
  AnnouncementListQuery,
  AnnouncementUpdatePayload,
  AnnouncementWritePayload,
} from '@/types/announcement'

/**
 * Announcement queries (plan.md §7, phase B2).
 *
 * Three rules, all inherited from §2–§3 rather than chosen here:
 *
 * - **`staleTime: 0`.** More than one operator can publish, and a cached page
 *   would show a draft that a colleague published a minute ago — so two people
 *   could broadcast the same message twice to every user on the platform.
 * - **No write ever seeds this cache.** There is no `GET /admin/announcements/:id`
 *   to refetch a single record (§3.2), and the write responses are unobserved
 *   (O5), so the list is the only thing that may draw a screen.
 * - **`stats` lives under the same root** so publishing refreshes the counters
 *   in the queue header. It takes no parameters: the endpoint is platform-wide
 *   and ignores every filter.
 */

/**
 * The queue — `GET /admin/announcements`.
 *
 * `keepPreviousData` keeps the current page on screen while the next one loads.
 * Without it, paging or changing a filter blanks the table to a skeleton, which
 * reads as a broken page rather than a loading one.
 */
export function useAnnouncementListQuery(query: AnnouncementListQuery) {
  return useQuery({
    queryKey: queryKeys.announcements.list(query),
    queryFn: ({ signal }) => fetchAnnouncements(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
}

/**
 * The counters — `GET /admin/announcements/stats`.
 *
 * ⚠️ Platform-wide, and **the only reach reporting that exists** — no endpoint
 * breaks read receipts down per announcement (O10). Whatever surface shows
 * these numbers must not let them read as describing the filtered queue beside
 * them.
 *
 * A failure here must never look like a failure of the queue it decorates, so
 * the caller renders the strip only when data arrives and the table stands on
 * its own. Hence `retry: false` — one quiet miss, not three.
 */
export function useAnnouncementStatsQuery() {
  return useQuery({
    queryKey: queryKeys.announcements.stats(),
    queryFn: ({ signal }) => fetchAnnouncementStats(signal),
    staleTime: 0,
    retry: false,
  })
}

/**
 * Pin or unpin one row — `POST /admin/announcements/:id/pin`.
 *
 * **Optimistic, and this is the one write in the module that should be.** It
 * changes a single boolean, the operator is looking straight at the control
 * they just pressed, and a pin is trivially reversible — so waiting out a round
 * trip buys nothing and makes the list feel broken. Every other write
 * (create, update, delete) changes what the whole platform sees and refetches
 * instead.
 *
 * ⚠️ **The rollback is the important half.** `onMutate` snapshots every cached
 * list page before patching, and `onError` restores all of them, because the
 * row may be visible in more than one cached query — the unfiltered view and a
 * `?pinned=true` view hold the same record, and a failed pin that was only
 * rolled back in one of them would leave the two disagreeing.
 *
 * ⚠️ **The patch deliberately does not re-sort.** Pinned rows sort first, so a
 * correct optimistic update would make the row jump to the top of the table
 * under the operator's cursor. Letting the refetch in `onSettled` reorder it
 * keeps the badge instant and the movement attributable.
 *
 * `retry: false`: a retried pin is harmless in its end state, but the operator
 * has already seen the result and a late second attempt would make the control
 * flicker after they moved on.
 */
export function useAnnouncementPinMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) =>
      setAnnouncementPin(id, isPinned),
    retry: false,

    onMutate: async ({ id, isPinned }) => {
      /* Stop an in-flight refetch from landing on top of the patch. */
      await queryClient.cancelQueries({ queryKey: queryKeys.announcements.lists() })

      const snapshots = queryClient.getQueriesData<AnnouncementPage>({
        queryKey: queryKeys.announcements.lists(),
      })

      for (const [key, page] of snapshots) {
        if (!page) continue
        queryClient.setQueryData<AnnouncementPage>(key, {
          ...page,
          data: page.data.map((row) => (row.id === id ? { ...row, isPinned } : row)),
        })
      }

      return { snapshots }
    },

    onError: (_error, _variables, context) => {
      for (const [key, page] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, page)
      }
    },

    /*
     * ⚠️ `all`, not `lists()`: pinning moves `totalPinned` in the stats strip,
     * and leaving that stale would show a count that disagrees with the badges
     * directly below it. Runs after success *and* after a rollback, so the
     * server always gets the last word.
     */
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all })
    },
  })
}

/**
 * Create — `POST /admin/announcements` (plan.md §7, phase B3).
 *
 * ⚠️ **With `status: 'PUBLISHED'` this reaches every user on the platform
 * before the response comes back.** `broadcast.md` §2 emits `announcement:new`
 * across the global socket cluster and fires an in-app toast the moment a
 * record is published, and there is no unsend. The caller confirms first; this
 * hook does not, because a hook is the wrong place for intent.
 *
 * **Not optimistic, unlike the pin.** A pin flips one boolean on a row the
 * operator is looking at; this adds a row whose server-assigned id, timestamps
 * and author expansion are all unknown (O5). Inventing a placeholder row would
 * mean inventing those, and the invented values would be visible.
 *
 * `retry: false`: a blind retry of a create is a **second broadcast**. Even
 * where the first attempt actually succeeded and only the response was lost,
 * retrying publishes the same message to everyone twice.
 */
export function useCreateAnnouncementMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: AnnouncementWritePayload) => createAnnouncement(payload),
    retry: false,
    onSuccess: async () => {
      /*
       * `all`, so the stats strip moves with the queue. Nothing is seeded from
       * the response — there is no detail route to reconcile against, and the
       * write shapes are unobserved (§3.2).
       */
      await queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all })
    },
  })
}

/**
 * Update — `PATCH /admin/announcements/:id`.
 *
 * ⚠️ **A `PATCH` can publish.** Moving `status` from `DRAFT` to `PUBLISHED`
 * broadcasts exactly as a create does, so an edit form is not a safe surface by
 * virtue of being an edit. The caller confirms a status change the same way it
 * confirms a create.
 *
 * ⚠️ **It merges, so an omitted key is left alone rather than cleared.** That is
 * what makes `buildWritePayload` omit empty optional strings instead of sending
 * `""` — and also what makes clearing an existing CTA or attachment impossible
 * from this form (O15).
 *
 * `retry: false` for the same reason as create: a retried publish is a second
 * broadcast.
 */
export function useUpdateAnnouncementMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AnnouncementUpdatePayload }) =>
      updateAnnouncement(id, payload),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all })
    },
  })
}

/**
 * Delete — `DELETE /admin/announcements/:id`.
 *
 * ⚠️ **Irreversible, and it destroys the media too.** `broadcast.md` §4 states
 * the handler cleans the object out of RustFS, and since `/media/upload` has no
 * delete route of its own this is the *only* path in existence that ever
 * removes an uploaded file (§3.4). Deleting a published announcement therefore
 * destroys bytes that cannot be recovered, for a message every user has already
 * received — and nothing recalls the message itself.
 *
 * **Not optimistic**, deliberately. Removing the row before the server confirms
 * would show the operator a completed deletion that may not have happened, and
 * the mistake they would make next — assuming it is gone — is the expensive one.
 */
export function useDeleteAnnouncementMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteAnnouncement(id),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all })
    },
  })
}

/**
 * Upload one attachment — `POST /api/v1/media/upload`.
 *
 * ⚠️ **A one-way door onto a public, unauthenticated CDN** (§3.4). Two rules
 * bind every caller, and neither can be enforced here:
 *
 * 1. **Validate first**, with `isAllowedAnnouncementMedia`. The server performs
 *    no MIME, extension or size check whatsoever — it stored a `text/plain`
 *    file during contract probing — so that gate is the only one there is, and
 *    it is a UX gate rather than a security boundary.
 * 2. **Call this last.** On commit, never on file selection, so an abandoned
 *    draft leaves no permanent public orphan. There is no delete route to clean
 *    one up with.
 *
 * No cache invalidation: an upload changes no announcement. It returns a url and
 * a key for the caller to put in a write payload.
 */
export function useUploadAnnouncementMediaMutation() {
  return useMutation({
    mutationFn: (file: File) => uploadAnnouncementMedia(file),
    retry: false,
  })
}
