import { apiClient } from '@/api/client'
import type {
  AccountStatus,
  Capability,
  SuspensionReason,
  UserRole,
} from '@/types/identity'

/**
 * User-management mutations (plan.md §10.3).
 *
 * Every payload below was verified against the live API by submitting invalid
 * values and reading the rejection — no state was changed to learn them.
 *
 * These use the dedicated command endpoints (`/suspend`, `/ban`, …) rather than
 * the generic `POST /status`. plan.md §10 is explicit that sensitive
 * transitions go through explicit commands: a command carries intent, so the
 * audit record says "banned" rather than "status set to BANNED", and the
 * backend can attach different side effects to each.
 */

function path(userId: string, suffix = ''): string {
  return `/admin/users/${encodeURIComponent(userId)}${suffix}`
}

/* ---------------------------------------------------------------- Status */

export interface SuspendPayload {
  /** Enum, NOT free text — unlike `ban`, whose reason is a plain string. */
  readonly reason: SuspensionReason
  /** Operator's own words. The enum above is the category. */
  readonly description?: string
  /** ISO-8601. Omit for an indefinite suspension. */
  readonly expiresAt?: string
  readonly revokeSessions?: boolean
}

export async function suspendUser(
  userId: string,
  payload: SuspendPayload,
): Promise<void> {
  await apiClient.post<unknown>(path(userId, '/suspend'), { body: payload })
}

/**
 * Lift a suspension.
 *
 * ⚠️ The API requires NO fields here — it accepts an empty body and performs
 * the change, unlike every sibling action. A `reason` is sent regardless
 * because an unexplained state change is useless in an audit trail; the UI
 * enforces it even though the server does not.
 */
export async function unsuspendUser(userId: string, reason: string): Promise<void> {
  await apiClient.post<unknown>(path(userId, '/unsuspend'), { body: { reason } })
}

/** `reason` is free text here, not the suspension enum. */
export async function banUser(userId: string, reason: string): Promise<void> {
  await apiClient.post<unknown>(path(userId, '/ban'), { body: { reason } })
}

export async function restoreUser(userId: string, reason: string): Promise<void> {
  await apiClient.post<unknown>(path(userId, '/restore'), { body: { reason } })
}

/* ------------------------------------------------------------------ Role */

export async function changeUserRole(
  userId: string,
  role: UserRole,
  reason: string,
): Promise<void> {
  await apiClient.patch<unknown>(path(userId, '/role'), { body: { role, reason } })
}

/* --------------------------------------------------------- Profile edits */

/**
 * `PATCH /admin/users/:id/profile`.
 *
 * Every field is optional server-side — an empty body is accepted and treated
 * as a no-op. The UI still sends only what changed, so the audit entry reflects
 * the actual edit rather than a full-record rewrite.
 *
 * ⚠️ `phone` is **not validated by the backend**: any string is accepted,
 * including one that is not a phone number. The form validates it client-side
 * for that reason, which is a UX guard and not a guarantee.
 */
export interface UpdateProfilePayload {
  readonly displayName?: string
  readonly username?: string
  readonly bio?: string
  readonly gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY'
  readonly dateOfBirth?: string
  readonly country?: string
  readonly timezone?: string
  readonly language?: string
  readonly phone?: string
  readonly phoneVerified?: boolean
  readonly reason: string
}

export async function updateUserProfile(
  userId: string,
  payload: UpdateProfilePayload,
): Promise<void> {
  await apiClient.patch<unknown>(path(userId, '/profile'), { body: payload })
}

export interface UpdateUserEmailPayload {
  readonly email: string
  readonly emailVerified?: boolean
  readonly reason: string
}

export async function updateUserEmail(
  userId: string,
  payload: UpdateUserEmailPayload,
): Promise<void> {
  await apiClient.patch<unknown>(path(userId, '/email'), { body: payload })
}

/* ---------------------------------------------------------- Restrictions */

export interface AddRestrictionPayload {
  readonly capability: Capability
  readonly reason: string
  /** ISO-8601. Omit for an indefinite restriction. */
  readonly expiresAt?: string
}

export async function addRestriction(
  userId: string,
  payload: AddRestrictionPayload,
): Promise<void> {
  await apiClient.post<unknown>(path(userId, '/restrictions'), { body: payload })
}

/**
 * Lift a capability restriction.
 *
 * ⚠️ This DELETE **requires a JSON body**. Sending none — the obvious reading
 * of a DELETE that identifies its target entirely in the path — makes Fastify
 * set `request.body` to `null`, and the route's schema rejects it before the
 * handler runs: `body/ Expected object, received null`.
 *
 * Verified against the live API by probing a non-existent restriction id (so
 * nothing could be deleted to learn this): `{}` gets past validation to a 404,
 * so every field is optional and only the object itself is mandatory. Unknown
 * keys are accepted too, which means the server never confirms it *stores* the
 * reason — we send it because an unexplained capability change is useless in an
 * audit trail, the same stance taken for `unsuspend` and `revoke-all`.
 */
export async function removeRestriction(
  userId: string,
  restrictionId: string,
  reason: string,
): Promise<void> {
  await apiClient.delete<unknown>(
    path(userId, `/restrictions/${encodeURIComponent(restrictionId)}`),
    { body: { reason } },
  )
}

/* -------------------------------------------------------------- Sessions */

/**
 * Revoke one session.
 *
 * ⚠️ Same contract as `removeRestriction`: the DELETE requires a JSON body and
 * rejects a bodyless request with `body/ Expected object, received null`. All
 * fields are optional — verified by probing a non-existent session id, which
 * reaches a 404 rather than a validation error.
 */
export async function revokeSession(
  userId: string,
  sessionId: string,
  reason: string,
): Promise<void> {
  await apiClient.delete<unknown>(
    path(userId, `/sessions/${encodeURIComponent(sessionId)}`),
    { body: { reason } },
  )
}

/**
 * Revoke every session.
 *
 * ⚠️ Like `unsuspend`, the API accepts an empty body and executes. The reason
 * is sent anyway so the action is attributable.
 */
export async function revokeAllSessions(userId: string, reason: string): Promise<void> {
  await apiClient.post<unknown>(path(userId, '/sessions/revoke-all'), {
    body: { reason },
  })
}

/* ------------------------------------------------------------ Transitions */

export type UserAction =
  'suspend' | 'unsuspend' | 'ban' | 'restore' | 'restrict' | 'revokeSessions'

/**
 * Which status transitions are offered for a given state.
 *
 * ⚠️ plan.md Phase 3 asks the UI to render "only backend-provided valid
 * transitions". **The API does not provide them** — no endpoint returns the
 * legal next states — so this map is derived client-side and is therefore a
 * documented deviation, not the intended design. It is deliberately the only
 * place the rule lives so it is one edit when the backend starts supplying it.
 *
 * The backend re-validates every transition regardless; an illegal one fails
 * server-side and the operator sees the error. This map only decides which
 * buttons are worth showing.
 */
export function availableStatusActions(status: AccountStatus): readonly UserAction[] {
  switch (status) {
    case 'BANNED':
      return ['restore']
    case 'SUSPENDED':
      return ['unsuspend', 'ban']
    // ACTIVE, INACTIVE and PENDING_VERIFICATION can all be suspended or banned.
    default:
      return ['suspend', 'ban']
  }
}
