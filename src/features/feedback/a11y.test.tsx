import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resetMockFeedback } from '@/mocks/handlers/feedback'
import { expectNoA11yViolations } from '@tests/a11y'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { FeedbackDetailPage } from './FeedbackDetailPage'
import { FeedbackListPage } from './FeedbackListPage'

/**
 * Accessibility of the queue and the ticket — phases F1 and F2.
 *
 * Both renderers, because the queue is the first surface in this module and
 * the card layout is where the module's worst content lands: a subject
 * containing `<script>`, a reporter with no display name, and a 420-character
 * unbroken token in the description of a seeded ticket.
 *
 * Colour contrast is excluded here (jsdom has no canvas) and is verified
 * against a real browser in `tests/e2e/contrast.spec.ts`.
 */

function mount(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/feedback', element: <FeedbackListPage /> },
      { path: '/feedback/:id', element: <FeedbackDetailPage /> },
      { path: '/users/:id', element: <div>user account</div> },
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
  resetMockFeedback()
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the queue has no axe violations', () => {
  it.each([1440, 360])('populated, at %ipx', async (width) => {
    setViewport(width)
    const { container } = mount('/feedback')
    await screen.findByText('Audio cuts out during group call')
    await expectNoA11yViolations(container)
  })

  it.each([1440, 360])('empty, at %ipx', async (width) => {
    /*
     * The empty state is a distinct render — heading, description and, past
     * the last page, an action button — and it is the one an operator
     * following a stale link actually lands on.
     */
    setViewport(width)
    const { container } = mount('/feedback?page=99')
    await screen.findByText('There is no page here')
    await expectNoA11yViolations(container)
  })

  it('gives the stats strip an accessible name and pressed state', async () => {
    /*
     * Six buttons of bare numbers would be unusable without them: the count is
     * the visible content, and the status it belongs to is the part a screen
     * reader needs in the same node.
     */
    setViewport(1440)
    mount('/feedback?status=PENDING')

    const strip = await screen.findByRole('region', { name: 'All tickets' })
    expect(strip).toBeInTheDocument()

    const buttons = await screen.findAllByRole('button', { pressed: false })
    expect(buttons.length).toBeGreaterThan(0)
    expect(await screen.findAllByRole('button', { pressed: true })).toHaveLength(1)
  })
})

describe('the ticket has no axe violations', () => {
  it.each([1440, 360])('the hostile ticket at %ipx', async (width) => {
    /*
     * `fb_hostile` is the worst content this module can render: a subject
     * containing `<script>`, a reporter with no display name, a 420-character
     * unbroken token in the description, and three attachments whose rows
     * carry a danger-toned warning instead of a link. If any surface in this
     * module has a contrast or naming problem, it is this one.
     */
    setViewport(width)
    const { container } = mount('/feedback/fb_hostile')
    await screen.findByRole('heading', { level: 1, name: /Payment failed/ })
    await expectNoA11yViolations(container)
  })

  it.each([1440, 360])('the churned ticket at %ipx', async (width) => {
    // Fifteen history rows behind a disclosure — the `aria-expanded` path.
    setViewport(width)
    const { container } = mount('/feedback/fb_churned')
    await screen.findByRole('button', { name: 'Show all 15 changes' })
    await expectNoA11yViolations(container)
  })

  it('gives the ticket page exactly one h1', async () => {
    /*
     * `RecordHeader` carries it, because this page's `PageHeader` renders only
     * breadcrumbs — two h1s, or none, would both be a real heading-order
     * violation rather than a stylistic one.
     */
    setViewport(1440)
    mount('/feedback/fb_pending')
    await screen.findByText('The report')

    expect(await screen.findAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

describe('the triage controls have no axe violations', () => {
  it.each([1440, 360])('the card at %ipx', async (width) => {
    setViewport(width)
    const { container } = mount('/feedback/fb_pending')
    await screen.findByText('Triage')
    await expectNoA11yViolations(container)
  })

  it('names the assignment trigger, whose label is otherwise just an ellipsis', async () => {
    /*
     * "Assign…" reads as nothing out of context, and there are three menu
     * triggers stacked in one card. The accessible name has to say which
     * control this is.
     */
    setViewport(1440)
    mount('/feedback/fb_pending')

    expect(
      await screen.findByRole('button', { name: 'Assign this ticket' }),
    ).toBeInTheDocument()
  })
})

describe('the open dialog and the open combobox', () => {
  /*
   * ⚠️ The two surfaces a closed-page `axe` sweep can never see.
   *
   * Both are portals rendered outside the page container, so they are scanned
   * against `document.body` rather than the render container — scanning the
   * container would pass by finding nothing at all, which is the failure mode
   * this describe block exists to avoid.
   *
   * `region` is disabled for these two, and only these two. Scanning the whole
   * body in a test that mounts one page without `AdminLayout` means no `<main>`
   * landmark exists, so every node is "not contained by a landmark" — an
   * artifact of the harness, not of the product. The landmark structure is the
   * layout's and is covered by `tests/e2e/shell.spec.ts`.
   */
  const BODY_SCAN = { rules: { region: { enabled: false } } }

  it.each([1440, 360])('the status dialog at %ipx', async (width) => {
    setViewport(width)
    mount('/feedback/fb_pending')
    const user = userEvent.setup()

    await screen.findByText('Triage')
    await user.click(screen.getByRole('button', { name: /Move to…/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Reviewing' }))

    await screen.findByRole('dialog')
    await expectNoA11yViolations(document.body, BODY_SCAN)
  })

  it.each([1440, 360])('the assignment combobox at %ipx', async (width) => {
    setViewport(width)
    mount('/feedback/fb_pending')
    const user = userEvent.setup()

    await screen.findByText('Triage')
    await user.click(screen.getByRole('button', { name: 'Assign this ticket' }))

    await screen.findByRole('option', { name: /Sarah Connor/ })
    await expectNoA11yViolations(document.body, BODY_SCAN)
  })
})

describe('keyboard traversal of the triage controls', () => {
  it('reaches all three triggers by Tab alone', async () => {
    /*
     * Three menu triggers stacked in one card. A keyboard operator has to be
     * able to reach each of them without a pointer, and each has to announce
     * which control it is — "Move to…", "Change" and "Assign…" are meaningless
     * in isolation, which is why the third carries an explicit `aria-label`.
     */
    setViewport(1440)
    mount('/feedback/fb_pending')
    const user = userEvent.setup()

    await screen.findByText('Triage')

    const status = screen.getByRole('button', { name: /Move to…/ })
    const priority = screen.getByRole('button', { name: 'Change' })
    const assign = screen.getByRole('button', { name: 'Assign this ticket' })

    status.focus()
    expect(status).toHaveFocus()
    await user.tab()
    expect(priority).toHaveFocus()
    await user.tab()
    expect(assign).toHaveFocus()
  })

  it('opens the status menu from the keyboard and picks an item with Enter', async () => {
    setViewport(1440)
    mount('/feedback/fb_pending')
    const user = userEvent.setup()

    await screen.findByText('Triage')
    screen.getByRole('button', { name: /Move to…/ }).focus()

    await user.keyboard('{Enter}')
    const items = await screen.findAllByRole('menuitem')
    expect(items).toHaveLength(3)

    await user.keyboard('{ArrowDown}{Enter}')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('focus return after a dialog closes', () => {
  it('sends focus back to the control that opened it', async () => {
    /*
     * ⚠️ `ConfirmActionDialog` uses `useReturnFocus` because a state-driven
     * dialog has no Radix trigger to restore to — without it a keyboard user
     * lands at the top of the document having lost the button they were on.
     *
     * This module is the first to open that dialog **from a menu item**, so
     * the "opener" is a menu item that no longer exists by the time the dialog
     * closes. What must happen is that focus lands somewhere useful in the
     * triage card rather than on `document.body`.
     */
    setViewport(1440)
    mount('/feedback/fb_pending')
    const user = userEvent.setup()

    await screen.findByText('Triage')
    await user.click(screen.getByRole('button', { name: /Move to…/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Reviewing' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Cancel/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    /* Focus is restored a frame after the dialog unmounts — see StatusAction. */
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Move to…/ })).toHaveFocus(),
    )
  })
})
