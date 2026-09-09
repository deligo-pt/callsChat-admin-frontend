import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resetMockFeedback } from '@/mocks/handlers/feedback'
import { server } from '@/mocks/server'
import { FEEDBACK_PRIORITY_VALUES, FEEDBACK_STATUS_VALUES } from '@/types/feedback'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { FeedbackListPage } from './FeedbackListPage'
import { FEEDBACK_TYPES } from './labels'

/**
 * The feedback queue.
 *
 * The assertions that matter are the ones about **what actually reaches the
 * request**. Three of this endpoint's defects are invisible from a rendered
 * page: an unparseable date returns 200 with the filter dropped (§3.7), an
 * out-of-range page returns 200 with an empty array and `totalPages: 1`
 * (§3.8), and the stats route ignores filters entirely (§5.1). Each of those
 * looks like a working queue unless something asserts on the wire.
 */

/** Every `GET /admin/feedbacks` URL the page issued, newest last. */
let listRequests: URL[] = []

function renderPage(initialEntry = '/feedback') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  function LocationProbe() {
    const location = useLocation()
    return (
      <output data-testid="location">{`${location.pathname}${location.search}`}</output>
    )
  }

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <TooltipProvider delayDuration={0}>
            <Routes>
              <Route
                path="/feedback"
                element={
                  <>
                    {children}
                    <LocationProbe />
                  </>
                }
              />
              {/* Landing here is the assertion that a row navigated. */}
              <Route path="/feedback/:id" element={<div>ticket page</div>} />
            </Routes>
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  render(<FeedbackListPage />, { wrapper: Wrapper })
  return userEvent.setup()
}

/** The query string of the most recent list request. */
function lastListParams(): URLSearchParams {
  const last = listRequests.at(-1)
  if (!last) throw new Error('No list request was made')
  return last.searchParams
}

beforeEach(() => {
  resetMockFeedback()
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })

  listRequests = []
  server.events.removeAllListeners('request:start')
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/admin/feedbacks')) listRequests.push(url)
  })
})

describe('the queue', () => {
  it('lists tickets once loaded', async () => {
    renderPage()

    expect(
      await screen.findByText('Audio cuts out during group call'),
    ).toBeInTheDocument()
    expect(screen.getByText('Profile photo upload fails on 4G')).toBeInTheDocument()
  })

  it('opens on priority descending, most urgent first', async () => {
    renderPage()

    await screen.findByText('Audio cuts out during group call')
    expect(lastListParams().get('sortBy')).toBe('priority')
    expect(lastListParams().get('sortOrder')).toBe('desc')
  })

  it('shows the reporter, and falls back to their email when they have no profile', async () => {
    /*
     * `fb_hostile` has `profile: null` — a real state for anyone who signed up
     * and never set a display name, and disproportionately the people filing
     * bugs about onboarding.
     */
    renderPage()

    expect(await screen.findByText('Jamie Okafor')).toBeInTheDocument()
    /*
     * Masked, per plan.md §3.9 — the raw address never reaches a list of rows
     * that might be screen-shared. `maskEmail` keeps two local characters.
     */
    expect(screen.getByText(/^no•+@example\.com$/)).toBeInTheDocument()
    expect(screen.queryByText('no.profile@example.com')).not.toBeInTheDocument()
  })

  it('marks unassigned tickets without offering a filter for them', async () => {
    /*
     * §3.6: `assignedAdminId=null` is compared as the literal string and
     * matches nothing, so the state is visible but not askable. The page says
     * so rather than leaving an operator hunting for the control.
     */
    renderPage()

    await screen.findByText('Audio cuts out during group call')
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Assignee')).not.toBeInTheDocument()
    expect(screen.getByText(/cannot be filtered for/i)).toBeInTheDocument()
  })

  it('navigates to the ticket when a row is clicked', async () => {
    const user = renderPage()

    await user.click(await screen.findByText('Audio cuts out during group call'))
    expect(await screen.findByText('ticket page')).toBeInTheDocument()
  })
})

describe('filters round-trip through the URL', () => {
  it('restores a status filter from a deep link and sends it', async () => {
    renderPage('/feedback?status=CLOSED')

    expect(
      await screen.findByText('Profile photo upload fails on 4G'),
    ).toBeInTheDocument()
    expect(lastListParams().get('status')).toBe('CLOSED')
    expect(
      screen.queryByText('Audio cuts out during group call'),
    ).not.toBeInTheDocument()
  })

  it('restores a type filter', async () => {
    renderPage('/feedback?type=REPORT')

    expect(
      await screen.findByText('User @spamking is mass-messaging my club'),
    ).toBeInTheDocument()
    expect(lastListParams().get('type')).toBe('REPORT')
  })

  it('restores a priority filter', async () => {
    renderPage('/feedback?priority=CRITICAL')

    await waitFor(() => expect(lastListParams().get('priority')).toBe('CRITICAL'))
  })

  it('restores a search term', async () => {
    renderPage('/feedback?search=audio')

    expect(
      await screen.findByText('Audio cuts out during group call'),
    ).toBeInTheDocument()
    expect(lastListParams().get('search')).toBe('audio')
  })

  it('restores sortBy and sortOrder', async () => {
    renderPage('/feedback?sortBy=createdAt&sortOrder=asc')

    await waitFor(() => {
      expect(lastListParams().get('sortBy')).toBe('createdAt')
      expect(lastListParams().get('sortOrder')).toBe('asc')
    })
  })

  it('restores a date range and sends both ends', async () => {
    renderPage('/feedback?fromDate=2026-09-01&toDate=2026-09-06')

    await waitFor(() => {
      expect(lastListParams().get('fromDate')).toBe('2026-09-01')
      expect(lastListParams().get('toDate')).toBe('2026-09-06')
    })
  })

  it('writes a filter back to the URL when it is changed', async () => {
    /*
     * Driven through the stats strip rather than the filter select: a Radix
     * `Select` cannot be opened under jsdom (`hasPointerCapture` is not
     * implemented), and driving one would test the primitive rather than this
     * page. The selects' contents are asserted from their source constants
     * below, the same split `StaffListPage.test.tsx` makes.
     */
    const user = renderPage()
    const strip = await screen.findByRole('region', { name: 'All tickets' })

    await user.click(within(strip).getByRole('button', { name: /Reopened/ }))

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('status=REOPENED'),
    )
  })

  it('returns to page 1 when a filter changes', async () => {
    // Landing on page 3 of a one-page result is the classic filter bug.
    const user = renderPage('/feedback?page=3')
    const strip = await screen.findByRole('region', { name: 'All tickets' })

    await user.click(within(strip).getByRole('button', { name: /Pending/ }))

    await waitFor(() => expect(lastListParams().get('page')).toBe('1'))
  })

  it('offers every status, type and priority the API accepts', () => {
    /*
     * Asserted from the constants the options are built from. All three enums
     * are validated strictly server-side, so an option this page invented
     * would 400 the whole queue rather than return nothing.
     */
    renderPage()

    expect(FEEDBACK_STATUS_VALUES).toHaveLength(6)
    expect(FEEDBACK_PRIORITY_VALUES).toHaveLength(4)
    expect(FEEDBACK_TYPES.map((entry) => entry.value)).toEqual([
      'BUG',
      'IMPROVEMENT',
      'REPORT',
      'OTHER',
    ])
    expect(screen.getByLabelText('Status')).toBeInTheDocument()
    expect(screen.getByLabelText('Type')).toBeInTheDocument()
    expect(screen.getByLabelText('Priority')).toBeInTheDocument()
  })
})

describe('the two lying query parameters', () => {
  it('never sends a date the API would accept and ignore', async () => {
    /*
     * ⚠️ The §3.7 regression test, at the page level. `?fromDate=yesterday`
     * answers 200 live with the filter silently dropped — so the operator
     * reads a full queue as a filtered one. The value must not reach the
     * request at all.
     */
    renderPage('/feedback?fromDate=yesterday&toDate=notadate')

    await screen.findByText('Audio cuts out during group call')
    expect(lastListParams().has('fromDate')).toBe(false)
    expect(lastListParams().has('toDate')).toBe(false)
  })

  it('keeps the valid half of a half-mistyped range', async () => {
    renderPage('/feedback?fromDate=2026-09-01&toDate=yesterday')

    await waitFor(() => expect(lastListParams().get('fromDate')).toBe('2026-09-01'))
    expect(lastListParams().has('toDate')).toBe(false)
  })

  it('drops an enum value the API would 400 on rather than taking the page down', async () => {
    renderPage('/feedback?status=ARCHIVED')

    // The queue renders, unfiltered, instead of a validation error.
    expect(
      await screen.findByText('Audio cuts out during group call'),
    ).toBeInTheDocument()
    expect(lastListParams().has('status')).toBe(false)
  })

  it('falls back to the default sort for an unsortable field', async () => {
    renderPage('/feedback?sortBy=subject')

    await waitFor(() => expect(lastListParams().get('sortBy')).toBe('priority'))
  })
})

describe('pagination at the edges', () => {
  it('shows the empty state for a page beyond the last one', async () => {
    /*
     * ⚠️ §3.8. `?page=99` answers 200 with `items: []`, `meta.page: 99` and
     * `totalPages: 1` — the request echoed, not clamped. The empty state is
     * therefore chosen from `items.length`, never from `totalPages`.
     */
    renderPage('/feedback?page=99')

    expect(await screen.findByText('There is no page here')).toBeInTheDocument()
    /* And a way out, since the pager itself has nothing to page through. */
    expect(
      screen.getByRole('button', { name: 'Back to the first page' }),
    ).toBeInTheDocument()
  })

  it('renders no pager for a genuinely empty result', async () => {
    server.use(
      http.get('*/admin/feedbacks', () =>
        HttpResponse.json({
          success: true,
          // `totalPages: 1` on zero rows — the live shape, verified.
          data: { items: [], meta: { page: 1, limit: 25, total: 0, totalPages: 1 } },
        }),
      ),
    )
    renderPage()

    expect(await screen.findByText('No feedback yet')).toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: /pagination/i }),
    ).not.toBeInTheDocument()
  })
})

describe('the stats strip', () => {
  it('is labelled "All tickets" and says the count spans every filter', async () => {
    /*
     * ⚠️ §5.1. The stats route takes no query parameters, so these counts are
     * global. The one thing this strip must never do is read as the filtered
     * count of the list below it.
     */
    renderPage('/feedback?status=CLOSED')

    expect(await screen.findByText('All tickets')).toBeInTheDocument()
    expect(await screen.findByText(/across every filter/i)).toBeInTheDocument()
  })

  it('does not refetch when the filters change', async () => {
    let statsCalls = 0
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname.endsWith('/admin/feedbacks/stats'))
        statsCalls += 1
    })

    const user = renderPage()
    const strip = await screen.findByRole('region', { name: 'All tickets' })
    await screen.findByText('Audio cuts out during group call')
    const before = statsCalls

    await user.click(within(strip).getByRole('button', { name: /Resolved/ }))
    await waitFor(() => expect(lastListParams().get('status')).toBe('RESOLVED'))

    // Keyed without the list params: the numbers cannot vary with the filters.
    expect(statsCalls).toBe(before)
  })

  it('applies a status filter when a count is pressed', async () => {
    const user = renderPage()
    const strip = await screen.findByRole('region', { name: 'All tickets' })

    await user.click(within(strip).getByRole('button', { name: /Pending/ }))

    await waitFor(() => expect(lastListParams().get('status')).toBe('PENDING'))
  })

  it('clears the filter when the pressed count is pressed again', async () => {
    const user = renderPage('/feedback?status=PENDING')
    const strip = await screen.findByRole('region', { name: 'All tickets' })

    const pending = within(strip).getByRole('button', { name: /Pending/ })
    expect(pending).toHaveAttribute('aria-pressed', 'true')

    await user.click(pending)
    await waitFor(() => expect(lastListParams().has('status')).toBe(false))
  })
})

describe('remote states', () => {
  it('offers a retry on failure, and no row data leaks into it', async () => {
    server.use(
      http.get('*/admin/feedbacks', () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'Boom' } },
          { status: 500 },
        ),
      ),
    )
    renderPage()

    expect(
      await screen.findByRole('button', { name: /try again/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Audio cuts out during group call'),
    ).not.toBeInTheDocument()
  })

  it('announces the result count to assistive tech', async () => {
    renderPage()

    await screen.findByText('Audio cuts out during group call')
    expect(await screen.findByText(/feedback tickets found/i)).toBeInTheDocument()
  })
})
