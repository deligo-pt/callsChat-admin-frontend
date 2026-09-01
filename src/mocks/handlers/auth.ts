import { http, HttpResponse } from 'msw'

import type { AdminRole, CurrentAdmin } from '@/types/identity'

import { API_PREFIX, applyScenario, errorResponse } from './shared'

/**
 * Mock admin accounts.
 *
 * plan.md §10.1: the real API authenticates with a bearer token and returns
 * `{ data: { user, tokens } }`, so this mock does the same — including issuing
 * a token the client must then present. Mirroring the credential flow is what
 * makes the mock a usable rehearsal for the live backend rather than a
 * convenient fiction.
 *
 * Roles match the VERIFIED enum: the mid-tier role is `ADMIN`, not the
 * previously assumed `OPERATIONS_ADMIN`.
 */
const ACCOUNTS: Readonly<
  Record<string, { displayName: string; username: string; role: AdminRole }>
> = {
  'nadia@callschat.app': {
    displayName: 'Nadia Chowdhury',
    username: 'nadia',
    role: 'SUPER_ADMIN',
  },
  'tomas@callschat.app': {
    displayName: 'Tomas Ricci',
    username: 'tomas',
    role: 'ADMIN',
  },
  'elena@callschat.app': {
    displayName: 'Elena Petrova',
    username: 'elena',
    role: 'MODERATOR',
  },
}

const SESSION_KEY = 'callschat.mock.session'
const PASSWORD_KEY = 'callschat.mock.password'
const REFRESH_KEY = 'callschat.mock.refresh'

/**
 * The mock accepts ANY non-empty password until one is explicitly set through
 * the change-password endpoint. That keeps the documented "any password works"
 * sign-in true, while still making the change-password flow genuinely
 * testable: after a change, only the new password works.
 */
function readPassword(): string | null {
  return globalThis.localStorage?.getItem(PASSWORD_KEY) ?? null
}

function passwordMatches(candidate: string | undefined): boolean {
  if (!candidate) return false
  const stored = readPassword()
  return stored === null ? true : stored === candidate
}

/** Mirrors the server's policy exactly — see features/auth/passwordPolicy.ts. */
function passwordPolicyError(password: string): string | null {
  if (password.length < 8) {
    return 'body/newPassword New password must be at least 8 characters long'
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'body/newPassword Password must contain at least one uppercase letter, one lowercase letter, and one number'
  }
  return null
}

function readSession(): CurrentAdmin | null {
  const raw = globalThis.localStorage?.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CurrentAdmin
  } catch {
    return null
  }
}

function writeSession(admin: CurrentAdmin | null): void {
  if (admin) globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(admin))
  else globalThis.localStorage?.removeItem(SESSION_KEY)
}

export const authHandlers = [
  http.get(`${API_PREFIX}/admin/auth/me`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    /*
     * Require the bearer header the real API requires. Without this check the
     * mock would authenticate on ambient session state alone, and a bug where
     * the client forgets to attach the token would pass locally and fail only
     * in production — exactly the class of defect the mock exists to catch.
     */
    if (!request.headers.get('Authorization')?.startsWith('Bearer ')) {
      return errorResponse(401, 'UNAUTHORIZED', 'Invalid or expired access token')
    }

    const session = readSession()
    if (!session) {
      return errorResponse(401, 'UNAUTHORIZED', 'Invalid or expired access token')
    }

    return HttpResponse.json({ success: true, data: session })
  }),

  http.post(`${API_PREFIX}/admin/auth/login`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = (await request.json()) as {
      identifier?: string
      password?: string
      platform?: string
    }
    const identifier = body.identifier?.toLowerCase().trim() ?? ''
    const account = ACCOUNTS[identifier]

    /*
     * Any non-empty password is accepted for a known account. Password policy
     * is a backend concern (doc/RBAC, Security, and Privacy.md) — duplicating
     * it here would only create a second, divergent source of truth.
     */
    /*
     * ONE message for both "no such account" and "wrong password".
     *
     * The live API distinguishes them, which leaks which admin accounts exist
     * (see `signInErrorMessage`). The mock deliberately does NOT reproduce that
     * bug — reproducing it would mean the e2e test asserting no leak passes
     * against the mock only because the client patches over it, hiding whether
     * the client-side normalisation still works.
     */
    if (!account || !passwordMatches(body.password)) {
      return errorResponse(401, 'UNAUTHORIZED', 'Invalid credentials')
    }

    const admin: CurrentAdmin = {
      id: `adm_${account.username}`,
      email: identifier,
      phone: null,
      phoneMasked: null,
      role: account.role,
      status: 'ACTIVE',
      accountType: 'PERSONAL',
      profile: {
        displayName: account.displayName,
        username: account.username,
        avatarUrl: null,
      },
      createdAt: new Date().toISOString(),
      isProfileSetupComplete: true,
    }

    writeSession(admin)

    const refreshToken = `mock-refresh.${account.username}.${Date.now().toString(36)}`
    globalThis.localStorage?.setItem(REFRESH_KEY, refreshToken)

    return HttpResponse.json({
      success: true,
      data: {
        user: admin,
        tokens: {
          // Opaque and obviously fake — never shaped like a real JWT.
          accessToken: `mock-access-token.${account.username}`,
          refreshToken,
          expiresIn: '7d',
        },
      },
    })
  }),

  /**
   * `POST /admin/auth/refresh`.
   *
   * ⚠️ The LIVE endpoint is broken — it rejects every refresh token its own
   * login issues (verified 2026-08-25). The mock implements the flow
   * CORRECTLY, on purpose: the client's refresh-and-retry path needs to be
   * exercisable, and mirroring a server bug would leave that code permanently
   * untested. The client handles both outcomes, so this divergence is safe —
   * but it IS a divergence, and it disappears when the backend is fixed.
   */
  http.post(`${API_PREFIX}/admin/auth/refresh`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = (await request.json()) as { refreshToken?: string }
    const stored = globalThis.localStorage?.getItem(REFRESH_KEY)
    const session = readSession()

    if (!body.refreshToken || !stored || body.refreshToken !== stored || !session) {
      return errorResponse(
        401,
        'UNAUTHORIZED',
        'Invalid, revoked, or expired refresh token. Please sign in again.',
      )
    }

    // Rotate, as a real implementation should — a replayed token must fail.
    const rotated = `mock-refresh.rotated.${Date.now().toString(36)}`
    globalThis.localStorage?.setItem(REFRESH_KEY, rotated)

    return HttpResponse.json({
      success: true,
      data: {
        user: session,
        tokens: {
          accessToken: `mock-access-token.renewed.${Date.now().toString(36)}`,
          refreshToken: rotated,
          expiresIn: '7d',
        },
      },
    })
  }),

  /** `PATCH /admin/auth/password` — validates exactly what the live API does. */
  http.patch(`${API_PREFIX}/admin/auth/password`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = (await request.json()) as {
      currentPassword?: string
      newPassword?: string
      confirmPassword?: string
    }

    if (!body.currentPassword || !body.newPassword || !body.confirmPassword) {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        'body/currentPassword Required, body/newPassword Required, body/confirmPassword Required',
      )
    }

    const policyError = passwordPolicyError(body.newPassword)
    if (policyError) return errorResponse(400, 'FST_ERR_VALIDATION', policyError)

    if (body.newPassword !== body.confirmPassword) {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        'body/confirmPassword New password and confirm password do not match.',
      )
    }

    if (!passwordMatches(body.currentPassword)) {
      return errorResponse(
        401,
        'UNAUTHORIZED',
        'Invalid current password. Verification failed.',
      )
    }

    globalThis.localStorage?.setItem(PASSWORD_KEY, body.newPassword)
    globalThis.localStorage?.removeItem(REFRESH_KEY)

    return HttpResponse.json({
      success: true,
      message: 'Password updated successfully.',
    })
  }),

  /** `PATCH /admin/auth/email`. */
  http.patch(`${API_PREFIX}/admin/auth/email`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = (await request.json()) as { newEmail?: string; password?: string }

    if (!body.newEmail || !body.password) {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        'body/newEmail Required, body/password Required',
      )
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.newEmail)) {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        'body/newEmail Must be a valid email address',
      )
    }

    if (!passwordMatches(body.password)) {
      return errorResponse(
        401,
        'UNAUTHORIZED',
        'Invalid current password. Identity verification failed.',
      )
    }

    const session = readSession()
    if (session) writeSession({ ...session, email: body.newEmail })

    return HttpResponse.json({ success: true, message: 'Email updated successfully.' })
  }),

  /**
   * `POST /admin/auth/logout` — real, and it revokes server-side. Without the
   * call the refresh token would stay valid for its full 7 days after the
   * operator believed they had signed out.
   *
   * The validation below is not decoration. Both checks were confirmed against
   * the live API, and the mock previously accepted anything at all — which is
   * exactly how the capability-restriction DELETEs shipped broken behind a
   * green test suite. A mock laxer than the service tests nothing.
   */
  http.post(`${API_PREFIX}/admin/auth/logout`, async ({ request }) => {
    const raw = await request.text()

    // Fastify turns an absent payload into `null`, and the schema refuses it.
    if (raw.trim() === '') {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        'body/ Expected object, received null',
      )
    }

    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      body = null
    }

    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        'body/ Expected object, received null',
      )
    }

    const { allDevices } = body as { allDevices?: unknown }

    // Optional, but a boolean when present. Unknown sibling keys are ignored.
    if (allDevices !== undefined && typeof allDevices !== 'boolean') {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        `body/allDevices Expected boolean, received ${typeof allDevices}`,
      )
    }

    /*
     * One browser holds one mock session, so `allDevices` has no extra effect
     * here — the distinction lives in the message, which is what the UI shows.
     */
    writeSession(null)
    globalThis.localStorage?.removeItem(REFRESH_KEY)

    return HttpResponse.json({
      success: true,
      message:
        allDevices === true
          ? 'Logged out from all devices successfully.'
          : 'Admin session logged out successfully.',
    })
  }),
]
