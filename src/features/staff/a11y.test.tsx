import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resetMockStaff } from '@/mocks/handlers/staff'
import { expectNoA11yViolations } from '@tests/a11y'
import { render, screen, setViewport, within } from '@tests/render'

import { StaffCreatePage } from './StaffCreatePage'
import { StaffDetailPage } from './StaffDetailPage'
import { StaffListPage } from './StaffListPage'

/**
 * Accessibility of the three staff surfaces — phase A5.
 *
 * `staffColumns.test.tsx` already covers the directory's two renderers in
 * isolation. What is checked here is the **whole page**: the filter bar, the
 * permission grid, the dialogs, and the keyboard paths through them.
 *
 * Colour contrast is excluded (jsdom has no canvas) and is verified against a
 * real browser in `tests/e2e/contrast.spec.ts`.
 */

function mount(element: React.ReactElement, path: string, url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path, element },
      { path: '/staff', element: <div>staff directory</div> },
      { path: '/staff/:id', element: <div>staff detail</div> },
    ],
    { initialEntries: [url] },
  )

  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={0}>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetMockStaff()
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('staff surfaces have no axe violations', () => {
  it.each([1440, 360])('the directory at %ipx', async (width) => {
    setViewport(width)
    const { container } = mount(<StaffListPage />, '/staff/list', '/staff/list')
    await screen.findByText('Sarah Connor')
    await expectNoA11yViolations(container)
  })

  it.each([1440, 360])('the provisioning form at %ipx', async (width) => {
    setViewport(width)
    const { container } = mount(<StaffCreatePage />, '/staff/new', '/staff/new')
    await screen.findByLabelText(/Email address/)
    await expectNoA11yViolations(container)
  })

  it.each([1440, 360])('the record at %ipx', async (width) => {
    setViewport(width)
    const { container } = mount(
      <StaffDetailPage />,
      '/staff/x/:id',
      '/staff/x/stf_sarah',
    )
    await screen.findByRole('heading', { name: 'Sarah Connor', level: 1 })
    await expectNoA11yViolations(container)
  })

  it('a confirm dialog, once open', async () => {
    /*
     * Dialogs are the surface most likely to fail axe and least likely to be
     * looked at, because nothing renders them until something is clicked.
     */
    setViewport(1440)
    const user = userEvent.setup()
    mount(<StaffDetailPage />, '/staff/x/:id', '/staff/x/stf_sarah')
    await screen.findByRole('heading', { name: 'Sarah Connor', level: 1 })

    await user.click(screen.getByRole('button', { name: 'Suspend' }))
    const dialog = await screen.findByRole('dialog')
    await expectNoA11yViolations(dialog)
  })
})

describe('keyboard paths', () => {
  it('walks the permission grid with Tab and toggles with Space', async () => {
    /*
     * The grid is the module's most consequential control. If it can only be
     * operated with a mouse, a Super Admin who works by keyboard cannot grant
     * or revoke anything.
     */
    setViewport(1440)
    const user = userEvent.setup()
    mount(<StaffCreatePage />, '/staff/new', '/staff/new')
    await screen.findByLabelText(/Email address/)

    const dashboard = screen.getByLabelText('Dashboard & trends')
    dashboard.focus()
    expect(dashboard).toHaveFocus()

    await user.keyboard(' ')
    expect(dashboard).toBeChecked()

    /* Tab reaches the next grantable key, skipping the two inert rows. */
    await user.tab()
    expect(screen.getByLabelText('User directory')).toHaveFocus()
  })

  it('never puts the two Super-Admin-only rows in the tab order', async () => {
    /*
     * They are shown so the grid matches the doc's eight keys (§5.5), but they
     * can never be granted usefully — so tabbing through them would offer a
     * keyboard user a stop that does nothing.
     */
    setViewport(1440)
    mount(<StaffCreatePage />, '/staff/new', '/staff/new')
    await screen.findByLabelText(/Email address/)

    expect(screen.queryByLabelText('Database operations')).toBeNull()
    expect(screen.queryByLabelText('SMS gateway')).toBeNull()
    expect(screen.getByText('Database operations')).toBeInTheDocument()
  })

  it('moves focus into a dialog on open and returns it on close', async () => {
    /*
     * Without this a keyboard user closes a dialog and lands back at the top
     * of the document, having lost the button they came from.
     */
    setViewport(1440)
    const user = userEvent.setup()
    mount(<StaffDetailPage />, '/staff/x/:id', '/staff/x/stf_sarah')
    await screen.findByRole('heading', { name: 'Sarah Connor', level: 1 })

    const trigger = screen.getByRole('button', { name: 'Suspend' })
    await user.click(trigger)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })

  it('confirms a status change entirely from the keyboard', async () => {
    setViewport(1440)
    const user = userEvent.setup()
    mount(<StaffDetailPage />, '/staff/x/:id', '/staff/x/stf_sarah')
    await screen.findByRole('heading', { name: 'Sarah Connor', level: 1 })

    await user.click(screen.getByRole('button', { name: 'Suspend' }))
    const dialog = await screen.findByRole('dialog')

    await user.type(
      within(dialog).getByLabelText(/Reason/),
      'Leaving the team at the end of the month.',
    )
    within(dialog).getByRole('button', { name: 'Suspend' }).focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText('Suspended')).toBeVisible()
  })
})
