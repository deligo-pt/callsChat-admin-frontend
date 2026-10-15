import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { resetMockHosts, seedMockHosts } from '@/mocks/handlers/hosts'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { HostApplicationsPage } from './HostApplicationsPage'

/**
 * The host-applications queue — phase H4.
 *
 * ⚠️ **Half this file is about the empty state, which is deliberate.** The live
 * service holds zero applications (plan.md §2.1), so "nothing at all" is the
 * screen an operator actually gets today — not an edge case to be covered once
 * the happy path works. Three states have to stay distinguishable, and
 * flattening any two of them tells an operator something untrue.
 */

/** Every `GET /admin/live/host-applications` URL the screen issued. */
let reads: URL[] = []

function renderScreen(entry = '/host-applications') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/host-applications', element: <HostApplicationsPage /> },
      { path: '/hosts', element: <div>host roster</div> },
    ],
    { initialEntries: [entry] },
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

  return userEvent.setup()
}

function lastRead(): URLSearchParams {
  return reads[reads.length - 1]!.searchParams
}

/**
 * Wait for a stats-strip tile.
 *
 * ⚠️ **The strip resolves on its own query, later than the list.** Waiting for
 * a row and then reaching for a tile synchronously is a race: the list lands
 * first, `stats.data` is still undefined, `StatsStrip` returns null, and the
 * button does not exist yet. It passes on a fast machine and fails under load
 * — the exact shape that cost a session of debugging in the bootstrap module.
 */
function tile(name: RegExp) {
  return screen.findByRole('button', { name })
}

beforeEach(() => {
  resetMockHosts()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })

  reads = []
  server.events.removeAllListeners('request:start')
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    /*
     * ⚠️ Scoped to the list route, not to "any GET". An unscoped listener also
     * captures `/admin/auth/me` and the stats call, and `lastRead()` would then
     * report whichever happened to land last — a race that passes locally and
     * fails under load. That exact bug cost a session's worth of debugging in
     * the bootstrap module.
     */
    if (
      request.method === 'GET' &&
      url.pathname.endsWith('/admin/live/host-applications')
    ) {
      reads.push(url)
    }
  })
})

describe('the empty state, which is the only thing production can show', () => {
  it('says nothing has been submitted, not that something is wrong', async () => {
    renderScreen()

    expect(await screen.findByText('No applications yet')).toBeInTheDocument()
    expect(
      screen.getByText(/Applications appear here as soon as a creator applies/),
    ).toBeInTheDocument()
  })

  it('offers no "clear filters" action when nothing is filtered', async () => {
    /*
     * ⚠️ The distinction this whole describe exists for. Offering a way out of
     * filters that are not applied tells an operator the queue is hiding
     * something from them, when in truth it is simply empty.
     */
    renderScreen()
    await screen.findByText('No applications yet')

    expect(screen.queryByRole('button', { name: /clear filters/i })).toBeNull()
  })

  it('says something different when filters are the reason', async () => {
    seedMockHosts()
    renderScreen('/host-applications?status=APPROVED')

    expect(
      await screen.findByText('No applications match this view'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
  })

  it('clearing the filters from the empty state restores the queue', async () => {
    seedMockHosts()
    const user = renderScreen('/host-applications?status=APPROVED')
    await screen.findByText('No applications match this view')

    await user.click(screen.getByRole('button', { name: /clear filters/i }))

    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument()
  })

  it('never flattens a failed request into "no results"', async () => {
    /*
     * ⚠️ The worst of the three confusions. "No applications yet" after a 500
     * tells an operator the queue is empty when the truth is that it is
     * unknown — and they would stop looking.
     */
    server.use(
      http.get('*/admin/live/host-applications', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'boom' } },
          { status: 500 },
        ),
      ),
    )
    renderScreen()

    await waitFor(() => {
      expect(screen.queryByText('No applications yet')).toBeNull()
    })
    expect(
      await screen.findByRole('button', { name: /try again/i }),
    ).toBeInTheDocument()
  })

  it('hides the pager rather than reading "Page 1 of 1" over an empty table', async () => {
    /*
     * ⚠️ The service answers `totalPages: 1` for a table with zero rows, so a
     * pager driven straight off the response dresses "nothing exists" up as
     * "you have reached the end".
     */
    renderScreen()
    await screen.findByText('No applications yet')

    expect(screen.queryByRole('navigation', { name: /pagination/i })).toBeNull()
  })
})

describe('the filters reach the wire correctly', () => {
  it('sends no status at all when the facet is Any', async () => {
    renderScreen()
    await screen.findByText('No applications yet')

    expect(lastRead().get('status')).toBeNull()
  })

  it('sends the status upper-case, never normalised', async () => {
    /*
     * ⚠️ `status` is case-SENSITIVE on this route (plan.md §3.1) — a
     * lower-cased value is a 400, not a tolerated request. This is the
     * assertion that fails if anyone adds a `.toLowerCase()` on the way out.
     */
    renderScreen('/host-applications?status=PENDING')

    await waitFor(() => expect(lastRead().get('status')).toBe('PENDING'))
  })

  it('drops a hand-edited status the service would reject', async () => {
    /*
     * A pasted `?status=OPEN` must not 400 the whole page. It is dropped and
     * the queue renders unfiltered, which is the recoverable failure.
     */
    renderScreen('/host-applications?status=OPEN')

    await screen.findByText('No applications yet')
    expect(lastRead().get('status')).toBeNull()
  })

  it('drops a hand-edited niche, because the server will not', async () => {
    /*
     * ⚠️ The opposite reason from the status above. `?niche=GARBAGE` answers
     * **200** and returns the wrong set (plan.md §3.2) — there is no 400 to
     * protect against, which is precisely why the panel has to.
     */
    renderScreen('/host-applications?niche=ASTROLOGY')

    await screen.findByText('No applications yet')
    expect(lastRead().get('niche')).toBeNull()
  })

  it('drops an unparseable date', async () => {
    renderScreen('/host-applications?startDate=yesterday')

    await screen.findByText('No applications yet')
    expect(lastRead().get('startDate')).toBeNull()
  })

  it('sends a well-formed date through', async () => {
    renderScreen('/host-applications?startDate=2026-10-13')

    await waitFor(() => expect(lastRead().get('startDate')).toBe('2026-10-13'))
  })

  it('returns to page 1 when a filter changes', async () => {
    seedMockHosts()
    const user = renderScreen('/host-applications?page=3')
    await waitFor(() => expect(lastRead().get('page')).toBe('3'))

    await user.click(await tile(/pending review/i))

    await waitFor(() => {
      expect(lastRead().get('status')).toBe('PENDING')
      /*
       * ⚠️ `'1'`, not absent. Changing a filter deletes `page` from the URL,
       * but the query object always carries a page — `readInt` falls back to 1
       * — so the wire sees `page=1`. Asserting absence here would have been
       * asserting something about the URL while reading the request, which are
       * two different things.
       */
      expect(lastRead().get('page')).toBe('1')
    })
  })
})

describe('the rows', () => {
  it('lists the seeded applications', async () => {
    seedMockHosts()
    renderScreen()

    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument()
    expect(screen.getByText('Rafa')).toBeInTheDocument()
  })

  it('names an applicant who has no profile at all', async () => {
    /*
     * ⚠️ The hostile fixture. `user.profile` is null, which is an ordinary
     * account state — and a blank cell in a queue an operator has to triage
     * reads as a rendering bug rather than as information.
     */
    seedMockHosts()
    renderScreen()
    await screen.findByText('Alice Johnson')

    expect(screen.getByText('No display name')).toBeInTheDocument()
  })

  it('renders a niche the panel has never heard of, verbatim', async () => {
    seedMockHosts()
    renderScreen()

    expect(await screen.findByText('ASTROLOGY')).toBeInTheDocument()
  })

  it('says so when no weekly commitment was given', async () => {
    seedMockHosts()
    renderScreen()
    await screen.findByText('Alice Johnson')

    expect(screen.getByText('No commitment given')).toBeInTheDocument()
  })
})

describe('the stats strip spans two screens', () => {
  it('reports the six platform counters', async () => {
    seedMockHosts()
    renderScreen()

    const strip = await screen.findByRole('region', { name: /all host applications/i })
    expect(within(strip).getByText('Pending review')).toBeInTheDocument()
    expect(within(strip).getByText('Active live hosts')).toBeInTheDocument()
  })

  it('says the numbers ignore the filters below', async () => {
    seedMockHosts()
    renderScreen()
    const strip = await screen.findByRole('region', { name: /all host applications/i })

    expect(
      within(strip).getByText(/Platform totals, unaffected by the filters below/),
    ).toBeInTheDocument()
  })

  it('a queue tile filters the queue', async () => {
    seedMockHosts()
    const user = renderScreen()
    await screen.findByText('Alice Johnson')

    await user.click(await tile(/rejected/i))

    await waitFor(() => expect(lastRead().get('status')).toBe('REJECTED'))
  })

  it('a roster tile navigates instead, because this queue cannot answer it', async () => {
    /*
     * ⚠️ The design point of the strip. `activeHostsCount` counts hosts, and
     * the table below lists applications — a tile that filtered this queue by
     * it would promise an answer the list route cannot give.
     */
    seedMockHosts()
    const user = renderScreen()
    await screen.findByText('Alice Johnson')

    await user.click(await tile(/active live hosts/i))

    expect(await screen.findByText('host roster')).toBeInTheDocument()
  })
})
