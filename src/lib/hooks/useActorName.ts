import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'

import { queryKeys } from '@/api/queryKeys'
import { fetchStaffList } from '@/api/staff'
import { PERMISSIONS } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { adminDisplayName } from '@/types/identity'

/**
 * Turn an actor id into a human name.
 *
 * ⚠️ **Every record in this panel that names who did something names them with a
 * bare cuid** — `updatedBy` on the settings and bootstrap records, `actorId` on
 * a verification's audit rows. On screen that reads `by cmt8ork…oifg2v`, which
 * tells an operator nothing and is the same for every row they look at.
 *
 * The backend already solves this elsewhere: `/admin/audit-logs` returns
 * `actorName` beside `actorId`, and the ops settings return `updatedByName`
 * (`types/ops.ts`). **The right fix is for these endpoints to do the same**, and
 * when they do, callers should prefer the payload's own name and this hook
 * becomes dead weight worth deleting. Until then it resolves from two sources:
 *
 * 1. **The signed-in admin**, from `/admin/auth/me`, which `AuthProvider` has
 *    already loaded. This costs no request and needs no permission, and it
 *    covers the overwhelmingly common case — most "Updated by" lines name the
 *    person reading them.
 * 2. **The staff directory**, for colleagues.
 *
 * ⚠️ **Source 2 is Super-Admin-only, and that is a real limitation, not an
 * oversight.** All eight `/admin/staff/*` routes are `verifySuperAdmin`-guarded,
 * so an Admin or a compliance officer sees their own name and ids for everyone
 * else — two operators can read the same audit row and see different things.
 * That is the cost of resolving client-side, and it disappears entirely once the
 * backend expands the actor. The fetch is **gated on the permission** rather
 * than fired and allowed to 403, so no screen makes a request it is known to be
 * refused.
 *
 * ⚠️ **Not every actor is staff.** A verification's `SUBMITTED` row is written
 * by the *applicant* — an ordinary user, absent from the staff directory — so it
 * keeps its id. Callers must render the id as a fallback and never assume a
 * name.
 */

/** One page is plenty: the directory is small and this is a lookup, not a list. */
const DIRECTORY_LIMIT = 100

export function useActorName(): (id: string | null | undefined) => string | null {
  const { admin, can } = useAuth()

  const mayReadDirectory = can(PERMISSIONS.staffManage)

  const directory = useQuery({
    queryKey: queryKeys.staff.list({ page: 1, limit: DIRECTORY_LIMIT }),
    queryFn: ({ signal }) =>
      fetchStaffList({ page: 1, limit: DIRECTORY_LIMIT }, signal),
    enabled: mayReadDirectory,
    /* A name does not change while an operator reads one screen. */
    staleTime: 5 * 60_000,
    /*
     * A failure here must never look like a failure of the page it decorates.
     * The caller falls back to the id, which is exactly what it showed before.
     */
    retry: false,
  })

  const staff = directory.data?.data

  return useCallback(
    (id: string | null | undefined): string | null => {
      if (!id) return null
      if (admin && admin.id === id) return adminDisplayName(admin)

      const match = staff?.find((member) => member.id === id)
      if (!match) return null

      return match.displayName ?? match.username ?? match.email
    },
    [admin, staff],
  )
}
