import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resetMockFeedback } from '@/mocks/handlers/feedback'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { FeedbackDetailPage } from './FeedbackDetailPage'

/**
 * The reply composer — phase F4.
 *
 * This is the only control in the panel that publishes text to a member of the
 * public, immediately, with no edit route and no delete route. The assertions
 * are therefore about the three ways it could betray an operator:
 *
 * - sending something they did not mean to send;
 * - losing something they did mean to send;
 * - silently destroying `adminResponse`, a field on the same screen that they
 *   never knowingly edited (§3.3).
 */

let writes: { path: string; body: unknown }[] = []

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

  writes = []
  server.events.removeAllListeners('request:start')
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'GET') return
    const clone = request.clone()
    writes.push({
      path: new URL(request.url).pathname,
      body: await clone.json().catch(() => null),
    })
  })
})

describe('what it refuses to send', () => {
  it('disables the button until something has been typed', async () => {
    renderTicket('fb_pending')

    const button = await screen.findByRole('button', { name: 'Send reply' })
    expect(button).toBeDisabled()

    await userEvent
      .setup()
      .type(screen.getByLabelText(/Reply to Jamie Okafor/), 'Thanks for the report.')
    expect(button).toBeEnabled()
  })

  it('refuses a whitespace-only message client-side', async () => {
    /*
     * A space is not a reply. The server agrees — it answers
     * `body/message Message is required` for a blank string — but nothing
     * should have to travel to a phone to learn that.
     */
    const user = renderTicket('fb_pending')
    const box = await screen.findByLabelText(/Reply to Jamie Okafor/)

    await user.type(box, '   ')

    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled()
    expect(writes).toHaveLength(0)
  })

  it('maps the server’s own field rejection onto the textarea', async () => {
    /*
     * Belt and braces on the one route that reaches a person: if the client
     * floor is ever bypassed, the server's wording lands on the control the
     * operator can actually fix rather than as an anonymous failure.
     */
    server.use(
      http.post('*/admin/feedbacks/:id/reply', () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'FST_ERR_VALIDATION',
              message: 'body/message Message is required',
            },
          },
          { status: 400 },
        ),
      ),
    )

    const user = renderTicket('fb_pending')
    const box = await screen.findByLabelText(/Reply to Jamie Okafor/)

    await user.type(box, 'A reply the server will refuse.')
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByText('Message is required')).toBeInTheDocument()
    expect(box).toHaveAttribute('aria-invalid', 'true')
  })

  it('renders a failure with no field to own it at form level', async () => {
    // A 403 or a 500 has nothing to attach to a control, and must still show.
    server.use(
      http.post('*/admin/feedbacks/:id/reply', () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access Denied: insufficient rights' },
          },
          { status: 403 },
        ),
      ),
    )

    const user = renderTicket('fb_pending')
    await user.type(
      await screen.findByLabelText(/Reply to Jamie Okafor/),
      'This will be refused.',
    )
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByText(/Access Denied/)).toBeInTheDocument()
  })

  it('keeps the draft when the send fails', async () => {
    /*
     * A failed send that also cleared the box would lose the operator's words
     * for a reason that was never their fault.
     */
    server.use(
      http.post('*/admin/feedbacks/:id/reply', () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'Boom' } },
          { status: 500 },
        ),
      ),
    )

    const user = renderTicket('fb_pending')
    const box = await screen.findByLabelText(/Reply to Jamie Okafor/)

    await user.type(box, 'Words worth keeping.')
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(box).toHaveValue('Words worth keeping.')
  })
})

describe('what it says before sending', () => {
  it('says Send, never Save', () => {
    // `POST /:id/reply` publishes to a phone. "Save" would describe a draft.
    renderTicket('fb_pending')

    return screen.findByRole('button', { name: 'Send reply' }).then((button) => {
      expect(button).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
    })
  })

  it('states the consequence every time, and not as a dismissible banner', async () => {
    /*
     * A dismissible warning is read once and dismissed forever. This is a line
     * of muted text that is present at the moment of the decision, every time.
     */
    renderTicket('fb_pending')

    const hint = await screen.findByText(
      /sent to Jamie Okafor and appears in their app\. It cannot be edited or withdrawn\./,
    )
    expect(hint).toBeInTheDocument()
    /* No way to make it go away. */
    expect(
      within(hint.parentElement!).queryByRole('button', { name: /dismiss|close/i }),
    ).not.toBeInTheDocument()
  })

  it('names the reporter, falling back when they have no profile', async () => {
    renderTicket('fb_hostile')

    expect(await screen.findByLabelText(/Reply to the reporter/)).toBeInTheDocument()
  })
})

describe('sending', () => {
  it('sends the trimmed message and clears the box', async () => {
    const user = renderTicket('fb_pending')
    const box = await screen.findByLabelText(/Reply to Jamie Okafor/)

    await user.type(box, '  We have reproduced this and a fix is on the way.  ')
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      path: '/api/v1/admin/feedbacks/fb_pending/reply',
      body: { message: 'We have reproduced this and a fix is on the way.' },
    })

    await waitFor(() => expect(box).toHaveValue(''))
  })

  it('shows the sent reply in the stream afterwards', async () => {
    const user = renderTicket('fb_pending')

    await user.type(
      await screen.findByLabelText(/Reply to Jamie Okafor/),
      'Fix shipping in 2.3.2.',
    )
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByText('Fix shipping in 2.3.2.')).toBeInTheDocument()
    /* And the "nobody has answered" copy is gone. */
    await waitFor(() =>
      expect(
        screen.queryByText(/The reporter has not heard back/),
      ).not.toBeInTheDocument(),
    )
  })

  it('reflects the adminResponse the reply silently overwrote (§3.3)', async () => {
    /*
     * ⚠️ THE assertion of this phase.
     *
     * `fb_in_progress` carries an `adminResponse` set out of band — "Escalated
     * to the mobile team, tracked internally as MOB-412" — which the stream
     * renders in its own block. Sending a reply **destroys** that value: the
     * route copies the new message over it without saying so.
     *
     * The operator did not knowingly edit that field, so the panel must not
     * keep showing the old value. Because the reply now equals `adminResponse`,
     * the out-of-band block is suppressed entirely — which is the correct
     * outcome and the reason the mutation invalidates rather than appending.
     */
    const user = renderTicket('fb_in_progress')

    expect(await screen.findByText('Set outside the reply stream')).toBeInTheDocument()
    expect(screen.getByText(/tracked internally as MOB-412/)).toBeInTheDocument()

    await user.type(
      screen.getByLabelText(/Reply to Dana Mercer/),
      'Shipping in the next release.',
    )
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    /* The stale note is gone, because the server replaced it. */
    await waitFor(() =>
      expect(
        screen.queryByText(/tracked internally as MOB-412/),
      ).not.toBeInTheDocument(),
    )
    expect(screen.queryByText('Set outside the reply stream')).not.toBeInTheDocument()
    expect(screen.getByText('Shipping in the next release.')).toBeInTheDocument()
  })

  it('does not retry a failed send', async () => {
    /*
     * A retried POST that actually succeeded the first time sends the reporter
     * the same message twice, and this route carries no idempotency key.
     */
    let attempts = 0
    server.use(
      http.post('*/admin/feedbacks/:id/reply', () => {
        attempts += 1
        return HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'Boom' } },
          { status: 500 },
        )
      }),
    )

    const user = renderTicket('fb_pending')
    await user.type(await screen.findByLabelText(/Reply to Jamie Okafor/), 'Once only.')
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    await waitFor(() => expect(attempts).toBe(1))
    /* Give a retry a chance to happen, then confirm none did. */
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(attempts).toBe(1)
  })
})

describe('the unsaved draft guard', () => {
  it('prompts before navigating away with a draft in the box', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    const user = renderTicket('fb_pending')
    await user.type(
      await screen.findByLabelText(/Reply to Jamie Okafor/),
      'Half-written thought',
    )

    await user.click(screen.getByRole('link', { name: 'Feedback' }))

    expect(confirmSpy).toHaveBeenCalledWith(
      'This reply has not been sent. Leave without sending it?',
    )
    /* Declining keeps the operator on the ticket, draft intact. */
    expect(screen.getByLabelText(/Reply to Jamie Okafor/)).toHaveValue(
      'Half-written thought',
    )
    confirmSpy.mockRestore()
  })

  it('does not prompt when the box is empty', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const user = renderTicket('fb_pending')
    await screen.findByLabelText(/Reply to Jamie Okafor/)

    await user.click(screen.getByRole('link', { name: 'Feedback' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(await screen.findByText('the queue')).toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('does not prompt for whitespace alone', async () => {
    // Blocking navigation has a real cost; a stray space is not a draft.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const user = renderTicket('fb_pending')
    await user.type(await screen.findByLabelText(/Reply to Jamie Okafor/), '   ')
    await user.click(screen.getByRole('link', { name: 'Feedback' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
