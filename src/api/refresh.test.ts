import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetSessionForTests, setSession } from '@/auth/tokenStore'
import { server } from '@/mocks/server'

import { apiClient, setRefreshHandler, setUnauthorizedHandler } from './client'
import { UnauthorizedError } from './errors'

const BASE = '*/api/v1'

/**
 * The 401 → refresh → retry interceptor (plan.md §10.1).
 *
 * These matter because the failure modes are all silent-and-awful: a refresh
 * stampede that logs the operator out, an infinite retry loop, or a login form
 * that "refreshes" instead of reporting a wrong password.
 */

beforeEach(() => {
  resetSessionForTests()
  setSession({ accessToken: 'expired', refreshToken: 'r1', expiresAt: null })
})

afterEach(() => {
  setRefreshHandler(null)
  setUnauthorizedHandler(null)
  resetSessionForTests()
  vi.restoreAllMocks()
})

/** Fails the first call with 401, succeeds on any later one. */
function unauthorizedOnce(path: string) {
  let calls = 0
  server.use(
    http.get(`${BASE}${path}`, () => {
      calls += 1
      if (calls === 1) {
        return HttpResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'expired' } },
          { status: 401 },
        )
      }
      return HttpResponse.json({ ok: true, calls })
    }),
  )
  return () => calls
}

describe('refresh and retry', () => {
  it('renews the token and replays the request once', async () => {
    const calls = unauthorizedOnce('/probe')
    const refresh = vi.fn(async () => {
      setSession({ accessToken: 'fresh', refreshToken: 'r2', expiresAt: null })
      return true
    })
    setRefreshHandler(refresh)

    const result = await apiClient.get<{ ok: boolean; calls: number }>('/probe')

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    expect(calls()).toBe(2)
  })

  it('sends the NEW token on the replay, not the stale one', async () => {
    const seen: (string | null)[] = []
    let calls = 0
    server.use(
      http.get(`${BASE}/probe`, ({ request }) => {
        calls += 1
        seen.push(request.headers.get('Authorization'))
        if (calls === 1) {
          return HttpResponse.json(
            { success: false, error: { code: 'UNAUTHORIZED', message: 'expired' } },
            { status: 401 },
          )
        }
        return HttpResponse.json({ ok: true })
      }),
    )
    setRefreshHandler(async () => {
      setSession({ accessToken: 'fresh', refreshToken: 'r2', expiresAt: null })
      return true
    })

    await apiClient.get('/probe')

    // Replaying with the dead token would just 401 again — the whole point.
    expect(seen).toEqual(['Bearer expired', 'Bearer fresh'])
  })

  it('gives up after one retry rather than looping forever', async () => {
    let calls = 0
    server.use(
      http.get(`${BASE}/probe`, () => {
        calls += 1
        return HttpResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'expired' } },
          { status: 401 },
        )
      }),
    )
    // A refresh that "succeeds" but does not actually fix anything.
    setRefreshHandler(async () => true)

    await expect(apiClient.get('/probe')).rejects.toBeInstanceOf(UnauthorizedError)
    expect(calls).toBe(2)
  })

  it('signs out when the refresh fails', async () => {
    unauthorizedOnce('/probe')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    setRefreshHandler(async () => false)

    await expect(apiClient.get('/probe')).rejects.toBeInstanceOf(UnauthorizedError)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('shares ONE refresh across concurrent 401s instead of stampeding', async () => {
    server.use(
      http.get(`${BASE}/a`, () => unauthorizedThenOk('a')),
      http.get(`${BASE}/b`, () => unauthorizedThenOk('b')),
      http.get(`${BASE}/c`, () => unauthorizedThenOk('c')),
    )

    const state: Record<string, number> = {}
    function unauthorizedThenOk(key: string) {
      state[key] = (state[key] ?? 0) + 1
      if (state[key] === 1) {
        return HttpResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'expired' } },
          { status: 401 },
        )
      }
      return HttpResponse.json({ ok: true })
    }

    let refreshCount = 0
    setRefreshHandler(async () => {
      refreshCount += 1
      await new Promise((resolve) => setTimeout(resolve, 10))
      setSession({ accessToken: 'fresh', refreshToken: 'r2', expiresAt: null })
      return true
    })

    await Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')])

    /*
     * Three parallel 401s must produce ONE refresh. With a rotating refresh
     * token, the second and third would present an already-used token, fail,
     * and sign the operator out mid-session.
     */
    expect(refreshCount).toBe(1)
  })

  it('allows a NEW refresh after the previous one has settled', async () => {
    unauthorizedOnce('/probe')
    let refreshCount = 0
    setRefreshHandler(async () => {
      refreshCount += 1
      setSession({
        accessToken: `fresh${refreshCount}`,
        refreshToken: 'r',
        expiresAt: null,
      })
      return true
    })

    await apiClient.get('/probe')
    setSession({ accessToken: 'expired', refreshToken: 'r1', expiresAt: null })
    unauthorizedOnce('/probe2')
    await apiClient.get('/probe2')

    // The single-flight guard must not latch permanently.
    expect(refreshCount).toBe(2)
  })

  it('never refreshes on the auth endpoints themselves', async () => {
    server.use(
      http.post(`${BASE}/admin/auth/login`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'bad password' } },
          { status: 401 },
        ),
      ),
    )
    const refresh = vi.fn(async () => true)
    setRefreshHandler(refresh, (path) => path.startsWith('/admin/auth/'))

    await expect(apiClient.post('/admin/auth/login')).rejects.toBeInstanceOf(
      UnauthorizedError,
    )

    /*
     * A 401 from login IS the answer — a wrong password. Refreshing and
     * retrying would hide the real error and hammer the endpoint.
     */
    expect(refresh).not.toHaveBeenCalled()
  })

  it('does not refresh a 403, which is a permission problem not an expiry', async () => {
    server.use(
      http.get(`${BASE}/probe`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'nope' } },
          { status: 403 },
        ),
      ),
    )
    const refresh = vi.fn(async () => true)
    setRefreshHandler(refresh)

    await expect(apiClient.get('/probe')).rejects.toThrow()
    expect(refresh).not.toHaveBeenCalled()
  })
})
