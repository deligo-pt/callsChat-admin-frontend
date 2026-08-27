import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { server } from '@/mocks/server'

import { signOut, signOutEverywhere } from './session'
import { getSession, resetSessionForTests, setSession } from './tokenStore'

const BASE = '*/api/v1'
const LOGOUT = `${BASE}/admin/auth/logout`

/**
 * Sign-out, both scopes.
 *
 * These exist because the failure they guard against is invisible from the
 * UI: a logout that omits the body is rejected 400 by Fastify, the caller
 * swallows it, the operator sees the sign-in screen, and the refresh token
 * stays valid for another seven days. Nothing on screen says so.
 */

/** Records the parsed body of every logout call, in order. */
function captureLogouts(status = 200) {
  const bodies: unknown[] = []
  server.use(
    http.post(LOGOUT, async ({ request }) => {
      const raw = await request.text()
      bodies.push(raw === '' ? undefined : JSON.parse(raw))
      if (status !== 200) {
        return HttpResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'nope' } },
          { status },
        )
      }
      return HttpResponse.json({ success: true, message: 'ok' })
    }),
  )
  return bodies
}

beforeEach(() => {
  resetSessionForTests()
  setSession({ accessToken: 'a1', refreshToken: 'r1', expiresAt: null })
})

afterEach(() => {
  resetSessionForTests()
})

describe('signOut', () => {
  it('sends an object body, never an absent one', async () => {
    const bodies = captureLogouts()

    await signOut()

    /*
     * `{}`, not `undefined`. A DELETE-style bodyless POST makes Fastify set
     * `request.body` to null and the route schema rejects it outright.
     */
    expect(bodies).toEqual([{}])
  })

  it('does not ask to revoke other devices', async () => {
    const bodies = captureLogouts()

    await signOut()

    expect(bodies[0]).not.toHaveProperty('allDevices')
  })

  it('clears the local credentials even when the server rejects the call', async () => {
    captureLogouts(500)

    await expect(signOut()).resolves.toBeUndefined()
    expect(getSession()).toBeNull()
  })
})

describe('signOutEverywhere', () => {
  it('sends allDevices as a boolean true', async () => {
    const bodies = captureLogouts()

    await signOutEverywhere()

    expect(bodies[0]).toEqual({ allDevices: true })
  })

  it('follows up with a plain logout so this session cannot survive', async () => {
    const bodies = captureLogouts()

    await signOutEverywhere()

    /*
     * Whether `allDevices` also revokes the calling session is unverified —
     * confirming it would have signed out the live production account. The
     * second call makes the outcome the same either way.
     */
    expect(bodies).toEqual([{ allDevices: true }, {}])
    expect(getSession()).toBeNull()
  })

  it('rejects and KEEPS the session when the revocation fails', async () => {
    captureLogouts(500)

    await expect(signOutEverywhere()).rejects.toThrow()

    /*
     * The opposite of `signOut`, and deliberately so. Nothing was revoked, so
     * clearing locally would strand the operator at the sign-in screen
     * believing every other device was dead.
     */
    expect(getSession()).not.toBeNull()
  })
})

describe('the mock backend enforces the real body contract', () => {
  it('rejects a bodyless logout the way Fastify does', async () => {
    const response = await fetch('http://localhost/api/v1/admin/auth/logout', {
      method: 'POST',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'body/ Expected object, received null' },
    })
  })

  it('rejects a non-boolean allDevices the way the schema does', async () => {
    const response = await fetch('http://localhost/api/v1/admin/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allDevices: 'yes' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'body/allDevices Expected boolean, received string' },
    })
  })
})
