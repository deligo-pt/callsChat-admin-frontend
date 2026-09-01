import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/mocks/server'
import { resetSessionForTests, setSession } from '@/auth/tokenStore'
import { newIdempotencyKey } from '@/lib/idempotency'
import { z } from 'zod'

import { apiClient, setUnauthorizedHandler } from './client'
import {
  ContractViolationError,
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
  UnauthorizedError,
} from './errors'

const BASE = '*/api/v1'

afterEach(() => {
  setUnauthorizedHandler(null)
})

describe('apiClient — headers', () => {
  it('sends a correlation ID as X-Request-ID, the only name CORS allows', async () => {
    let received: string | null = null
    server.use(
      http.get(`${BASE}/probe`, ({ request }) => {
        received = request.headers.get('X-Request-ID')
        return HttpResponse.json({ ok: true })
      }),
    )

    await apiClient.get('/probe')
    expect(received).toMatch(/^corr_[0-9a-f]{32}$/)
  })

  it('sends an idempotency key when one is supplied', async () => {
    let received: string | null = null
    server.use(
      http.post(`${BASE}/admin/adjustments`, ({ request }) => {
        received = request.headers.get('Idempotency-Key')
        return HttpResponse.json({ ok: true })
      }),
    )

    const key = newIdempotencyKey()
    await apiClient.post('/admin/adjustments', {
      body: { amount: 100 },
      idempotencyKey: key,
    })
    expect(received).toBe(key)
  })
})

describe('apiClient — idempotency guard (plan.md §10)', () => {
  it('refuses to send a financial mutation without an idempotency key', async () => {
    await expect(
      apiClient.post('/admin/adjustments', { body: { amount: 100 } }),
    ).rejects.toThrow(/requires an idempotencyKey/)
  })

  it('refuses on every financial path', async () => {
    for (const path of [
      '/admin/withdrawals/wdr_1/approve',
      '/admin/withdrawals/wdr_1/reject',
      '/admin/payments/pay_1/refund',
      '/admin/payout-rates',
    ]) {
      await expect(apiClient.post(path, { body: {} })).rejects.toThrow(
        /requires an idempotencyKey/,
      )
    }
  })

  it('allows a non-financial mutation without a key', async () => {
    server.use(
      http.post(`${BASE}/admin/users/usr_1/suspend`, () =>
        HttpResponse.json({ ok: true }),
      ),
    )
    await expect(
      apiClient.post('/admin/users/usr_1/suspend', { body: { reason: 'x' } }),
    ).resolves.toEqual({ ok: true })
  })
})

describe('apiClient — error mapping', () => {
  it('maps a 403 to ForbiddenError', async () => {
    server.use(
      http.get(`${BASE}/probe`, () =>
        HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'nope', correlationId: 'corr_x' } },
          { status: 403 },
        ),
      ),
    )
    await expect(apiClient.get('/probe')).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('maps a 404 to NotFoundError', async () => {
    server.use(
      http.get(`${BASE}/probe`, () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'gone' } },
          { status: 404 },
        ),
      ),
    )
    await expect(apiClient.get('/probe')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('maps a state-transition conflict distinctly from a plain conflict', async () => {
    server.use(
      http.post(`${BASE}/probe`, () =>
        HttpResponse.json(
          { error: { code: 'INVALID_STATE_TRANSITION', message: 'already completed' } },
          { status: 409 },
        ),
      ),
    )
    await expect(apiClient.post('/probe')).rejects.toBeInstanceOf(
      InvalidStateTransitionError,
    )
  })

  it('notifies the unauthorized handler exactly once on a 401', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)

    server.use(
      http.get(`${BASE}/probe`, () =>
        HttpResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'expired' } },
          { status: 401 },
        ),
      ),
    )

    await expect(apiClient.get('/probe')).rejects.toBeInstanceOf(UnauthorizedError)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })
})

describe('apiClient — contract validation (plan.md §2.6)', () => {
  const schema = z.object({ availableDiamonds: z.int(), lockedDiamonds: z.int() })

  it('returns parsed data when the response matches the contract', async () => {
    server.use(
      http.get(`${BASE}/wallet`, () =>
        HttpResponse.json({ availableDiamonds: 100, lockedDiamonds: 0 }),
      ),
    )
    await expect(
      apiClient.get('/wallet', { schema, resource: 'wallet' }),
    ).resolves.toEqual({
      availableDiamonds: 100,
      lockedDiamonds: 0,
    })
  })

  it('throws rather than render silently-wrong finance data', async () => {
    server.use(
      // A float where an integer is required — exactly the class of bug that
      // must never reach a balance display.
      http.get(`${BASE}/wallet`, () =>
        HttpResponse.json({ availableDiamonds: 100.5, lockedDiamonds: 0 }),
      ),
    )
    await expect(
      apiClient.get('/wallet', { schema, resource: 'wallet' }),
    ).rejects.toBeInstanceOf(ContractViolationError)
  })

  it('does not validate when no schema is supplied', async () => {
    server.use(http.get(`${BASE}/loose`, () => HttpResponse.json({ anything: true })))
    await expect(apiClient.get('/loose')).resolves.toEqual({ anything: true })
  })
})

describe('apiClient — cancellation (plan.md §2.1)', () => {
  it('aborts an in-flight request when the signal fires', async () => {
    server.use(
      http.get(`${BASE}/slow`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 500))
        return HttpResponse.json({ ok: true })
      }),
    )

    const controller = new AbortController()
    const promise = apiClient.get('/slow', { signal: controller.signal })
    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rapid filter changes leave only the last request outstanding', async () => {
    let started = 0
    server.use(
      http.get(`${BASE}/search`, async ({ request }) => {
        started += 1
        await new Promise((resolve) => setTimeout(resolve, 100))
        return HttpResponse.json({ term: new URL(request.url).searchParams.get('q') })
      }),
    )

    const controllers = ['a', 'ab', 'abc'].map(() => new AbortController())
    const requests = ['a', 'ab', 'abc'].map((term, index) =>
      apiClient
        .get<{ term: string }>('/search', {
          params: { q: term },
          signal: controllers[index]!.signal,
        })
        .catch((error: unknown) => error),
    )

    // Supersede the first two, as a filter change would.
    controllers[0]!.abort()
    controllers[1]!.abort()

    const results = await Promise.all(requests)
    expect((results[0] as Error).name).toBe('AbortError')
    expect((results[1] as Error).name).toBe('AbortError')
    expect(results[2]).toEqual({ term: 'abc' })
    expect(started).toBeGreaterThan(0)
  })
})

describe('apiClient — query parameters', () => {
  it('drops undefined, null and empty values', async () => {
    let url = ''
    server.use(
      http.get(`${BASE}/probe`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ ok: true })
      }),
    )

    await apiClient.get('/probe', {
      params: {
        page: 2,
        status: 'ACTIVE',
        empty: '',
        missing: undefined,
        nothing: null,
      },
    })

    expect(url).toContain('page=2')
    expect(url).toContain('status=ACTIVE')
    expect(url).not.toContain('empty=')
    expect(url).not.toContain('missing')
    expect(url).not.toContain('nothing')
  })
})

describe('apiClient — multipart uploads', () => {
  it('does not set Content-Type, so the browser can add the boundary', async () => {
    let contentType: string | null = null
    server.use(
      http.post(`${BASE}/admin/settings/logo`, ({ request }) => {
        contentType = request.headers.get('Content-Type')
        return HttpResponse.json({ ok: true })
      }),
    )

    const formData = new FormData()
    formData.append('file', new File(['x'], 'logo.png', { type: 'image/png' }))
    await apiClient.postMultipart('/admin/settings/logo', formData)

    /*
     * Setting it by hand yields a header with no boundary and the server
     * rejects the request outright — so the only correct behaviour is to
     * leave it to fetch, which derives it from the FormData instance.
     */
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/)
  })

  it('still attaches the bearer token and correlation ID', async () => {
    let auth: string | null = null
    let correlationId: string | null = null
    server.use(
      http.post(`${BASE}/admin/settings/logo`, ({ request }) => {
        auth = request.headers.get('Authorization')
        correlationId = request.headers.get('X-Request-ID')
        return HttpResponse.json({ ok: true })
      }),
    )

    setSession({ accessToken: 'upload-token', refreshToken: 'r', expiresAt: null })
    try {
      const formData = new FormData()
      formData.append('file', new File(['x'], 'logo.png', { type: 'image/png' }))
      await apiClient.postMultipart('/admin/settings/logo', formData)
    } finally {
      resetSessionForTests()
    }

    expect(auth).toBe('Bearer upload-token')
    expect(correlationId).toMatch(/^corr_[0-9a-f]{32}$/)
  })

  it('delivers the file part under the field name the API expects', async () => {
    let fieldNames: string[] = []
    let contents: string | undefined
    server.use(
      http.post(`${BASE}/admin/settings/logo`, async ({ request }) => {
        const form = await request.formData()
        fieldNames = [...form.keys()]
        const part = form.get('file')
        contents =
          typeof (part as Blob | null)?.text === 'function'
            ? await (part as Blob).text()
            : undefined
        return HttpResponse.json({ ok: true })
      }),
    )

    const formData = new FormData()
    formData.append(
      'file',
      new File(['brand-bytes'], 'brand.png', { type: 'image/png' }),
    )
    await apiClient.postMultipart('/admin/settings/logo', formData)

    /*
     * Field name and bytes, not `file.name` — the filename does not survive
     * the undici multipart round-trip in this environment, so asserting it
     * would test the test runner rather than the client.
     */
    expect(fieldNames).toEqual(['file'])
    expect(contents).toBe('brand-bytes')
  })

  it('refuses a request carrying both a JSON body and formData', async () => {
    // Two bodies is a caller bug, and fetch would silently drop one of them.
    await expect(
      apiClient.post('/admin/settings/logo', {
        body: { a: 1 },
        formData: new FormData(),
      }),
    ).rejects.toThrow(/both a JSON body and formData/)
  })
})
