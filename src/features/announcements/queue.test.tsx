import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { delay, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  mockAnnouncements,
  resetMockAnnouncements,
} from '@/mocks/handlers/announcements'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { API_PREFIX } from '@/mocks/handlers/shared'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor } from '@tests/render'

import { AnnouncementsPage } from './AnnouncementsPage'

/**
 * The announcements queue (plan.md §7, phase B2).
 *
 * Narrow on purpose. The contract and the mock are already pinned by
 * `contract.test.ts` and `mockFidelity.test.ts` (74 tests between them), so
 * this file asserts only the behaviours that live in the *screen* and would be
 * expensive to discover later — above all the optimistic pin and its rollback,
 * which no amount of contract testing can reach.
 *
 * ⚠️ Every assertion waits for a **control or a row**, never for static copy.
 * A page's headings and notices render on the first paint while everything
 * data-driven is still loading, so awaiting a heading proves nothing.
 */

function mount(entry = '/announcements') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/announcements', element: <AnnouncementsPage /> }],
    { initialEntries: [entry] },
  )

  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TooltipProvider delayDuration={0}>
          <RouterProvider router={router} />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

/** The seeded fixtures, by headline. */
const PINNED_ROW = 'Important Security Update'
const DRAFT_ROW = 'Business tools are coming to your workspace'
const DRAFT_ID = 'cmutnyeq9000301mkrnqsid3o'

beforeEach(() => {
  resetMockAnnouncements()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the queue opens unfiltered', () => {
  it('shows drafts and published rows together', async () => {
    mount()

    /*
     * ⚠️ The behaviour that distinguishes this queue from the verification one.
     * There the default is `PENDING` and decided rows are hidden; here a draft
     * and a published announcement must both be on screen from the first paint,
     * because nobody is waiting on an announcement and the operator's question
     * is about the whole table.
     */
    expect(await screen.findByText(PINNED_ROW)).toBeInTheDocument()
    expect(screen.getByText(DRAFT_ROW)).toBeInTheDocument()
  })

  it('offers no sort control on any column', async () => {
    mount()
    await screen.findByText(PINNED_ROW)

    /*
     * `sortBy` is not in the query schema and this API silently drops unknown
     * parameters, so a header control would reorder nothing (O4). Asserted on
     * the headers rather than on the column config, because the config is only
     * a claim about what gets rendered.
     */
    const headers = screen.getAllByRole('columnheader')
    for (const header of headers) {
      expect(header.querySelector('button')).toBeNull()
    }
  })
})

describe('filters live in the URL', () => {
  it('reads a status filter from the query string', async () => {
    mount('/announcements?status=DRAFT')

    expect(await screen.findByText(DRAFT_ROW)).toBeInTheDocument()
    expect(screen.queryByText(PINNED_ROW)).not.toBeInTheDocument()
  })

  it('drops a hand-edited value the API would reject, rather than 400ing', async () => {
    /*
     * ⚠️ `SCHEDULED` was a real value in the invented schema this module
     * replaced, so a stale bookmark carrying it is a genuine possibility. All
     * four facets are validated strictly server-side, so sending it would take
     * the whole page down with a 400; it is dropped and the default renders.
     */
    mount('/announcements?status=SCHEDULED')

    expect(await screen.findByText(PINNED_ROW)).toBeInTheDocument()
    expect(screen.getByText(DRAFT_ROW)).toBeInTheDocument()
  })

  it('narrows to unpinned rows, which a checkbox could not express', async () => {
    mount('/announcements?pinned=false')

    expect(await screen.findByText(DRAFT_ROW)).toBeInTheDocument()
    /* The pinned fixture must be gone — `isPinned=false` is a real narrowing. */
    expect(screen.queryByText(PINNED_ROW)).not.toBeInTheDocument()
  })

  it('clears every filter at once, and genuinely empties the chip row', async () => {
    /*
     * ⚠️ The verification queue needed two attempts at this, because its
     * default view is itself a filter so "Clear all" could land on a chip and
     * appear to half-work. Here every facet defaults to `ALL`, so clearing is
     * unambiguous — and this test is what stops a default being introduced
     * later without noticing it breaks the button.
     */
    const user = userEvent.setup()
    mount('/announcements?status=DRAFT&priority=NORMAL')

    await screen.findByText(DRAFT_ROW)
    await user.click(screen.getByRole('button', { name: /clear all/i }))

    expect(await screen.findByText(PINNED_ROW)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument()
  })
})

describe('the pin toggle', () => {
  it('names the outcome, not the current state', async () => {
    mount()
    await screen.findByText(PINNED_ROW)

    /*
     * A control labelled "Pinned" leaves a screen-reader user unsure whether
     * pressing it pins or unpins. The pinned fixture's button must therefore
     * offer to UNpin it.
     */
    expect(
      await screen.findByRole('button', { name: `Unpin ${PINNED_ROW}` }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Pin ${DRAFT_ROW}` })).toBeInTheDocument()
  })

  it('flips the row before the server answers, then defers to the refetch', async () => {
    /*
     * ⚠️ The delay is what makes this a test about optimism at all. Without it
     * the request completes so fast under MSW that a flipped label proves
     * nothing — it could equally have come from the refetch. Held for 150ms,
     * the label can only have flipped because `onMutate` patched the cache.
     *
     * The stub then answers `isPinned: true` **without touching the store**,
     * which is the second half of the test: the row ends up unpinned anyway,
     * because nothing in this module is ever seeded from a write response (§3.2
     * — there is no detail route to refetch, so the list is the only truth).
     * A cache that trusted the response would show a pinned row forever and
     * disagree with the next person to load the page.
     */
    server.use(
      http.post(`${API_PREFIX}/admin/announcements/:id/pin`, async () => {
        await delay(150)
        return Response.json({
          success: true,
          data: { id: DRAFT_ID, title: DRAFT_ROW, content: 'x', isPinned: true },
        })
      }),
    )

    const user = userEvent.setup()
    mount()
    await screen.findByText(DRAFT_ROW)

    await user.click(screen.getByRole('button', { name: `Pin ${DRAFT_ROW}` }))

    /*
     * No `waitFor`: the label must ALREADY have flipped, while the POST is
     * still in flight. The server has not answered and cannot have.
     */
    expect(
      screen.getByRole('button', { name: `Unpin ${DRAFT_ROW}` }),
    ).toBeInTheDocument()

    /* Then the refetch lands and the server's view — unpinned — wins. */
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: `Pin ${DRAFT_ROW}` }),
      ).toBeInTheDocument()
    })
    expect(mockAnnouncements().find((row) => row.id === DRAFT_ID)?.isPinned).toBe(false)
  })

  it('rolls the row back when the write fails, without waiting for a refetch', async () => {
    /*
     * ⚠️ **The most important test in this file, and it took two attempts to
     * make it mean anything.**
     *
     * The first version clicked, then `waitFor`-ed the label back to "Pin".
     * That passed with `onError` deleted — because `onSettled` invalidates on
     * failure too, so the refetch converges on the truth either way. A test
     * that cannot fail is not a guard, and mutation-testing is what exposed it.
     *
     * So the refetch is **held for 250ms** here. That isolates the rollback: in
     * the window between the failed POST and the refetch landing, the only
     * thing that can correct the row is `onError` restoring the snapshot. With
     * it deleted, an operator spends that window looking at a pinned badge on a
     * row the server never pinned.
     */
    let listStarted = 0
    /* ⚠️ Completions, not invocations: the refetch *starts* immediately and is
     * then held, so counting calls would prove nothing about whether its data
     * has landed. */
    let listResolved = 0
    server.use(
      http.post(`${API_PREFIX}/admin/announcements/:id/pin`, () =>
        Response.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Pin failed' } },
          { status: 500 },
        ),
      ),
      http.get(`${API_PREFIX}/admin/announcements`, async () => {
        listStarted += 1
        /* The first call is the page load; only the refetch is slowed. */
        if (listStarted > 1) await delay(250)
        listResolved += 1
        return Response.json({
          success: true,
          data: mockAnnouncements(),
          pagination: {
            page: 1,
            limit: 25,
            total: mockAnnouncements().length,
            totalPages: 1,
          },
        })
      }),
    )

    const user = userEvent.setup()
    mount()
    await screen.findByText(DRAFT_ROW)

    await user.click(screen.getByRole('button', { name: `Pin ${DRAFT_ROW}` }))

    /*
     * `waitFor` only for the 500 to arrive — not for the refetch, which is
     * still 250ms away. What it finds is the rollback's work, not the server's.
     */
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: `Pin ${DRAFT_ROW}` }),
      ).toBeInTheDocument()
    })
    expect(listResolved).toBe(1)

    /* And the record itself never moved. */
    expect(mockAnnouncements().find((row) => row.id === DRAFT_ID)?.isPinned).toBe(false)
  })
})

describe('the stats strip', () => {
  it('reports platform totals and says that is what they are', async () => {
    mount()
    await screen.findByText(PINNED_ROW)

    /*
     * The route takes no parameters and ignores every filter, so the strip must
     * not read as describing the queue beneath it.
     */
    expect(
      await screen.findByText(/platform totals, unaffected by the filters/i),
    ).toBeInTheDocument()
  })

  it('offers a filter for the three facets that have one, and not for reach', async () => {
    mount()
    await screen.findByText(PINNED_ROW)

    /*
     * ⚠️ Published, Draft and Pinned are buttons; Views and Read receipts are
     * not. There is no `?minViews=` and no per-announcement breakdown endpoint
     * (O10), so a pressable reach tile would promise a filter that cannot
     * exist.
     */
    const strip = screen.getByRole('region', { name: /all announcements/i })

    expect(strip.querySelectorAll('button')).toHaveLength(3)
    expect(screen.getByText('Read receipts')).toBeInTheDocument()
  })

  it('sets the status filter when a tile is pressed', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText(PINNED_ROW)

    const strip = screen.getByRole('region', { name: /all announcements/i })
    const draftTile = Array.from(strip.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Draft'),
    )
    expect(draftTile).toBeDefined()

    await user.click(draftTile as HTMLElement)

    await waitFor(() => {
      expect(screen.queryByText(PINNED_ROW)).not.toBeInTheDocument()
    })
    expect(screen.getByText(DRAFT_ROW)).toBeInTheDocument()
  })
})

describe('the states a list surface must handle', () => {
  it('names the live platform state when nothing has been broadcast', async () => {
    /*
     * ⚠️ Not an edge case: the live announcements table holds zero rows, so this
     * is the first thing anyone will see on this screen.
     */
    server.use(
      http.get(`${API_PREFIX}/admin/announcements`, () =>
        Response.json({
          success: true,
          data: [],
          pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
        }),
      ),
    )

    mount()

    expect(
      await screen.findByText(/nothing has been broadcast to the userbase yet/i),
    ).toBeInTheDocument()
  })

  it('distinguishes an out-of-range page from an empty filter', async () => {
    /*
     * `?page=99` answers 200 with the page echoed back and no rows, so neither
     * `total` nor `totalPages` can detect it — only the row count can. Without
     * this branch the screen would tell an operator to clear filters they never
     * set.
     */
    mount('/announcements?page=99')

    expect(await screen.findByText(/there is no page here/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /back to the first page/i }),
    ).toBeInTheDocument()
  })

  it('survives a row that carries nothing but id, title and content', async () => {
    /*
     * ⚠️ No announcement row has ever been observed (O5), so the schema marks
     * everything but those three fields optional. A cell that assumed presence
     * would not render a blank — it would throw and take the queue with it.
     * `contract.test.ts` proves the schema tolerates it; this proves the
     * renderers do.
     */
    server.use(
      http.get(`${API_PREFIX}/admin/announcements`, () =>
        Response.json({
          success: true,
          data: [{ id: 'bare01', title: 'Bare minimum', content: 'Still a record.' }],
          pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
        }),
      ),
    )

    mount()

    expect(await screen.findByText('Bare minimum')).toBeInTheDocument()
    expect(screen.getByText('Not published')).toBeInTheDocument()
  })
})
