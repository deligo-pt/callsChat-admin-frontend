import { z } from 'zod'

import { apiClient } from '@/api/client'

/**
 * Just a person's name, from `GET /admin/users/:id`.
 *
 * For views that hold a bare user id — the wallet ledger's adjusting admin is
 * one (its `refId`) — and need to show who it is. A loose read of
 * `identity` only: a schema change elsewhere in the record must not stop a
 * name from showing. Admins are user records too (measured: the staging
 * Super Admin answers here as "Super Administrator").
 *
 * Lives in `api/` because the full fetcher is in `features/users`, and a
 * feature may not import a sibling feature.
 */
const userNameEnvelope = z.looseObject({
  data: z.looseObject({
    identity: z.looseObject({
      id: z.string(),
      displayName: z.string().nullable().optional(),
      username: z.string().nullable().optional(),
    }),
  }),
})

export interface UserName {
  readonly id: string
  readonly displayName: string | null
  readonly username: string | null
}

export async function fetchUserName(
  userId: string,
  signal?: AbortSignal,
): Promise<UserName> {
  const response = await apiClient.get<z.infer<typeof userNameEnvelope>>(
    `/admin/users/${encodeURIComponent(userId)}`,
    {
      schema: userNameEnvelope,
      resource: 'user',
      ...(signal ? { signal } : {}),
    },
  )
  const { identity } = response.data
  return {
    id: identity.id,
    displayName: identity.displayName?.trim() || null,
    username: identity.username?.trim() || null,
  }
}
