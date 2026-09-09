import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resetMockFeedback } from '@/mocks/handlers/feedback'
import { server } from '@/mocks/server'
import { render, screen, setViewport, within } from '@tests/render'

import { FeedbackDetailPage } from './FeedbackDetailPage'

/**
 * The ticket page — phase F2, read-only.
 *
 * Four of this module's traps land on this one screen, and each of them looks
 * like a working page until something asserts on it:
 *
 * - a `javascript:` attachment (§3.9) — the security finding;
 * - `adminResponse` duplicating the newest reply (§3.3);
 * - fifteen unpaginated history rows (§3.10);
 * - a reporter with `profile: null` (§2.2).
 */

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

beforeEach(() => {
  resetMockFeedback()
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the header', () => {
  it('names the ticket once, as the page heading', async () => {
    renderTicket('fb_pending')

    expect(
      await screen.findByRole('heading', {
        name: 'Audio cuts out during group call',
        level: 1,
      }),
    ).toBeInTheDocument()
  })

  it('links the reporter to their account — the one cross-module link', async () => {
    const user = renderTicket('fb_pending')

    await user.click(await screen.findByRole('link', { name: 'Jamie Okafor' }))
    expect(await screen.findByText('user account')).toBeInTheDocument()
  })

  it('shows status, priority and type, with no tone on the type', async () => {
    /*
     * Scoped to the header, because since F3 the triage card states the same
     * status and priority beside the controls that change them — deliberately,
     * so an operator does not have to open a menu to see where the ticket
     * stands. `getByText` alone would now match twice.
     */
    renderTicket('fb_pending')

    const heading = await screen.findByRole('heading', { level: 1 })
    const header = heading.closest('div.rounded-lg') as HTMLElement

    expect(within(header).getByText('Pending')).toBeInTheDocument()
    expect(within(header).getByText('High')).toBeInTheDocument()
    /* Type lives only here — it is read-only, so triage has no row for it. */
    expect(within(header).getByText('Bug')).toBeInTheDocument()
  })

  it('renders a reporter with no profile as their email, not a crash', async () => {
    /*
     * ⚠️ `fb_hostile` has `profile: null`. Every renderer must tolerate it —
     * a user who never finished profile setup has an email address and
     * nothing else, and those are disproportionately the people filing bugs
     * about onboarding.
     */
    renderTicket('fb_hostile')

    expect(
      await screen.findByRole('heading', { level: 1, name: /Payment failed/ }),
    ).toBeInTheDocument()
    /* Masked, per plan.md §3.9 — the raw address never reaches the DOM. */
    expect(screen.getByText(/^no•+@example\.com$/)).toBeInTheDocument()
    /* No display name, so the link falls back to a label rather than blank. */
    expect(screen.getByRole('link', { name: 'View reporter' })).toBeInTheDocument()
  })
})

describe('the report', () => {
  it('renders the description verbatim', async () => {
    renderTicket('fb_pending')

    expect(
      await screen.findByText(/audio cuts out after about two minutes on Wi-Fi/),
    ).toBeInTheDocument()
  })

  it('splits device info for reading without parsing it into fields', async () => {
    renderTicket('fb_pending')

    expect(await screen.findByText('device: Xiaomi 2201117TG')).toBeInTheDocument()
    expect(screen.getByText('os: Android 13')).toBeInTheDocument()
    expect(screen.getByText('appVersion: 2.3.0')).toBeInTheDocument()
  })

  it('says so when no device details were sent', async () => {
    // `fb_hostile` has `userDeviceInfo: null` — a real state, not a blank.
    renderTicket('fb_hostile')

    expect(await screen.findByText(/did not send device details/i)).toBeInTheDocument()
  })
})

describe('attachments — the security finding (§3.9)', () => {
  it('renders a javascript: attachment as text with no anchor at all', async () => {
    /*
     * ⚠️ THE assertion of this phase. `{"fileUrl":"javascript:alert(
     * document.domain)","fileName":"<img src=x onerror=alert(1)>.png"}` was
     * accepted from an ordinary user account and returned verbatim to this
     * panel, verified live 2026-09-06.
     *
     * The check is not that the anchor is disabled or points somewhere safe —
     * it is that **no anchor exists**, asserted by querying the rendered DOM
     * for `a[href]` and finding none among the attachment rows.
     */
    renderTicket('fb_hostile')

    const rows = await screen.findAllByRole('listitem')
    const hostile = rows.find((row) => row.textContent?.includes('onerror'))
    expect(hostile).toBeDefined()
    expect(hostile?.querySelectorAll('a[href]')).toHaveLength(0)

    /* The file name is on screen as characters — proof nothing was injected. */
    expect(screen.getByText('<img src=x onerror=alert(1)>.png')).toBeInTheDocument()
    /* And the URL itself is never rendered, in any form. */
    expect(screen.queryByText(/javascript:/)).not.toBeInTheDocument()
  })

  it('refuses a data: URL even when the file claims to be a PDF', async () => {
    /*
     * `receipt.pdf` / `application/pdf` pointing at a base64 `data:` document.
     * The icon comes from `fileType`, so this is the case that proves the icon
     * carries no authority — the row's text is what decides.
     */
    renderTicket('fb_hostile')

    const rows = await screen.findAllByRole('listitem')
    const row = rows.find((entry) => entry.textContent?.includes('receipt.pdf'))
    expect(row?.querySelectorAll('a[href]')).toHaveLength(0)
    expect(within(row!).getByText(/Unsafe link — not opened/)).toBeInTheDocument()
  })

  it('refuses a relative URL, which would resolve against the panel itself', async () => {
    // `/admin/settings` — same-origin, and the reason a regex check is not enough.
    renderTicket('fb_hostile')

    const rows = await screen.findAllByRole('listitem')
    const row = rows.find((entry) => entry.textContent?.includes('log.txt'))
    expect(row?.querySelectorAll('a[href]')).toHaveLength(0)
  })

  it('opens an https attachment in a new tab, with the referrer withheld', async () => {
    renderTicket('fb_pending')

    const link = await screen.findByRole('link', { name: /screenshot-1\.png/ })
    expect(link).toHaveAttribute(
      'href',
      'https://media.callschat.com/attachments/screenshot-1.png',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('says a ticket has no files rather than rendering an empty box', async () => {
    renderTicket('fb_in_progress')

    expect(await screen.findByText('No files attached.')).toBeInTheDocument()
  })
})

describe('the conversation', () => {
  it('renders replies oldest first', async () => {
    renderTicket('fb_in_progress')

    const first = await screen.findByText(/this is a reasonable ask/)
    const second = screen.getByText(/Picking this up now/)

    /* A conversation reads downward, unlike the audit log below it. */
    expect(first.compareDocumentPosition(second)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('shows an adminResponse that differs from the newest reply, labelled', async () => {
    /*
     * ⚠️ §3.3. `fb_in_progress` carries an `adminResponse` set out of band.
     * It is the only case where the field says something the stream does not.
     */
    renderTicket('fb_in_progress')

    expect(await screen.findByText('Set outside the reply stream')).toBeInTheDocument()
    expect(screen.getByText(/tracked internally as MOB-412/)).toBeInTheDocument()
    expect(screen.getByText(/Sending a reply will overwrite it/)).toBeInTheDocument()
  })

  it('suppresses an adminResponse that merely duplicates the newest reply', async () => {
    /*
     * ⚠️ The other half of §3.3, and the common case: `POST /:id/reply` copies
     * the reply into `adminResponse` silently, so showing both would put the
     * same sentence on screen twice under a heading implying otherwise.
     */
    renderTicket('fb_closed')

    expect(await screen.findByText(/Fixed in 2\.3\.0/)).toBeInTheDocument()
    expect(screen.queryByText('Set outside the reply stream')).not.toBeInTheDocument()
    /* Exactly once, not twice. */
    expect(screen.getAllByText(/Fixed in 2\.3\.0/)).toHaveLength(1)
  })

  it('states that the reporter has not heard back when there are no replies', async () => {
    renderTicket('fb_pending')

    expect(await screen.findByText(/No replies yet/)).toBeInTheDocument()
    expect(screen.getByText('The reporter has not heard back.')).toBeInTheDocument()
  })

  it('offers the composer inside the same card as the stream', async () => {
    /*
     * ⚠️ This assertion was INVERTED in F4. It previously asserted the absence
     * of a composer, which was correct while F2 was read-only.
     *
     * The composer lives in this card rather than one of its own because it is
     * where the conversation continues — separating an operator's reply from
     * the thing they are replying to would be the odder arrangement.
     */
    renderTicket('fb_pending')

    await screen.findByText(/No replies yet/)
    expect(screen.getByLabelText(/Reply to Jamie Okafor/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeInTheDocument()
  })
})

describe('the status history (§3.10)', () => {
  it('renders five of fifteen rows behind a disclosure', async () => {
    /*
     * ⚠️ The history is unbounded and unpaginated — a churned ticket returns
     * every row inline. Without the cap, one pathological ticket pushes the
     * conversation off the screen.
     */
    const user = renderTicket('fb_churned')

    const card = await screen.findByText('Status history')
    const region = card.closest('div[data-slot="card"]') ?? card.parentElement!
    expect(within(region as HTMLElement).getAllByRole('listitem')).toHaveLength(5)

    await user.click(screen.getByRole('button', { name: 'Show all 15 changes' }))
    expect(within(region as HTMLElement).getAllByRole('listitem')).toHaveLength(15)

    await user.click(screen.getByRole('button', { name: 'Show fewer changes' }))
    expect(within(region as HTMLElement).getAllByRole('listitem')).toHaveLength(5)
  })

  it('offers no disclosure when everything already fits', async () => {
    renderTicket('fb_in_progress')

    await screen.findByText('Status history')
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
  })

  it('renders newest first — the opposite of the reply stream', async () => {
    renderTicket('fb_in_progress')

    const newer = await screen.findByText('Assigned to the mobile team for scoping.')
    const older = screen.getByText('Initial triage.')

    expect(newer.compareDocumentPosition(older)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('shows the note, because unlike the staff module this one is readable', async () => {
    renderTicket('fb_closed')

    expect(
      await screen.findByText('No response from reporter after the fix shipped.'),
    ).toBeInTheDocument()
  })

  it('says when no note was recorded rather than leaving a gap', async () => {
    // `fb_hostile`'s only history row has `note: null`.
    renderTicket('fb_hostile')

    expect(await screen.findByText('No note was recorded.')).toBeInTheDocument()
  })

  it('says a never-triaged ticket has no history at all', async () => {
    renderTicket('fb_pending')

    expect(await screen.findByText(/exactly as it was filed/)).toBeInTheDocument()
  })
})

describe('remote states', () => {
  it('shows not-found for an unknown id, in the panel’s own words', async () => {
    /*
     * The server's message reads "Feedback ticket not found. not found" — a
     * doubled suffix (§8 O12). It is not surfaced.
     */
    renderTicket('fb_does_not_exist')

    expect(await screen.findByText('Ticket not found')).toBeInTheDocument()
    expect(screen.queryByText(/not found\. not found/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to feedback' })).toBeInTheDocument()
  })

  it('offers a retry on a server failure, with no ticket data leaking in', async () => {
    server.use(
      http.get('*/admin/feedbacks/:id', () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'Boom' } },
          { status: 500 },
        ),
      ),
    )
    renderTicket('fb_pending')

    expect(
      await screen.findByRole('button', { name: /try again/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/audio cuts out/i)).not.toBeInTheDocument()
  })
})
