import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resetMockStaff } from '@/mocks/handlers/staff'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor } from '@tests/render'

import { StaffCreatePage } from './StaffCreatePage'

/**
 * Provisioning.
 *
 * A create is the one irreversible action in this module that has no confirm
 * step — there is no un-create, only a soft delete that leaves the row in the
 * directory forever (§3.4). So the assertions are about what the form refuses
 * to send, and about a rejection landing somewhere the operator can act on.
 *
 * A **data router** is required: `useUnsavedChangesGuard` calls `useBlocker`,
 * which throws outside one. `MemoryRouter` is not a data router.
 */

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const router = createMemoryRouter(
    [
      { path: '/staff/new', element: <StaffCreatePage /> },
      /* Landing here is the assertion that a successful create navigated. */
      { path: '/staff/:id', element: <div>staff detail</div> },
      { path: '/staff', element: <div>staff directory</div> },
    ],
    { initialEntries: ['/staff/new'] },
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

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Email address/), 'new.hire@callschat.com')
  await user.type(screen.getByLabelText(/Display name/), 'New Hire')
  await user.type(screen.getByLabelText(/^Password/), 'Str0ngPassword')
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

describe('provisioning form', () => {
  it('opens denied by default — Moderator, and nothing granted', () => {
    renderPage()

    expect(screen.getByLabelText('Moderator')).toBeChecked()
    expect(screen.getByLabelText('Admin')).not.toBeChecked()
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked()
    }
  })

  it('says that nothing is emailed to the new colleague', () => {
    /*
     * §3.5: there is no welcome email and no reset link anywhere in this API,
     * so the operator is the delivery channel. Left unsaid, they would
     * reasonably assume otherwise.
     */
    renderPage()
    expect(screen.getByText(/Nothing is emailed to them/i)).toBeInTheDocument()
  })

  it('states that role does not decide access', () => {
    renderPage()
    expect(screen.getByText(/It does not decide what they can reach/i)).toBeVisible()
  })

  it('creates an account with an empty permission grid', async () => {
    /*
     * Denied by default is a valid outcome, not a validation failure. This is
     * the A2 acceptance criterion that the grid must never become mandatory.
     */
    const user = renderPage()
    await fillRequired(user)

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('staff detail')).toBeInTheDocument()
  })

  it('refuses a password the server would accept', async () => {
    /*
     * `"password"` passes the server's length-only rule (§3.5). The panel's is
     * stricter and it is enforced before the request is made.
     */
    const user = renderPage()
    await user.type(screen.getByLabelText(/Email address/), 'new.hire@callschat.com')
    await user.type(screen.getByLabelText(/Display name/), 'New Hire')
    await user.type(screen.getByLabelText(/^Password/), 'password')

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Include an uppercase letter.')).toBeVisible()
    expect(screen.queryByText('staff detail')).not.toBeInTheDocument()
  })

  it('omits a blank phone from the request body', async () => {
    /*
     * Sending `""` would store an empty string as somebody's phone number —
     * the API validates nothing here (§8 O4), so it would be kept verbatim.
     */
    let body: Record<string, unknown> | null = null
    server.use(
      http.post('*/api/v1/admin/staff', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          { success: false, error: { code: 'CONFLICT', message: 'stop here' } },
          { status: 409 },
        )
      }),
    )

    const user = renderPage()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(body).not.toBeNull())
    expect(body!).not.toHaveProperty('phone')
    // And the empty grid IS sent, explicitly.
    expect(body!['permissions']).toEqual([])
  })
})

describe('the unsaved-changes guard', () => {
  it('asks before abandoning a dirty form', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    const user = renderPage()
    await user.type(screen.getByLabelText(/Display name/), 'Half finished')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(confirm).toHaveBeenCalled()
    // Declined — still on the form, with the typing intact.
    expect(screen.queryByText('staff directory')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Display name/)).toHaveValue('Half finished')

    confirm.mockRestore()
  })

  it('does not ask after a successful create', async () => {
    /*
     * The form is at its dirtiest exactly when the create succeeds. Asking
     * "leave without saving?" at that moment reads as though the account had
     * NOT been created — which is why the guard is disarmed synchronously
     * before the navigation rather than from mutation state.
     */
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const user = renderPage()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('staff detail')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()

    confirm.mockRestore()
  })
})

describe('rejections', () => {
  it('puts a duplicate email on the email field, not in a page alert', async () => {
    const user = renderPage()
    /* `sarah.connor@callschat.com` is already in the seeded roster. */
    await user.type(
      screen.getByLabelText(/Email address/),
      'sarah.connor@callschat.com',
    )
    await user.type(screen.getByLabelText(/Display name/), 'Impostor')
    await user.type(screen.getByLabelText(/^Password/), 'Str0ngPassword')

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    const message = await screen.findByText(/already exists/i)
    expect(message).toBeVisible()
    /*
     * On the email field's own error node — the whole point of the criterion.
     * A page-level alert would leave the operator to work out which of five
     * fields to change.
     */
    expect(message.id).toBe('email-error')
    expect(screen.queryByText('staff detail')).not.toBeInTheDocument()
  })

  it('routes a server field rejection onto its own control', async () => {
    server.use(
      http.post('*/api/v1/admin/staff', () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'FST_ERR_VALIDATION',
              message: 'body/displayName Display name is required',
            },
          },
          { status: 400 },
        ),
      ),
    )

    const user = renderPage()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Display name is required')).toBeVisible()
  })

  it('shows a rejection no field can own at form level', async () => {
    /*
     * Best-effort parsing means some messages map to nothing. They must still
     * appear somewhere, or a failed create looks like nothing happened.
     */
    server.use(
      http.post('*/api/v1/admin/staff', () => new Response(null, { status: 500 })),
    )

    const user = renderPage()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.queryByText('staff detail')).not.toBeInTheDocument()
  })
})
