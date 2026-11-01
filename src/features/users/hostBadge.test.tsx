import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { queryKeys } from '@/api/queryKeys'
import { ROUTES } from '@/app/routes'
import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { API_PREFIX } from '@/mocks/handlers/shared'
import { server } from '@/mocks/server'
import { render, renderWithSession, screen, waitFor } from '@tests/render'

import { HostBadge } from './HostBadge'

/**
 * Host / User badges — plan.md §3, phase T0.
 *
 * ⚠️ Measured 2026-11-01: `isHost` is `false` for every user live, the three
 * active hosts included (H1). These tests pin the cross-check against the
 * roster that stands in for it.
 */

const ROSTER = `${API_PREFIX}/admin/live/hosts`

/** Every roster request, as `page` numbers. */
let rosterPages: number[] = []

function roster(
  hosts: Array<{ userId: string; status: string }>,
  { pageSize = 100 }: { pageSize?: number } = {},
) {
  server.use(
    http.get(ROSTER, ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page') ?? '1')
      rosterPages.push(page)
      const slice = hosts.slice((page - 1) * pageSize, page * pageSize)
      return HttpResponse.json({
        success: true,
        data: slice.map((host) => ({ id: `prof_${host.userId}`, ...host })),
        pagination: {
          page,
          limit: pageSize,
          total: hosts.length,
          totalPages: Math.ceil(hosts.length / pageSize),
        },
      })
    }),
  )
}

beforeEach(() => {
  rosterPages = []
  signInMockAdmin('SUPER_ADMIN')
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('who is a host', () => {
  it('trusts isHost when it says so', () => {
    roster([])
    renderWithSession(<HostBadge user={{ id: 'u1', isHost: true }} />)
    expect(screen.getByText('Host')).toBeInTheDocument()
  })

  it('finds a host from the roster when isHost is wrong (H1)', async () => {
    /* App Developer, live: `isHost: false` with an ACTIVE host profile. */
    roster([{ userId: 'u1', status: 'ACTIVE' }])
    renderWithSession(<HostBadge user={{ id: 'u1', isHost: false }} />)
    expect(await screen.findByText('Host')).toBeInTheDocument()
    expect(screen.queryByText('User')).toBeNull()
  })

  it('says User for everyone else, rather than showing nothing', async () => {
    roster([{ userId: 'someone_else', status: 'ACTIVE' }])
    renderWithSession(<HostBadge user={{ id: 'u1', isHost: false }} />)
    await waitFor(() => expect(rosterPages).toEqual([1]))
    expect(screen.getByText('User')).toBeInTheDocument()
  })

  it('names a host who is not in good standing', async () => {
    roster([{ userId: 'u1', status: 'SUSPENDED' }])
    renderWithSession(<HostBadge user={{ id: 'u1', isHost: true }} />)
    expect(await screen.findByText('Host · Suspended')).toBeInTheDocument()
  })

  it('reads every page of the roster', async () => {
    /* There is no per-user lookup (H3), so a host on page 2 must still count. */
    roster(
      [
        { userId: 'a', status: 'ACTIVE' },
        { userId: 'b', status: 'ACTIVE' },
        { userId: 'u1', status: 'ACTIVE' },
      ],
      { pageSize: 2 },
    )
    renderWithSession(<HostBadge user={{ id: 'u1', isHost: false }} />)
    expect(await screen.findByText('Host')).toBeInTheDocument()
    expect(rosterPages).toEqual([1, 2])
  })

  it('falls back to isHost when the roster fails', async () => {
    server.use(
      http.get(ROSTER, () => {
        rosterPages.push(1)
        return HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Down.' } },
          { status: 500 },
        )
      }),
    )
    renderWithSession(
      <>
        <HostBadge user={{ id: 'u1', isHost: true }} />
        <HostBadge user={{ id: 'u2', isHost: false }} />
      </>,
    )
    await waitFor(() => expect(rosterPages).toEqual([1]))
    expect(screen.getByText('Host')).toBeInTheDocument()
    expect(screen.getByText('User')).toBeInTheDocument()
  })
})

describe('who may read the roster', () => {
  it('never asks for it without host permission, and decides on isHost', async () => {
    /* MODERATOR holds `users.view` but not `host_applications.view`. */
    signInMockAdmin('MODERATOR')
    roster([{ userId: 'u1', status: 'ACTIVE' }])
    renderWithSession(<HostBadge user={{ id: 'u1', isHost: false }} />)
    expect(await screen.findByText('User')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(rosterPages).toEqual([])
  })

  it('ignores a roster already cached before the role changed', async () => {
    /*
     * A demotion mid-session (the session is re-read after a 403) keeps the
     * query cache; only sign-out clears it. The roster a Super Admin loaded
     * must not keep deciding badges for the Moderator they became.
     */
    signInMockAdmin('MODERATOR')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(
      [...queryKeys.hosts.all, 'roster'],
      new Map([['u1', { status: 'ACTIVE' }]]),
    )
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter>
            <HostBadge user={{ id: 'u1', isHost: false }} />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('User')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText('Host')).toBeNull()
  })
})

describe('on the user record', () => {
  it('links the Host badge to the roster', () => {
    roster([])
    renderWithSession(<HostBadge user={{ id: 'u1', isHost: true }} size="md" link />)
    expect(screen.getByRole('link', { name: /Host/ })).toHaveAttribute(
      'href',
      ROUTES.hosts,
    )
  })

  it('does not link the User badge', () => {
    roster([])
    renderWithSession(<HostBadge user={{ id: 'u1', isHost: false }} size="md" link />)
    expect(screen.getByText('User')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
