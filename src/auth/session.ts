import { apiClient } from '@/api/client'
import { UnauthorizedError } from '@/api/errors'
import { envelopeSchema } from '@/types/common'
import {
  currentAdminSchema,
  loginResponseSchema,
  type CurrentAdmin,
  type LoginResponse,
} from '@/types/identity'

import { clearSession, getRefreshToken, parseExpiresIn, setSession } from './tokenStore'

const meEnvelope = envelopeSchema(currentAdminSchema)
const loginEnvelope = envelopeSchema(loginResponseSchema)

/**
 * Paths that must never trigger the refresh-and-retry interceptor.
 *
 * A 401 from any of these IS the answer — retrying `login` after a refresh
 * would be nonsense, and retrying `refresh` itself would recurse.
 */
export const AUTH_PATHS = [
  '/admin/auth/login',
  '/admin/auth/refresh',
  '/admin/auth/logout',
] as const

export function isAuthPath(path: string): boolean {
  return AUTH_PATHS.some((authPath) => path.startsWith(authPath))
}

/* -------------------------------------------------------------------------
 * Sign in
 * ---------------------------------------------------------------------- */

export interface SignInPayload {
  /**
   * The API calls this `identifier`, not `email` — it accepts either an email
   * or a phone number. Kept as the wire name so no translation can drift.
   */
  readonly identifier: string
  readonly password: string
}

/**
 * Sign in and store the credentials.
 *
 * plan.md §10.1: the response carries the tokens in its body rather than
 * setting a cookie, so persisting them is the client's job.
 */
export async function signIn(payload: SignInPayload): Promise<CurrentAdmin> {
  const response = await apiClient.post<{ data: LoginResponse }>('/admin/auth/login', {
    body: { ...payload, platform: 'WEB' },
    schema: loginEnvelope,
    resource: 'sign-in',
  })

  const { user, tokens } = response.data

  setSession({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: parseExpiresIn(tokens.expiresIn),
  })

  return user
}

/* -------------------------------------------------------------------------
 * Session bootstrap
 * ---------------------------------------------------------------------- */

export async function fetchCurrentAdmin(signal?: AbortSignal): Promise<CurrentAdmin> {
  const response = await apiClient.get<{ data: CurrentAdmin }>('/admin/auth/me', {
    schema: meEnvelope,
    resource: 'current admin',
    ...(signal ? { signal } : {}),
  })
  return response.data
}

/* -------------------------------------------------------------------------
 * Refresh
 * ---------------------------------------------------------------------- */

/**
 * Exchange the refresh token for a new access token.
 *
 * ⚠️ **This endpoint is currently broken server-side.** `POST
 * /admin/auth/refresh` exists and validates its body, but rejects every
 * refresh token `POST /admin/auth/login` issues — verified 2026-08-25 against
 * a token seconds old, with and without the `Authorization` header. See the
 * backend asks in plan.md.
 *
 * The client implements the flow anyway, because the correct behaviour is
 * identical either way: attempt a refresh once, and on failure sign the
 * operator out cleanly rather than looping on 401s. When the backend is fixed
 * this silently starts extending sessions with no client change.
 */
export async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  try {
    const response = await apiClient.post<{ data: LoginResponse }>(
      '/admin/auth/refresh',
      {
        body: { refreshToken },
        schema: loginEnvelope,
        resource: 'session refresh',
      },
    )

    const { tokens } = response.data
    setSession({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: parseExpiresIn(tokens.expiresIn),
    })
    return true
  } catch {
    /*
     * Any failure means this session cannot be extended. Swallowing the error
     * is deliberate — the caller's contract is "did the refresh work?", and
     * the 401 that triggered it is the error the operator should see.
     */
    clearSession()
    return false
  }
}

/* -------------------------------------------------------------------------
 * Sign out
 * ---------------------------------------------------------------------- */

/**
 * Sign out of this browser only.
 *
 * `POST /admin/auth/logout` is real and revokes the session server-side, so
 * this is not merely local token disposal — without the call the refresh token
 * would stay valid for its full 7 days after the operator believed they had
 * signed out. Verified live: after the call, both `/admin/auth/me` and
 * `/admin/auth/refresh` reject the old credentials, and other devices on the
 * same account are untouched.
 *
 * ⚠️ The body is mandatory. Sending no payload makes Fastify set
 * `request.body` to `null` and the route schema rejects it with
 * `body/ Expected object, received null` — the same trap that broke the
 * capability-restriction DELETEs. `{}` is the smallest thing that passes.
 *
 * The local credentials are cleared unconditionally. Whether or not the server
 * acknowledges, this browser must stop presenting them; a network failure is
 * not a reason to stay signed in.
 */
export async function signOut(): Promise<void> {
  try {
    await apiClient.post<unknown>('/admin/auth/logout', { body: {} })
  } catch {
    /* Best effort. The local clear below is what actually ends the session here. */
  } finally {
    clearSession()
  }
}

/**
 * Sign out of every device on this admin account.
 *
 * The same route with `{ allDevices: true }`. Verified against the live API
 * that the field exists and is an optional boolean — a wrong type is rejected
 * with `body/allDevices Expected boolean, received string`, and validation
 * runs ahead of authentication, which is how the schema was confirmed without
 * revoking anybody's session to find out.
 *
 * Two deliberate differences from {@link signOut}:
 *
 * 1. **Failures are not swallowed.** A best-effort global sign-out is worse
 *    than none: the operator walks away believing every other device is dead.
 *    The error propagates so the UI can say the opposite, and `clearSession`
 *    below is never reached — nothing was revoked, so this browser is still
 *    legitimately signed in and must not pretend otherwise.
 *
 * 2. **A second, plain logout follows.** Whether `allDevices` also kills the
 *    *calling* session is the one thing that could not be established without
 *    signing out the eight live sessions on the production admin account. If
 *    it does, this second call is a harmless 401. If it does not, it is the
 *    difference between a dead refresh token and one that stays valid for
 *    seven days after the operator asked for exactly the opposite. Once the
 *    behaviour is confirmed against a disposable account, delete it.
 */
export async function signOutEverywhere(): Promise<void> {
  await apiClient.post<unknown>('/admin/auth/logout', { body: { allDevices: true } })

  try {
    await apiClient.post<unknown>('/admin/auth/logout', { body: {} })
  } catch {
    /* Expected 401 when the call above already revoked this session. */
  }

  clearSession()
}

/* -------------------------------------------------------------------------
 * Self-service credential changes
 * ---------------------------------------------------------------------- */

export interface ChangePasswordPayload {
  readonly currentPassword: string
  readonly newPassword: string
  readonly confirmPassword: string
}

/**
 * `PATCH /admin/auth/password`.
 *
 * Note the collection documents this at `/admin/auth/email` — that is a
 * documentation error; the real path is `/admin/auth/password`, verified live.
 */
export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiClient.patch<unknown>('/admin/auth/password', { body: payload })
}

export interface ChangeEmailPayload {
  readonly newEmail: string
  /** Current password — the endpoint re-verifies identity for this change. */
  readonly password: string
}

export async function changeEmail(payload: ChangeEmailPayload): Promise<void> {
  await apiClient.patch<unknown>('/admin/auth/email', { body: payload })
}

/**
 * Collapse the API's two distinct sign-in rejections into one message.
 *
 * ⚠️ The backend answers `"Invalid email or password."` for a wrong password
 * but `"Invalid credentials. No admin account found."` for an unknown
 * identifier. That difference lets anyone enumerate which admin accounts
 * exist, and it contradicts this project's own acceptance criterion that a
 * failed sign-in must not reveal which half was wrong.
 *
 * Normalising here closes the leak in this client. It does NOT fix the API —
 * anyone calling it directly still sees the difference, so the backend must
 * still be corrected. Reported in plan.md's backend asks.
 */
export function signInErrorMessage(error: unknown): string {
  if (error instanceof UnauthorizedError) {
    return 'Those sign-in details were not recognised.'
  }
  return 'Sign-in failed. Try again.'
}
