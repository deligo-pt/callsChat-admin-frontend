import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { formatCount } from '@/lib/format'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { API_PREFIX } from '@/mocks/handlers/shared'
import { users } from '@/mocks/seed'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { UsersListPage } from './UsersListPage'

/**
 * The user directory against the live contract of 2026-11-01.
 *
 * Two things broke or were missing that day:
 *   - the first live restriction arrived as a record, not a capability name,
 *     and failed the whole page's contract check;
 *   - the Host filter the API cannot apply (H1, H2), applied from the roster.
 */

const USERS = `${API_PREFIX}/admin/users`
const ROSTER = `${API_PREFIX}/admin/live/hosts`

/** Every `/admin/users` request, as its query. */
let userQueries: Record<string, string>[] = []

/** Newest first, as the directory opens. */
const byNewest = [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

/**
 * Two hosts from page 1 whose `isHost` is false — exactly the live shape (H1):
 * the roster knows them, the user record does not.
 */
const hosts = byNewest.filter((user) => !user.isHost).slice(0, 2)

function roster(ids: string[]) {
  server.use(
    http.get(ROSTER, () =>
      HttpResponse.json({
        success: true,
        data: ids.map((userId) => ({ id: `prof_${userId}`, userId, status: 'ACTIVE' })),
        pagination: { page: 1, limit: 100, total: ids.length, totalPages: 1 },
      }),
    ),
  )
}

function renderAt(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/users', element: <UsersListPage /> }], {
    initialEntries: [entry],
  })
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TooltipProvider delayDuration={0}>
          <RouterProvider router={router} />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

async function found() {
  const status = await screen.findByText(/users found\.$/)
  return status.textContent
}

beforeEach(() => {
  userQueries = []
  server.events.removeAllListeners()
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/admin/users')) {
      userQueries.push(Object.fromEntries(url.searchParams))
    }
  })
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
  roster(hosts.map((user) => user.id))
})

describe('restrictions as the list sends them', () => {
  it('renders a page holding a live restriction record', async () => {
    /* Ethan Wilson's row, captured from staging 2026-11-01. */
    server.use(
      http.get(USERS, () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              id: 'cmvethanwilson00000000001',
              displayName: 'Ethan Wilson',
              username: 'ethan',
              avatarUrl: null,
              email: null,
              phone: '+8801700000000',
              phoneMasked: '+880 *** *** 0000',
              role: 'USER',
              status: 'ACTIVE',
              accountType: 'PERSONAL',
              isHost: false,
              activeRestrictions: [
                {
                  id: 'cmvw220x2009a01mwgqnsp4zk',
                  capability: 'MESSAGING',
                  reason: 'hofjslfjslkjfsouonllknnkn',
                  startsAt: '2026-10-31T07:03:53.894Z',
                  expiresAt: '2026-11-05T07:03:00.000Z',
                },
              ],
              createdAt: '2026-10-20T10:00:00.000Z',
              lastActiveAt: '2026-10-31T10:00:00.000Z',
            },
          ],
          pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
        }),
      ),
    )
    renderAt('/users')
    expect(await screen.findByText('Ethan Wilson')).toBeInTheDocument()
    const badge = screen.getByText('Messaging blocked')
    expect(badge.closest('[title]')).toHaveAttribute(
      'title',
      'Messaging blocked — hofjslfjslkjfsouonllknnkn — until 05 Nov 2026',
    )
  })
})

describe('the restrictions filter', () => {
  it('drops "no restrictions" from a link, because the API inverts it', async () => {
    renderAt('/users?hasRestrictions=false')
    await found()
    expect(userQueries.at(-1)).not.toHaveProperty('hasRestrictions')
    expect(screen.queryByText('Restrictions:')).toBeNull()
  })

  it('still sends "has restrictions"', async () => {
    renderAt('/users?hasRestrictions=true')
    await found()
    expect(userQueries.at(-1)).toMatchObject({ hasRestrictions: 'true' })
  })
})

describe('the Host filter', () => {
  it('lists the roster’s users even though isHost says otherwise', async () => {
    renderAt('/users?host=host')
    expect(await found()).toBe('2 users found.')
    for (const host of hosts) {
      expect(screen.getByText(host.displayName)).toBeInTheDocument()
    }
    /* Never sent: the API returns 0 for every `isHost` value. */
    expect(
      userQueries.every((query) => !('isHost' in query) && !('host' in query)),
    ).toBe(true)
  })

  it('applies the other filters to hosts too', async () => {
    const [first] = hosts
    const other = first!.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    const expected = hosts.filter((host) => host.status === other).length
    renderAt(`/users?host=host&status=${other}`)
    expect(await found()).toBe(`${expected} users found.`)
  })

  it('applies the typed search to hosts', async () => {
    const target = hosts[1]!
    renderAt(`/users?host=host&search=${encodeURIComponent(target.displayName)}`)
    const expected = hosts.filter((host) => host.displayName === target.displayName)
    expect(await found()).toBe(`${expected.length} users found.`)
    expect(
      within(screen.getByRole('table')).getAllByText(target.displayName),
    ).toHaveLength(expected.length)
  })

  it('keeps only the exact id from each lookup', async () => {
    /*
     * `search` also matches names and e-mails, so a lookup by id can return
     * someone else first. Only the id's own record may count as the host.
     */
    const decoy = byNewest.find((user) => !hosts.includes(user))!
    server.use(
      http.get(USERS, ({ request }) => {
        const search = new URL(request.url).searchParams.get('search')
        const host = hosts.find((candidate) => candidate.id === search)
        if (!host) return undefined
        return HttpResponse.json({
          success: true,
          data: [decoy, host],
          pagination: { page: 1, limit: 5, total: 2, totalPages: 1 },
        })
      }),
    )
    renderAt('/users?host=host')
    expect(await found()).toBe('2 users found.')
    expect(screen.queryByText(decoy.displayName)).toBeNull()
  })

  it.each(['asc', 'desc'] as const)(
    'orders hosts as the sort asks (%s)',
    async (order) => {
      /* Both directions: one of them always differs from the roster's order. */
      const ascending = hosts.map((host) => host.displayName).sort()
      const names = order === 'asc' ? ascending : [...ascending].reverse()
      renderAt(`/users?host=host&sortBy=displayName&sortOrder=${order}`)
      await found()
      const table = screen.getByRole('table')
      const shown = within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => names.find((name) => row.textContent?.includes(name)))
      expect(shown).toEqual(names)
    },
  )

  it('removes hosts from Non-hosts and corrects the total', async () => {
    renderAt('/users?host=user')
    expect(await found()).toBe(
      `${formatCount(users.length - hosts.length)} users found.`,
    )
    for (const host of hosts) {
      expect(screen.queryByText(host.displayName)).toBeNull()
    }
  })

  it('names the filter on its chip', async () => {
    renderAt('/users?host=user')
    await found()
    expect(screen.getByText('Host:').parentElement).toHaveTextContent('Non-hosts')
  })

  it('hides the export while it is on, since the export cannot apply it', async () => {
    renderAt('/users?host=host')
    await found()
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull()
  })

  it('ignores an unknown value', async () => {
    renderAt('/users?host=maybe')
    expect(await found()).toBe(`${formatCount(users.length)} users found.`)
  })
})

describe('who gets the Host filter', () => {
  it('is absent for a Moderator, and a host link is ignored', async () => {
    /* MODERATOR cannot read the roster (`host_applications.view`). */
    signInMockAdmin('MODERATOR')
    renderAt('/users?host=host')
    await waitFor(async () =>
      expect(await found()).toBe(`${formatCount(users.length)} users found.`),
    )
    expect(screen.queryByRole('combobox', { name: 'Host' })).toBeNull()
  })

  it('is offered to an Admin', async () => {
    signInMockAdmin('ADMIN')
    renderAt('/users')
    await found()
    expect(await screen.findByRole('combobox', { name: 'Host' })).toBeInTheDocument()
  })
})
