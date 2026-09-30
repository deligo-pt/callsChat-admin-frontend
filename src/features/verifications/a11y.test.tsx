import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { resetMockVerifications } from '@/mocks/handlers/verifications'
import { expectNoA11yViolations } from '@tests/a11y'
import { render, screen, setViewport, waitFor } from '@tests/render'

import { VerificationDetailPage } from './VerificationDetailPage'
import { VerificationQueuePage } from './VerificationQueuePage'

/**
 * Accessibility of the verification surfaces — phase V5.
 *
 * Swept against the **least tidy** records available, not a clean one:
 *
 * - the queue at `?status=ALL`, so all five status tones and both target types
 *   are on screen, along with the zero-document warning badge;
 * - the **rejected** identity application, because it is the only record that
 *   renders the §3.6 "no explanation was recorded" warning, a reason code, and
 *   an audit row with a `<details>` disclosure at once;
 * - the **document viewer**, open, which is the one surface in this panel that
 *   renders a stranger's identity document;
 * - the **reject dialog**, open and then in its validation-error state, which is
 *   the richest form in the module — a required select, the applicant-facing
 *   reason, and a separate internal note.
 *
 * A clean fixture would pass without ever rendering the states that are hardest
 * to get right.
 *
 * Colour contrast is excluded here — jsdom has no canvas — and is verified
 * against a real browser in `tests/e2e/contrast.spec.ts`.
 */

const APPROVED_IDENTITY = 'cmulfjl62000201r33hha40xi'
const REJECTED_IDENTITY = 'cmulfjl62000301r33hha40xj'
const PENDING_BUSINESS = 'cmu04s71l003701oi3wvzvbdp'

/**
 * `region` is disabled for the body sweeps, and only those: a test that mounts
 * one page without `AdminLayout` has no `<main>` landmark, so every node reads
 * as "not contained by a landmark". That is an artifact of the harness, and the
 * landmark structure is covered by `tests/e2e/shell.spec.ts`.
 */
const BODY_SCAN = { rules: { region: { enabled: false } } }

function mountQueue(entry = '/verifications') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/verifications', element: <VerificationQueuePage /> }],
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

function mountDetail(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/verifications', element: <div>queue</div> },
      { path: '/verifications/:id', element: <VerificationDetailPage /> },
    ],
    { initialEntries: [`/verifications/${id}`] },
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

beforeEach(() => {
  resetMockVerifications()
  signInMockAdmin('SUPER_ADMIN')
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the queue has no axe violations', () => {
  it.each([1440, 360])('every status and both types at %ipx', async (width) => {
    setViewport(width)
    const { container } = mountQueue('/verifications?status=ALL')

    /* Waits for a ROW, not the heading — static copy paints first. */
    await waitFor(() => {
      expect(screen.getByText('DeliGo')).toBeInTheDocument()
    })

    await expectNoA11yViolations(container)
  })

  it('the narrowed default view, whose notice and chip only exist here', async () => {
    setViewport(1440)
    const { container } = mountQueue()

    await waitFor(() => {
      expect(screen.getByText('DeliGo')).toBeInTheDocument()
    })

    await expectNoA11yViolations(container)
  })

  it('the out-of-range page, which is a different empty state', async () => {
    setViewport(1440)
    const { container } = mountQueue('/verifications?status=ALL&page=99')

    await screen.findByText('There is no page here')

    await expectNoA11yViolations(container)
  })
})

describe('the application has no axe violations', () => {
  it.each([1440, 360])(
    'the rejected identity record, with every warning on screen, at %ipx',
    async (width) => {
      setViewport(width)
      const { container } = mountDetail(REJECTED_IDENTITY)

      await screen.findByText(/No explanation was recorded/)

      await expectNoA11yViolations(container)
    },
  )

  it.each([1440, 360])(
    'a business application with nothing to review at %ipx',
    async (width) => {
      setViewport(width)
      const { container } = mountDetail(PENDING_BUSINESS)

      await screen.findByText(/No documents were submitted/)

      await expectNoA11yViolations(container)
    },
  )
})

describe('the document viewer has no axe violations', () => {
  it.each([1440, 360])('open on a PDF at %ipx', async (width) => {
    /*
     * ⚠️ Swept at `document.body`, because Radix portals the dialog out of the
     * render container — a container-scoped sweep would pass while testing
     * nothing at all.
     */
    setViewport(width)
    mountDetail(APPROVED_IDENTITY)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^View/ }))
    await screen.findByRole('dialog')

    await expectNoA11yViolations(document.body, BODY_SCAN)
  })

  it('open on an image, which uses a different renderer and an alt', async () => {
    setViewport(1440)
    mountDetail(REJECTED_IDENTITY)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^View/ }))
    await screen.findByRole('img')

    await expectNoA11yViolations(document.body, BODY_SCAN)
  })
})

describe('the decision dialogs have no axe violations', () => {
  it.each([1440, 360])(
    'the reject dialog, the richest form here, at %ipx',
    async (width) => {
      setViewport(width)
      mountDetail(PENDING_BUSINESS)
      const user = userEvent.setup()

      await user.click(await screen.findByRole('button', { name: /^Reject/ }))
      await screen.findByRole('dialog')

      await expectNoA11yViolations(document.body, BODY_SCAN)
    },
  )

  it('the reject dialog in its validation-error state', async () => {
    /*
     * Reached by trying to confirm with an empty reason. It flips the textarea's
     * `aria-invalid` and re-points its `aria-describedby` — exactly the wiring
     * axe has something to say about.
     */
    setViewport(1440)
    mountDetail(PENDING_BUSINESS)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^Reject/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(
      await waitFor(() => {
        const confirm = dialog.querySelector('button[aria-describedby]')
        expect(confirm).not.toBeNull()
        return confirm as HTMLElement
      }),
    )
    await screen.findByRole('alert')

    await expectNoA11yViolations(document.body, BODY_SCAN)
  })

  it('the approve dialog, which escalates on a zero-document application', async () => {
    setViewport(1440)
    mountDetail(PENDING_BUSINESS)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^Approve/ }))
    await screen.findByRole('dialog')

    await expectNoA11yViolations(document.body, BODY_SCAN)
  })
})
