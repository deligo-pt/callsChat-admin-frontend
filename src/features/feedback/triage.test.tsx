import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resetMockFeedback } from '@/mocks/handlers/feedback'
import { server } from '@/mocks/server'
import { FEEDBACK_STATUS_VALUES } from '@/types/feedback'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { FeedbackDetailPage } from './FeedbackDetailPage'
import { transitionsFor } from './transitions'

/**
 * Triage — phase F3.
 *
 * Three mutations, and every assertion here is about something the API does
 * that the UI has to compensate for rather than mirror:
 *
 * - the API **accepts** a same-status transition and writes a junk audit row
 *   (§3.4), so the menu must never offer one;
 * - `PATCH /:id/status` returns two different shapes non-deterministically
 *   (§3.2), so no response may be rendered;
 * - `adminId` is **required even to unassign** (§2.3), so "none" is a value
 *   that must be sent, not a key that can be dropped;
 * - the candidate list comes from a `verifySuperAdmin` route with no
 *   alternative (§3.11), so its failure must not break the page.
 *
 * Every mutating test below waits for the **settled UI**, not merely for the
 * request to be recorded. `writes` is appended at `request:start`, so a test
 * that stopped there could finish — and `resetMockFeedback` could run for the
 * next test — while the mock handler was still mutating its ticket. That leaked
 * a `CRITICAL` priority into the following test and made this file order
 * dependent. Asserting the outcome is both the fix and the better assertion.
 */

/** Every write this page issued, in order. */
let writes: { method: string; path: string; body: unknown }[] = []

function renderTicket(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/feedback/:id', element: <FeedbackDetailPage /> },
      { path: '/feedback', element: <div>the queue</div> },
      { path: '/users/:id', element: <div>user account</div> },
    ],
    { initialEntries: [`/feedback/${id}`] },
  )

  render(
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={0}>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/** The triage card, so a badge assertion cannot match the page header. */
async function triageCard(): Promise<HTMLElement> {
  const title = await screen.findByText('Triage')
  return title.closest('div[data-slot="card"]') as HTMLElement
}

beforeEach(() => {
  resetMockFeedback()
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })

  writes = []
  server.events.removeAllListeners('request:start')
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'GET') return
    const clone = request.clone()
    writes.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: await clone.json().catch(() => null),
    })
  })
})

describe('the status menu', () => {
  it('offers exactly transitionsFor(current), and never the current status', async () => {
    /*
     * ⚠️ §3.4 — the mitigation, and the only one there is. The API accepts a
     * `PENDING → PENDING` move and writes it into the audit trail, so nothing
     * server-side prevents the junk row; the menu not offering it is the
     * whole defence.
     */
    const user = renderTicket('fb_pending')
    const card = await triageCard()

    await user.click(within(card).getByRole('button', { name: /Move to…/ }))

    const items = await screen.findAllByRole('menuitem')
    const labels = items.map((item) => item.textContent)

    expect(labels).toEqual(['Reviewing', 'In progress', 'Closed'])
    expect(transitionsFor('PENDING')).toHaveLength(3)
    expect(labels).not.toContain('Pending')
  })

  it('offers a legal, non-empty menu in every one of the six states', () => {
    /*
     * Asserted from the matrix rather than by rendering six tickets: §2.5
     * guarantees no dead ends, which is why `StatusAction` has no empty-menu
     * branch to render.
     */
    for (const status of FEEDBACK_STATUS_VALUES) {
      const options = transitionsFor(status)
      expect(options.length).toBeGreaterThan(0)
      expect(options).not.toContain(status)
    }
  })

  it('requires a note, and tells the truth about where it goes', async () => {
    const user = renderTicket('fb_pending')
    const card = await triageCard()

    await user.click(within(card).getByRole('button', { name: /Move to…/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Reviewing' }))

    const dialog = await screen.findByRole('dialog')
    /*
     * Unlike the staff module, where the reason is posted and never readable
     * again, this note lands in `statusHistory[].note` — so the hint is
     * allowed to promise a record, and it also says who does *not* see it.
     */
    expect(
      within(dialog).getByText(/Recorded in this ticket's history/),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/not sent to Jamie Okafor/)).toBeInTheDocument()

    /* Nothing is sent until the note clears the ten-character floor. */
    expect(writes).toHaveLength(0)
  })

  it('sends the note with the transition', async () => {
    const user = renderTicket('fb_pending')
    const card = await triageCard()

    await user.click(within(card).getByRole('button', { name: /Move to…/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Reviewing' }))

    const dialog = await screen.findByRole('dialog')
    await user.type(
      within(dialog).getByLabelText(/reason/i),
      'Reproduced on a test device.',
    )
    await user.click(within(dialog).getByRole('button', { name: /Move to Reviewing/ }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/v1/admin/feedbacks/fb_pending/status',
      body: { status: 'REVIEWING', note: 'Reproduced on a test device.' },
    })
    expect(await within(await triageCard()).findByText('Reviewing')).toBeInTheDocument()
  })

  it('renders the server’s own successor list when a transition is refused', async () => {
    /*
     * The API rejects an illegal move with a message naming the legal
     * successors. That is more useful than anything the panel could write, and
     * it is the authority on a rule the client only mirrors — so it is shown
     * verbatim.
     */
    server.use(
      http.patch('*/admin/feedbacks/:id/status', () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'BAD_REQUEST',
              message:
                "Invalid status transition from 'PENDING' to 'RESOLVED'. Allowed transitions: REVIEWING, IN_PROGRESS, CLOSED.",
            },
          },
          { status: 400 },
        ),
      ),
    )

    const user = renderTicket('fb_pending')
    const card = await triageCard()

    await user.click(within(card).getByRole('button', { name: /Move to…/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Closed' }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/reason/i), 'Closing as duplicate.')
    await user.click(within(dialog).getByRole('button', { name: /Move to Closed/ }))

    expect(
      await screen.findByText(/Allowed transitions: REVIEWING, IN_PROGRESS, CLOSED/),
    ).toBeInTheDocument()
  })
})

describe('priority', () => {
  it('changes without a confirmation dialog', async () => {
    /*
     * The deliberate asymmetry with status beside it: reversible in one click,
     * private to staff, invisible to the reporter. Ceremony spent here is what
     * teaches an operator to click through the dialog that matters.
     */
    const user = renderTicket('fb_pending')
    const card = await triageCard()

    await user.click(within(card).getByRole('button', { name: 'Change' }))
    await user.click(await screen.findByRole('menuitem', { name: /Critical/ }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/v1/admin/feedbacks/fb_pending',
      body: { priority: 'CRITICAL' },
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    /* Settled: the refetched ticket shows the new value. */
    expect(await within(await triageCard()).findByText('Critical')).toBeInTheDocument()
  })

  it('never sends adminResponse, whose single writer is the reply composer', async () => {
    /*
     * ⚠️ §3.3. `PATCH /:id` accepts `adminResponse` too, and `POST /:id/reply`
     * overwrites it silently. A second writer would destroy whichever wrote
     * first, without telling anyone.
     */
    const user = renderTicket('fb_pending')
    const card = await triageCard()

    await user.click(within(card).getByRole('button', { name: 'Change' }))
    await user.click(await screen.findByRole('menuitem', { name: /Critical/ }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(Object.keys(writes[0]!.body as object)).toEqual(['priority'])
    expect(await within(await triageCard()).findByText('Critical')).toBeInTheDocument()
  })

  it('disables the current value rather than hiding it', async () => {
    // A scale, not a state machine: seeing where the ticket sits is the point.
    const user = renderTicket('fb_pending')
    const card = await triageCard()

    await user.click(within(card).getByRole('button', { name: 'Change' }))

    const items = await screen.findAllByRole('menuitem')
    expect(items).toHaveLength(4)
    expect(items.find((item) => item.textContent?.includes('High'))).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})

describe('assignment', () => {
  it('offers only ACTIVE staff', async () => {
    /*
     * `PATCH /:id/assign` answers 400 for a suspended or banned staff member
     * and 404 for a soft-deleted one, and `GET /admin/staff` returns all of
     * them. Offering one would be offering a failure.
     */
    const user = renderTicket('fb_pending')
    const card = await triageCard()

    await user.click(within(card).getByRole('button', { name: 'Assign this ticket' }))

    expect(
      await screen.findByRole('option', { name: /Sarah Connor/ }),
    ).toBeInTheDocument()
    /* `Probe Temp` is the soft-deleted row the staff mock keeps in its list. */
    expect(screen.queryByRole('option', { name: /Probe Temp/ })).not.toBeInTheDocument()
  })

  it('sends the selected staff id', async () => {
    const user = renderTicket('fb_pending')
    const card = await triageCard()

    await user.click(within(card).getByRole('button', { name: 'Assign this ticket' }))
    await user.click(await screen.findByRole('option', { name: /Sarah Connor/ }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/v1/admin/feedbacks/fb_pending/assign',
      body: { adminId: 'stf_sarah' },
    })
    expect(
      await within(await triageCard()).findByText('Sarah Connor'),
    ).toBeInTheDocument()
  })

  it('sends an explicit null to unassign — the key cannot be omitted', async () => {
    /*
     * ⚠️ §2.3. Omitting `adminId` answers `400 body/adminId Required`, which is
     * the opposite of this codebase's usual rule for optional fields. "None" is
     * a value here, and the assertion is that the key is *present* and null —
     * not merely that the body lacks an id.
     */
    const user = renderTicket('fb_in_progress')
    const card = await triageCard()

    await user.click(within(card).getByRole('button', { name: 'Assign this ticket' }))
    await user.click(await screen.findByRole('option', { name: /Unassign/ }))

    await waitFor(() => expect(writes).toHaveLength(1))
    const body = writes[0]!.body as Record<string, unknown>
    expect('adminId' in body).toBe(true)
    expect(body['adminId']).toBeNull()
    expect(
      await within(await triageCard()).findByText('Unassigned'),
    ).toBeInTheDocument()
  })

  it('offers no Unassign on a ticket nobody holds', async () => {
    const user = renderTicket('fb_pending')
    const card = await triageCard()

    await user.click(within(card).getByRole('button', { name: 'Assign this ticket' }))
    await screen.findByRole('option', { name: /Sarah Connor/ })

    expect(screen.queryByRole('option', { name: /Unassign/ })).not.toBeInTheDocument()
  })

  it('renders a staff-list 403 inline rather than breaking the page', async () => {
    /*
     * ⚠️ §3.11. The candidate list comes from a `verifySuperAdmin` route with
     * no alternative. The day `FEEDBACK_MANAGEMENT` becomes grantable, an
     * ADMIN opening this control gets a 403 from *that* call — and the ticket
     * they were reading must survive it.
     */
    server.use(
      http.get('*/admin/staff', () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Requires SUPER_ADMIN privileges' },
          },
          { status: 403 },
        ),
      ),
    )

    const user = renderTicket('fb_pending')
    const card = await triageCard()

    await user.click(within(card).getByRole('button', { name: 'Assign this ticket' }))

    expect(await screen.findByText('Staff list unavailable')).toBeInTheDocument()
    expect(screen.getByText(/Requires SUPER_ADMIN privileges/)).toBeInTheDocument()
    /* The ticket itself is untouched. */
    expect(
      screen.getByRole('heading', { level: 1, name: /Audio cuts out/ }),
    ).toBeInTheDocument()
  })
})

describe('no mutation response is ever rendered (§3.2)', () => {
  it('keeps the reporter on screen after a transition that answers Partial', async () => {
    /*
     * ⚠️ THE assertion of this phase. `PATCH /:id/status` returned the full
     * record on 2 of 12 identical consecutive requests and a 15-key record
     * with no relations on the other 10 — same body, same ticket, seconds
     * apart. Seeding the cache from it would blank the reporter, the
     * attachments and the reply stream at random on a *successful* write.
     *
     * The mock alternates the two shapes deliberately; this forces the Partial
     * one and asserts the page is unmoved.
     */
    server.use(
      http.patch('*/admin/feedbacks/:id/status', ({ params }) =>
        HttpResponse.json({
          success: true,
          data: {
            id: params['id'],
            userId: 'usr_sarah_reporter',
            type: 'BUG',
            subject: 'Audio cuts out during group call',
            description: 'Partial shape — no relations at all.',
            status: 'REVIEWING',
            priority: 'HIGH',
            userDeviceInfo: null,
            adminResponse: null,
            assignedAdminId: null,
            resolvedAt: null,
            closedAt: null,
            createdAt: '2026-09-05T10:00:00.000Z',
            updatedAt: '2026-09-07T10:00:00.000Z',
          },
        }),
      ),
    )

    const user = renderTicket('fb_pending')
    const card = await triageCard()
    expect(
      await screen.findByRole('link', { name: 'Jamie Okafor' }),
    ).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: /Move to…/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Reviewing' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/reason/i), 'Triaging this now.')
    await user.click(within(dialog).getByRole('button', { name: /Move to Reviewing/ }))

    await waitFor(() => expect(writes).toHaveLength(1))

    /*
     * The relations the Partial response omitted are still on screen, because
     * they came from a refetch of `GET /:id` and never from the write.
     */
    expect(
      await screen.findByRole('link', { name: 'Jamie Okafor' }),
    ).toBeInTheDocument()
    expect(screen.getByText('screenshot-1.png')).toBeInTheDocument()
    expect(
      screen.queryByText('Partial shape — no relations at all.'),
    ).not.toBeInTheDocument()
  })
})
