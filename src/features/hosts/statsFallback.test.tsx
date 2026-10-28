import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import {
  breakMockStatsRoute,
  resetMockHosts,
  seedMockHosts,
} from '@/mocks/handlers/hosts'
import { server } from '@/mocks/server'
import { render, screen, waitFor, within } from '@tests/render'

import { HostApplicationsPage } from './HostApplicationsPage'

/**
 * The counters, when their endpoint is gone — phase W0.
 *
 * ⚠️ **This is not a hypothetical.** `GET /admin/live/host-applications/stats`
 * answered `200` on 2026-10-15 and `404` on 2026-10-27 (plan.md O1): the
 * `:id` route now swallows the literal `stats` segment, and the body is the
 * *application* not-found message rather than a route error, which is the
 * proof. Six tiles on a shipped screen went blank and nothing failed.
 *
 * Every test here runs with `breakMockStatsRoute()`, which reproduces that
 * exact response — our own MSW handler is ordered correctly and would
 * otherwise hide the defect forever.
 */

const BROKEN = /host-applications\/stats/

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/host-applications', element: <HostApplicationsPage /> },
      { path: '/hosts', element: <div>host roster</div> },
    ],
    { initialEntries: ['/host-applications'] },
  )

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

function tile(name: RegExp) {
  return screen.findByRole('button', { name })
}

beforeEach(() => {
  resetMockHosts()
  signInMockAdmin('SUPER_ADMIN')
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('when the stats route is the 404 the live backend returns', () => {
  it('still shows every counter, rebuilt from the list routes', async () => {
    seedMockHosts()
    breakMockStatsRoute()
    renderScreen()

    /*
     * The seed holds 3 applications — 2 PENDING, 0 APPROVED, 1 REJECTED — and
     * 2 hosts, 1 ACTIVE and 1 SUSPENDED. Those are the numbers the dead
     * endpoint used to compute server-side.
     */
    expect(await tile(/All applications/)).toHaveTextContent('3')
    expect(await tile(/Pending review/)).toHaveTextContent('2')
    expect(await tile(/Approved/)).toHaveTextContent('0')
    expect(await tile(/Rejected/)).toHaveTextContent('1')
    expect(await tile(/Active live hosts/)).toHaveTextContent('1')
    expect(await tile(/Suspended or banned/)).toHaveTextContent('1')
  })

  it('counts a banned host under "Suspended or banned", as the server used to', async () => {
    /*
     * ⚠️ The sixth tile covers two statuses. The dead endpoint folded them
     * together server-side; the fallback has to fold them here, which means
     * two probes rather than one. A single `status=SUSPENDED` probe would
     * under-report every banned host and nothing would say so.
     */
    seedMockHosts()
    breakMockStatsRoute()

    server.use(
      http.patch('*/admin/live/hosts/:userId/status', () =>
        HttpResponse.json({ success: true, data: {} }),
      ),
    )

    renderScreen()
    expect(await tile(/Suspended or banned/)).toHaveTextContent('1')
  })

  it('asks the list routes only once the real endpoint has failed', async () => {
    /*
     * ⚠️ The point of the whole phase: on a healthy backend not one of these
     * six probes is issued. A fallback that always runs is a permanent cost
     * paid for a temporary defect.
     */
    const probes: string[] = []
    server.events.removeAllListeners('request:start')
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.searchParams.get('limit') === '1') probes.push(url.pathname)
    })

    seedMockHosts()
    renderScreen()

    await tile(/All applications/)
    await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument())
    expect(probes).toEqual([])
  })

  it('shows em-dashes, never a zero, when the fallback cannot answer either', async () => {
    /*
     * ⚠️ **The most important assertion in this file.** A tile reading
     * "Pending review: 0" when the truth is unknown is the one number an
     * operator acts on by walking away. An em-dash says "unknown"; a zero says
     * "handled, nothing to do".
     */
    seedMockHosts()
    breakMockStatsRoute()
    server.use(
      http.get('*/admin/live/host-applications', () =>
        HttpResponse.json({ success: false }, { status: 500 }),
      ),
      http.get('*/admin/live/hosts', () =>
        HttpResponse.json({ success: false }, { status: 500 }),
      ),
    )

    renderScreen()

    const pending = await tile(/Pending review/)
    await waitFor(() => expect(pending).toHaveTextContent('—'))
    expect(pending).not.toHaveTextContent('0')
  })

  it('leaves the roster tiles navigating, counted or not', async () => {
    /*
     * The two right-hand tiles are the only route from this screen to
     * `/hosts`. Losing their counts must not cost an operator the only
     * navigation they have.
     */
    breakMockStatsRoute()
    renderScreen()

    const roster = await tile(/Active live hosts/)
    expect(roster).toBeEnabled()
    expect(within(roster).getByText(/Opens the host roster/)).toBeInTheDocument()
  })
})

describe('when the stats route works', () => {
  it('uses it, and the fallback contributes nothing', async () => {
    seedMockHosts()
    renderScreen()

    expect(await tile(/All applications/)).toHaveTextContent('3')
    expect(await tile(/Pending review/)).toHaveTextContent('2')
  })
})

/** Named so a search for the broken route finds this file. */
export const REGRESSION = BROKEN
