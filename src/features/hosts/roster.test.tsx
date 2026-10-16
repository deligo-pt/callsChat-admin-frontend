import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { mockLiveHosts, resetMockHosts, seedMockHosts } from '@/mocks/handlers/hosts'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { HostsPage } from './HostsPage'

/**
 * The live host roster and its governance actions — phase H6.
 *
 * ⚠️ This is the most destructive screen in the module: suspending a host who
 * is broadcasting ends their room and disconnects everyone watching (doc §5.2).
 * The assertions below are mostly about **what the operator is told before
 * they confirm**, because the panel cannot observe the teardown itself
 * (plan.md O6) — the copy is the only thing standing between an operator and a
 * consequence they did not expect.
 */

let reads: URL[] = []
let writes: { path: string; body: Record<string, unknown> }[] = []

function renderScreen(entry = '/hosts') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/hosts', element: <HostsPage /> }], {
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

  return userEvent.setup()
}

function lastRead(): URLSearchParams {
  return reads[reads.length - 1]!.searchParams
}

/** The confirmation dialog, by its title. */
function confirmDialog(title: RegExp) {
  return screen.findByRole('dialog', { name: title })
}

beforeEach(() => {
  resetMockHosts()
  seedMockHosts()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })

  reads = []
  writes = []
  server.events.removeAllListeners('request:start')
  server.events.on('request:start', async ({ request }) => {
    const url = new URL(request.url)
    if (!url.pathname.includes('/admin/live/')) return

    if (request.method === 'GET') {
      if (url.pathname.endsWith('/admin/live/hosts')) reads.push(url)
      return
    }

    const clone = request.clone()
    writes.push({
      path: url.pathname,
      body: (await clone.json().catch(() => ({}))) as Record<string, unknown>,
    })
  })
})

describe('arriving from the applications stats strip', () => {
  it('honours ?status=ACTIVE rather than showing everything', async () => {
    /*
     * ⚠️ The link this screen exists to answer. The applications strip sends
     * operators here with `?status=ACTIVE`; dropping the parameter would show
     * a roster that silently answers a different question from the tile they
     * clicked.
     */
    renderScreen('/hosts?status=ACTIVE')

    await waitFor(() => expect(lastRead().get('status')).toBe('ACTIVE'))
    expect(await screen.findByText('Alex Rivers')).toBeInTheDocument()
  })

  it('honours ?status=SUSPENDED', async () => {
    renderScreen('/hosts?status=SUSPENDED')

    await waitFor(() => expect(lastRead().get('status')).toBe('SUSPENDED'))
  })

  it('sends the status upper-case, never normalised', async () => {
    /* `?status=active` is a 400 on this route, as on the applications route. */
    renderScreen('/hosts?status=ACTIVE')

    await waitFor(() => expect(lastRead().get('status')).toBe('ACTIVE'))
  })

  it('drops a hand-edited status the service would reject', async () => {
    renderScreen('/hosts?status=GONE')

    await screen.findByText('Alex Rivers')
    expect(lastRead().get('status')).toBeNull()
  })
})

describe('the empty roster, which is what production shows', () => {
  it('says nobody has been approved, not that something is wrong', async () => {
    resetMockHosts()
    renderScreen()

    expect(await screen.findByText('No live hosts yet')).toBeInTheDocument()
    expect(screen.getByText(/once an application is approved/)).toBeInTheDocument()
  })

  it('offers no clear-filters action when nothing is filtered', async () => {
    resetMockHosts()
    renderScreen()
    await screen.findByText('No live hosts yet')

    expect(screen.queryByRole('button', { name: /clear filters/i })).toBeNull()
  })

  it('says something different when filters are the reason', async () => {
    renderScreen('/hosts?search=nobody-by-this-name')

    expect(await screen.findByText('No hosts match this view')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
  })
})

describe('the rows', () => {
  it('shows the userId, which is the key every write uses', async () => {
    /*
     * ⚠️ Not decoration. The profile `id` and the `userId` both appear on a
     * roster row and they differ; a status write keyed on the wrong one
     * answers "not found for this user", which reads like the host is gone.
     */
    renderScreen()

    expect(await screen.findByText('usr_99')).toBeInTheDocument()
  })

  it('keeps totalLiveHours a float', async () => {
    /* 48.5 is not 48 — a whole-number formatter would under-report by half an hour. */
    renderScreen()

    expect(await screen.findByText(/48\.5 live hrs/)).toBeInTheDocument()
  })

  it('names a host who has no profile at all', async () => {
    renderScreen()
    await screen.findByText('Alex Rivers')

    expect(screen.getByText('No display name')).toBeInTheDocument()
  })

  it('shows why a suspended host is off the platform', async () => {
    renderScreen()

    expect(
      await screen.findByText(/Repeated copyright infringement/),
    ).toBeInTheDocument()
  })
})

describe('suspending a host', () => {
  it('states that a running stream ends and viewers are disconnected', async () => {
    /*
     * ⚠️ **The assertion this phase exists for.** Doc §5.2: the backend ends
     * the live room and evicts viewers. An operator clicking a button labelled
     * "Suspend" would not expect that, and the panel cannot show it happening
     * (plan.md O6) — so saying it beforehand is the only protection there is.
     */
    const user = renderScreen()
    await user.click(
      await screen.findByRole('button', { name: /suspend alex rivers/i }),
    )

    const dialog = await confirmDialog(/suspend this host/i)
    expect(within(dialog).getByText(/ends that room immediately/i)).toBeInTheDocument()
    expect(
      within(dialog).getByText(/everyone watching is disconnected/i),
    ).toBeInTheDocument()
  })

  it('sends nothing until it is confirmed', async () => {
    const user = renderScreen()
    await user.click(
      await screen.findByRole('button', { name: /suspend alex rivers/i }),
    )
    await confirmDialog(/suspend this host/i)

    expect(writes).toHaveLength(0)
  })

  it('requires a reason, and says it is sent to the host', async () => {
    const user = renderScreen()
    await user.click(
      await screen.findByRole('button', { name: /suspend alex rivers/i }),
    )

    const dialog = await confirmDialog(/suspend this host/i)
    expect(within(dialog).getByText(/sent to the host/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /suspend the host/i }))

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('writes to the userId, not the profile id', async () => {
    /*
     * ⚠️ `usr_99` and `prof_123` are both on the row. Sending the wrong one
     * answers a 404 that reads like the host no longer exists.
     */
    const user = renderScreen()
    await user.click(
      await screen.findByRole('button', { name: /suspend alex rivers/i }),
    )

    const dialog = await confirmDialog(/suspend this host/i)
    await user.type(
      within(dialog).getByLabelText(/reason/i),
      'Repeated copyright strikes on live audio.',
    )
    await user.click(within(dialog).getByRole('button', { name: /suspend the host/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.path).toContain('/admin/live/hosts/usr_99/status')
    expect(writes[0]!.path).not.toContain('prof_123')
    expect(writes[0]!.body).toEqual({
      status: 'SUSPENDED',
      reason: 'Repeated copyright strikes on live audio.',
    })

    await waitFor(() => {
      expect(mockLiveHosts().find((h) => h.userId === 'usr_99')?.status).toBe(
        'SUSPENDED',
      )
    })

    /*
     * ⚠️ Settle before the test ends. A successful status write invalidates two
     * query keys and closes the dialog; stopping at the assertion lets those
     * refetches land after the next test's `resetMockHosts()` and corrupt the
     * roster it is about to read. Caught here by the reactivate test, which
     * passed alone and failed in file order — the same order-dependency that
     * bit `edits.test.tsx` and `review.test.tsx`.
     */
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('banning a host', () => {
  it('requires a reason too, which the doc never says', async () => {
    /*
     * ⚠️ Measured, not read: `{"status":"BANNED"}` alone is a
     * `400 body/reason A reason of at least 5 characters is required when
     * suspending or banning a host`. The doc attaches a reason to suspension
     * only (§5.2) and shows reactivation without one (§5.3).
     */
    const user = renderScreen()
    await user.click(await screen.findByRole('button', { name: /ban alex rivers/i }))

    const dialog = await confirmDialog(/ban this host/i)
    await user.click(within(dialog).getByRole('button', { name: /ban the host/i }))

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('sends status and reason', async () => {
    const user = renderScreen()
    await user.click(await screen.findByRole('button', { name: /ban alex rivers/i }))

    const dialog = await confirmDialog(/ban this host/i)
    await user.type(
      within(dialog).getByLabelText(/reason/i),
      'Repeated policy violations after a prior suspension.',
    )
    await user.click(within(dialog).getByRole('button', { name: /ban the host/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body['status']).toBe('BANNED')
    expect(writes[0]!.body['reason']).toContain('Repeated policy violations')

    /*
     * ⚠️ Settle before the test ends. A successful status write invalidates two
     * query keys and closes the dialog; stopping at the assertion lets those
     * refetches land after the next test's `resetMockHosts()` and corrupt the
     * roster it is about to read. Caught here by the reactivate test, which
     * passed alone and failed in file order — the same order-dependency that
     * bit `edits.test.tsx` and `review.test.tsx`.
     */
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('reactivating a host', () => {
  it('is offered instead of suspend once a host is off the platform', async () => {
    renderScreen('/hosts?status=SUSPENDED')

    expect(
      await screen.findByRole('button', { name: /reactivate/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^suspend/i })).toBeNull()
  })

  it('asks for no reason, because the API accepts none', async () => {
    /*
     * ⚠️ `{ "status": "ACTIVE" }` is the whole body — verified. Demanding ten
     * characters the client then discards would imply a record never sent.
     */
    const user = renderScreen('/hosts?status=SUSPENDED')
    await user.click(await screen.findByRole('button', { name: /reactivate/i }))

    const dialog = await confirmDialog(/reactivate this host/i)
    expect(within(dialog).queryByLabelText(/reason/i)).toBeNull()
  })

  it('is no harder than suspending was', async () => {
    /*
     * ⚠️ One dialog, same as breaking it — never more. The bootstrap module
     * settled this: the person undoing the damage is often not the one who
     * caused it, and every extra step is time a creator stays offline.
     */
    const user = renderScreen('/hosts?status=SUSPENDED')
    await user.click(await screen.findByRole('button', { name: /reactivate/i }))

    const dialog = await confirmDialog(/reactivate this host/i)
    await user.click(
      within(dialog).getByRole('button', { name: /reactivate the host/i }),
    )

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body).toEqual({ status: 'ACTIVE' })

    /*
     * ⚠️ Settle before the test ends. A successful status write invalidates two
     * query keys and closes the dialog; stopping at the assertion lets those
     * refetches land after the next test's `resetMockHosts()` and corrupt the
     * roster it is about to read. Caught here by the reactivate test, which
     * passed alone and failed in file order — the same order-dependency that
     * bit `edits.test.tsx` and `review.test.tsx`.
     */
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('does not promise that anything is restored', async () => {
    /*
     * The torn-down room does not come back and its viewers are not returned.
     * An operator reactivating someone mid-incident should not believe
     * otherwise.
     */
    const user = renderScreen('/hosts?status=SUSPENDED')
    await user.click(await screen.findByRole('button', { name: /reactivate/i }))

    const dialog = await confirmDialog(/reactivate this host/i)
    expect(within(dialog).getByText(/Nothing that ended/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/is not brought back/i)).toBeInTheDocument()
  })
})
