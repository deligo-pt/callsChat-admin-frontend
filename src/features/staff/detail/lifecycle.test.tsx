import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resetMockStaff } from '@/mocks/handlers/staff'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { StaffDetailPage } from '../StaffDetailPage'

/**
 * The four mutating actions.
 *
 * Rendered through the whole detail page rather than the card alone, because
 * the assertion §3.7 actually demands — that the session count on screen comes
 * from a **refetch** and not from the mutation's own response — is only
 * meaningful if there is a query behind it to refetch.
 */

const SARAH = 'stf_sarah' // ACTIVE, MODERATOR, 2 live sessions
const PRIYA = 'stf_priya' // SUSPENDED
const DELETED = 'stf_deleted'

function renderPage(id = SARAH) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/staff/:id', element: <StaffDetailPage /> },
      { path: '/staff', element: <div>staff directory</div> },
    ],
    { initialEntries: [`/staff/${id}`] },
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

async function loaded(name = 'Sarah Connor') {
  return screen.findByRole('heading', { name, level: 1 })
}

/** The value under the "Active sessions" label in the identity grid. */
function sessionCount(): string {
  const term = screen.getByText('Active sessions')
  return term.parentElement!.querySelector('dd')!.textContent!.trim()
}

async function fillReason(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText(/Reason/),
    'Leaving the team at the end of the month.',
  )
}

beforeEach(() => {
  resetMockStaff()
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('status changes', () => {
  it('offers only the transitions the current status allows', async () => {
    renderPage()
    await loaded()

    // ACTIVE → suspend or ban. "Reactivate" would be a no-op.
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Ban' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument()
  })

  it('offers reactivation from SUSPENDED', async () => {
    renderPage(PRIYA)
    await loaded('Priya Raman')

    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument()
  })

  it('leads with the consequence, not the label', async () => {
    /*
     * Suspension destroys every session before the dialog closes. An operator
     * who expects a flag rather than a sign-out has to learn that here.
     */
    const user = renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Suspend' }))

    expect(
      await screen.findByText(/signed out on every device immediately/i),
    ).toBeVisible()
  })

  it('refuses to submit without a reason (§3.6)', async () => {
    /*
     * The server accepts `{"status":"BANNED"}` with no reason at all, so this
     * rule is entirely the client's — and its test has to be able to fail.
     */
    let called = false
    server.use(
      http.patch('*/api/v1/admin/staff/:id/status', () => {
        called = true
        return new Response(null, { status: 500 })
      }),
    )

    const user = renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Suspend' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/reason/i)
    expect(called).toBe(false)
  })

  it('does not promise a reason history the panel cannot show', async () => {
    /*
     * The shared dialog's default hint says the reason is "recorded in the
     * audit log". For staff there is no audit endpoint and no `statusReason`
     * on the record (§3.6) — so it is overridden here.
     */
    const user = renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Suspend' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(/cannot show it again afterwards/i),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/recorded in the audit log/i)).toBeNull()
  })

  it('takes the session count from a REFETCH, not the response (§3.7)', async () => {
    /*
     * The single most important assertion in A4. The API's own status response
     * carries the `activeSessionsCount` from *before* the revocation, so a
     * page that seeded its cache from that response would show two live
     * sessions on an account that was just signed out everywhere — precisely
     * the fact the operator opened this page to check.
     */
    const user = renderPage()
    await loaded()
    expect(sessionCount()).toBe('2')

    await user.click(screen.getByRole('button', { name: 'Suspend' }))
    await fillReason(user)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }))

    await waitFor(() => expect(sessionCount()).toBe('0'))
    expect(await screen.findByText('Suspended')).toBeVisible()
  })
})

describe('role changes', () => {
  it('offers the other role, and only the other role', async () => {
    renderPage()
    await loaded()
    // Sarah is a MODERATOR.
    expect(screen.getByRole('button', { name: 'Promote to Admin' })).toBeVisible()
  })

  it('states that permissions do not change, and asks for no reason', async () => {
    /*
     * Verified live: the probe account kept both module keys across a
     * promotion. And `PATCH /:id/role` has no reason field — collecting ten
     * characters the client then discards implies a record never sent.
     */
    const user = renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Promote to Admin' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/module access is unchanged/i)).toBeVisible()
    expect(within(dialog).queryByLabelText(/Reason/)).toBeNull()
  })

  it('applies the change and leaves the permission grid alone', async () => {
    const user = renderPage()
    await loaded()

    await user.click(screen.getByRole('button', { name: 'Promote to Admin' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Promote' }))

    expect(await screen.findByText('Admin')).toBeVisible()
    expect(screen.getByLabelText('User directory')).toBeChecked()
    expect(screen.getByLabelText('User actions')).toBeChecked()
  })
})

describe('reset password (§3.5)', () => {
  it('does not reveal the password before the request succeeds', async () => {
    server.use(
      http.patch(
        '*/api/v1/admin/staff/:id/reset-password',
        () => new Response(null, { status: 500 }),
      ),
    )

    const user = renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Reset password' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Reset password' }))

    /*
     * A revealed password after a failed call is the worst outcome here: the
     * operator confidently hands over a credential that was never set.
     */
    expect(await within(dialog).findByRole('alert')).toBeVisible()
    expect(within(dialog).queryByText(/only time this password is shown/i)).toBeNull()
  })

  it('reveals it once, with the warning, after a 200', async () => {
    const user = renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Reset password' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Reset password' }))

    expect(
      await within(dialog).findByText(/only time this password is shown/i),
    ).toBeVisible()
    expect(within(dialog).getByText(/no reset email/i)).toBeVisible()
  })

  it('cannot be reopened to re-reveal the password', async () => {
    const user = renderPage()
    await loaded()

    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    let dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Reset password' }))
    /*
     * Wait for the REVEAL, not just for a code block: the pre-confirm view
     * shows the candidate password too, so matching the format alone resolves
     * before the request has even been made.
     */
    await within(dialog).findByText(/only time this password is shown/i)
    const password = within(dialog).getByText(
      /^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/,
    ).textContent!

    await user.click(within(dialog).getByRole('button', { name: 'I have saved it' }))

    /* Reopening starts a fresh reset — it does not recover the old value. */
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    dialog = await screen.findByRole('dialog')

    expect(within(dialog).queryByText(password)).toBeNull()
    expect(within(dialog).queryByText(/only time this password is shown/i)).toBeNull()
  })

  it('validates a manually entered password against the panel’s rule', async () => {
    const user = renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Reset password' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Enter my own/i }))
    // Accepted by the server's length-only rule; refused here.
    await user.type(within(dialog).getByLabelText(/New password/), 'password')

    expect(
      within(dialog).getByRole('button', { name: 'Reset password' }),
    ).toBeDisabled()
  })
})

describe('delete', () => {
  it('requires the display name to be typed', async () => {
    const user = renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Delete account' }))

    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Delete account' })

    await user.click(confirm)
    expect(screen.queryByText('staff directory')).not.toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/to confirm/i), 'Sarah Connor')
    await user.click(confirm)

    expect(await screen.findByText('staff directory')).toBeInTheDocument()
  })

  it('says beforehand that the row stays in the directory (§3.4)', async () => {
    /*
     * Discovered afterwards this reads as a delete that failed; said in
     * advance it reads as the audit-trail feature it actually is.
     */
    const user = renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(await screen.findByText(/stays in this list, marked Deleted/i)).toBeVisible()
  })
})

describe('a deleted record', () => {
  it('offers no lifecycle actions at all', async () => {
    /*
     * Absent, not disabled: every one of these routes answers 404 for a
     * deleted id, so a greyed-out button would offer something that cannot
     * happen rather than something the operator lacks permission for.
     */
    renderPage(DELETED)
    await loaded('Probe Temp')

    expect(screen.queryByText('Account actions')).not.toBeInTheDocument()
    for (const name of [
      'Suspend',
      'Ban',
      'Reactivate',
      'Reset password',
      'Delete account',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })
})
