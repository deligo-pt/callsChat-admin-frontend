import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { server } from '@/mocks/server'
import { renderWithProviders, screen, waitFor } from '@tests/render'

import { AuthProvider } from './AuthProvider'
import { PERMISSIONS } from './permissions'
import { resetSessionForTests, setSession } from './tokenStore'
import { useAuth } from './useAuth'

const BASE = '*/api/v1'

/**
 * How the effective permission set is resolved (plan.md 3A′ #1).
 *
 * The API does not send `permissions[]` yet, so the panel falls back to a role
 * map. These pin the handover: the day the backend starts sending the array,
 * it must win — including when it is empty.
 */

function Probe() {
  const { admin, can, ready } = useAuth()
  if (!ready) return <span>loading</span>
  return (
    <ul>
      <li>role:{admin?.role ?? 'none'}</li>
      <li>suspend:{String(can(PERMISSIONS.usersSuspend))}</li>
      <li>ban:{String(can(PERMISSIONS.usersBan))}</li>
      <li>role-change:{String(can(PERMISSIONS.usersChangeRole))}</li>
    </ul>
  )
}

function renderWithAdmin(payload: Record<string, unknown>) {
  server.use(
    http.get(`${BASE}/admin/auth/me`, () =>
      HttpResponse.json({ success: true, data: payload }),
    ),
  )

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return renderWithProviders(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

const BASE_ADMIN = {
  id: 'adm_1',
  email: 'test@callschat.app',
  role: 'ADMIN',
  status: 'ACTIVE',
}

beforeEach(() => {
  resetSessionForTests()
  setSession({ accessToken: 'token', refreshToken: null, expiresAt: null })
})

afterEach(() => {
  resetSessionForTests()
})

describe('effective permissions', () => {
  it('falls back to the role map when the API sends no permissions', async () => {
    renderWithAdmin(BASE_ADMIN)

    await waitFor(() => expect(screen.getByText('role:ADMIN')).toBeInTheDocument())
    // Admin tier: may suspend and ban, may not change roles.
    expect(screen.getByText('suspend:true')).toBeInTheDocument()
    expect(screen.getByText('ban:true')).toBeInTheDocument()
    expect(screen.getByText('role-change:false')).toBeInTheDocument()
  })

  it('honours a server-sent permission list over the role map', async () => {
    /*
     * The whole point of the forward-compatible field: a narrower server list
     * must win, even though this role's map would grant more.
     */
    renderWithAdmin({ ...BASE_ADMIN, permissions: [PERMISSIONS.usersView] })

    await waitFor(() => expect(screen.getByText('role:ADMIN')).toBeInTheDocument())
    expect(screen.getByText('suspend:false')).toBeInTheDocument()
    expect(screen.getByText('ban:false')).toBeInTheDocument()
  })

  it('honours a server list that grants MORE than the role map', async () => {
    renderWithAdmin({
      ...BASE_ADMIN,
      role: 'MODERATOR',
      permissions: [PERMISSIONS.usersChangeRole],
    })

    await waitFor(() => expect(screen.getByText('role:MODERATOR')).toBeInTheDocument())
    expect(screen.getByText('role-change:true')).toBeInTheDocument()
  })

  it('treats an EMPTY server list as "no permissions", not as missing', async () => {
    /*
     * The dangerous case. Falling back to the role map on `[]` would silently
     * re-grant access the backend had just revoked.
     */
    renderWithAdmin({ ...BASE_ADMIN, permissions: [] })

    await waitFor(() => expect(screen.getByText('role:ADMIN')).toBeInTheDocument())
    expect(screen.getByText('suspend:false')).toBeInTheDocument()
    expect(screen.getByText('ban:false')).toBeInTheDocument()
    expect(screen.getByText('role-change:false')).toBeInTheDocument()
  })

  it('grants nothing to an unrecognised role', async () => {
    renderWithAdmin({ ...BASE_ADMIN, role: 'SUPER_ADMIN' })
    await waitFor(() =>
      expect(screen.getByText('role:SUPER_ADMIN')).toBeInTheDocument(),
    )
    expect(screen.getByText('role-change:true')).toBeInTheDocument()
  })
})
