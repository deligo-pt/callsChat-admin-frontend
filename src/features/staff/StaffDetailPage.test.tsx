import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resetMockStaff } from '@/mocks/handlers/staff'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor } from '@tests/render'

import { StaffDetailPage } from './StaffDetailPage'

/**
 * The staff record, and the one control on it.
 *
 * The assertion that matters most is that a save posts the **complete** set.
 * `PATCH /:id/permissions` replaces rather than merges (§3.3), so a delta
 * silently revokes every key the operator did not re-tick — a failure with no
 * error, no warning, and no way to notice until somebody is locked out.
 */

/* Seed ids from `mocks/handlers/staff.ts`. */
const SARAH = 'stf_sarah'
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

beforeEach(() => {
  resetMockStaff()
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('staff detail', () => {
  it('shows the record with its status and role', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Sarah Connor', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Moderator')).toBeInTheDocument()
  })

  it('states that identity fields cannot be edited, without disabled inputs', async () => {
    /*
     * There is no `PATCH /admin/staff/:id` — the four write routes cover
     * permissions, status, role and password and nothing else. A disabled
     * input would imply a missing permission; a plain value implies a fact.
     */
    renderPage()
    await screen.findByRole('heading', { name: 'Sarah Connor', level: 1 })

    expect(screen.getByText(/Fixed at creation/i)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('renders the granted keys as ticked', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Sarah Connor', level: 1 })

    // The seed grants Sarah DASHBOARD_VIEW, USER_VIEW and USER_MODERATE.
    expect(screen.getByLabelText('User directory')).toBeChecked()
    expect(screen.getByLabelText('Dashboard & trends')).toBeChecked()
    expect(screen.getByLabelText('User actions')).toBeChecked()
    expect(screen.getByLabelText('App releases')).not.toBeChecked()
  })

  it('renders an ErrorState rather than crashing on an unknown id', async () => {
    renderPage('stf_nope')

    expect(await screen.findByText(/Staff member not found/i)).toBeVisible()
  })

  it('reports a server failure with a retry', async () => {
    server.use(
      http.get('*/api/v1/admin/staff/:id', () => new Response(null, { status: 500 })),
    )
    renderPage()

    expect(
      await screen.findByRole('button', { name: /try again|retry/i }),
    ).toBeVisible()
  })
})

describe('saving permissions (§3.3)', () => {
  it('posts the COMPLETE set, not a delta', async () => {
    /*
     * The explicit regression test for replace-not-merge. Sarah holds
     * DASHBOARD_VIEW + USER_VIEW + USER_MODERATE; adding a fourth must send
     * all four, or the three she already had are revoked by omission.
     */
    let body: { permissions?: string[] } | null = null
    server.use(
      http.patch('*/api/v1/admin/staff/:id/permissions', async ({ request }) => {
        body = (await request.json()) as { permissions: string[] }
        return HttpResponse.json(
          { success: false, error: { code: 'CONFLICT', message: 'stop' } },
          { status: 409 },
        )
      }),
    )

    const user = renderPage()
    await screen.findByRole('heading', { name: 'Sarah Connor', level: 1 })

    await user.click(screen.getByLabelText('App releases'))
    await user.click(screen.getByRole('button', { name: 'Save permissions' }))

    await waitFor(() => expect(body).not.toBeNull())
    expect(body!.permissions).toEqual([
      'DASHBOARD_VIEW',
      'USER_VIEW',
      'USER_MODERATE',
      'DEPLOYMENT_EDIT',
    ])
  })

  it('sends an empty array when every key is cleared', async () => {
    // Revoking everything is a real intention, not an unsaved form.
    let body: { permissions?: string[] } | null = null
    server.use(
      http.patch('*/api/v1/admin/staff/:id/permissions', async ({ request }) => {
        body = (await request.json()) as { permissions: string[] }
        return HttpResponse.json(
          { success: false, error: { code: 'CONFLICT', message: 'stop' } },
          { status: 409 },
        )
      }),
    )

    const user = renderPage()
    await screen.findByRole('heading', { name: 'Sarah Connor', level: 1 })

    await user.click(screen.getByLabelText('User directory'))
    await user.click(screen.getByLabelText('Dashboard & trends'))
    await user.click(screen.getByLabelText('User actions'))
    await user.click(screen.getByRole('button', { name: 'Save permissions' }))

    await waitFor(() => expect(body).not.toBeNull())
    expect(body!.permissions).toEqual([])
  })

  it('keeps Save inert until something changes, and again after saving', async () => {
    const user = renderPage()
    await screen.findByRole('heading', { name: 'Sarah Connor', level: 1 })

    const save = screen.getByRole('button', { name: 'Save permissions' })
    expect(save).toBeDisabled()

    await user.click(screen.getByLabelText('App releases'))
    expect(save).toBeEnabled()

    await user.click(save)
    expect(await screen.findByText(/Saved\./)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save permissions' })).toBeDisabled()
  })

  it('confirms in the card, never as a toast', async () => {
    /*
     * A bottom-right toast covers this footer's own Save button at 1024px and
     * blocks the next click — the S1 defect, not repeated.
     */
    const user = renderPage()
    await screen.findByRole('heading', { name: 'Sarah Connor', level: 1 })

    await user.click(screen.getByLabelText('App releases'))
    await user.click(screen.getByRole('button', { name: 'Save permissions' }))

    const confirmation = await screen.findByText(/Saved\./)
    expect(confirmation.closest('[data-slot="card"]')).not.toBeNull()
  })

  it('restores the server set when Discard is pressed', async () => {
    const user = renderPage()
    await screen.findByRole('heading', { name: 'Sarah Connor', level: 1 })

    await user.click(screen.getByLabelText('App releases'))
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(screen.getByLabelText('App releases')).not.toBeChecked()
    expect(screen.getByLabelText('User directory')).toBeChecked()
  })

  it('reports a rejected save without losing the operator’s edits', async () => {
    server.use(
      http.patch(
        '*/api/v1/admin/staff/:id/permissions',
        () => new Response(null, { status: 500 }),
      ),
    )

    const user = renderPage()
    await screen.findByRole('heading', { name: 'Sarah Connor', level: 1 })

    await user.click(screen.getByLabelText('App releases'))
    await user.click(screen.getByRole('button', { name: 'Save permissions' }))

    expect(await screen.findByRole('alert')).toBeVisible()
    // The tick survives, so retrying does not mean re-ticking.
    expect(screen.getByLabelText('App releases')).toBeChecked()
  })
})

describe('a deleted record (§3.4)', () => {
  it('says so, and offers no way to change anything', async () => {
    /*
     * `GET /:id` answers 200 for a soft-deleted account while every mutation
     * against it answers 404. A page that looked editable would fail on its
     * first click with a "not found" the operator cannot act on.
     */
    renderPage(DELETED)

    expect(await screen.findByText(/This account is deleted/i)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Save permissions' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument()

    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeDisabled()
    }
  })

  it('still shows the record, because attribution is the reason it is kept', async () => {
    renderPage(DELETED)

    expect(
      await screen.findByRole('heading', { name: 'Probe Temp', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByText('Deleted')).toBeInTheDocument()
  })
})
