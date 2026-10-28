import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { resetMockHosts, seedMockHosts } from '@/mocks/handlers/hosts'
import { expectNoA11yViolations } from '@tests/a11y'
import { render, screen, setViewport, within } from '@tests/render'

import { HostApplicationsPage } from './HostApplicationsPage'
import { HostsPage } from './HostsPage'

/**
 * Accessibility of the host surfaces — phase H6.
 *
 * Swept against the **least tidy** state available, never a clean one: the
 * hostile fixture has no display name, no email, no profile, an unknown niche,
 * a `javascript:` intro URL and a several-thousand-character motivation. A
 * tidy fixture would pass without rendering the states that are hardest to get
 * right.
 *
 * ⚠️ **The empty state is swept too**, because it is the only thing the live
 * service can currently show (plan.md §2.1) — the state most operators will
 * actually meet is the one a happy-path sweep would never visit.
 *
 * Colour contrast is excluded — jsdom has no canvas — and is verified against
 * a real browser in `tests/e2e/contrast.spec.ts` at H7.
 */

/**
 * `region` is disabled for body sweeps, and only those: a test that mounts one
 * page without `AdminLayout` has no `<main>` landmark, so every node reads as
 * "not contained by a landmark". That is an artifact of the harness; landmark
 * structure is covered by `tests/e2e/shell.spec.ts`.
 */
const BODY_SCAN = { rules: { region: { enabled: false } } }

function mount(element: React.ReactElement, path: string, entry = path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path, element },
      { path: '/hosts', element: <div>roster</div> },
    ],
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

beforeEach(() => {
  resetMockHosts()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the applications queue', () => {
  it.each([1440, 360])(
    'has no violations with every fixture on screen at %i',
    async (width) => {
      seedMockHosts()
      setViewport(width)
      const { container } = mount(<HostApplicationsPage />, '/host-applications')
      await screen.findByText('Alice Johnson')

      await expectNoA11yViolations(container, BODY_SCAN)
    },
  )

  it('has no violations in the empty state', async () => {
    const { container } = mount(<HostApplicationsPage />, '/host-applications')
    await screen.findByText('No applications yet')

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('has no violations in the detail drawer, on the hostile record', async () => {
    seedMockHosts()
    const user = userEvent.setup()
    const { container } = mount(<HostApplicationsPage />, '/host-applications')

    await user.click(await screen.findByText('No display name'))
    const drawer = await screen.findByRole('dialog')
    await within(drawer).findByRole('heading', { name: 'Application' })

    await expectNoA11yViolations(container, BODY_SCAN)
  })
})

describe('the roster', () => {
  it.each([1440, 360])('has no violations at %i', async (width) => {
    seedMockHosts()
    setViewport(width)
    const { container } = mount(<HostsPage />, '/hosts', '/hosts')
    await screen.findByText('Alex Rivers')

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('has no violations in the empty state', async () => {
    const { container } = mount(<HostsPage />, '/hosts', '/hosts')
    await screen.findByText('No live hosts yet')

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('has no violations with the suspend dialog open', async () => {
    /*
     * ⚠️ A portal, so no page-level sweep has ever measured it — the same gap
     * the feedback module's status dialog had.
     */
    seedMockHosts()
    const user = userEvent.setup()
    const { container } = mount(<HostsPage />, '/hosts', '/hosts')

    await user.click(
      await screen.findByRole('button', { name: /suspend alex rivers/i }),
    )
    await screen.findByRole('dialog', { name: /suspend this host/i })

    await expectNoA11yViolations(container, BODY_SCAN)
  })
})

describe('the creator earnings group', () => {
  it('has no violations with every figure on screen', async () => {
    /*
     * ⚠️ Three money figures, a percentage and a live badge were added to a
     * row that already carried four columns (phase W6). Density is where
     * contrast and name wiring break, and the 360px case is where the group
     * either wraps or escapes the card.
     */
    seedMockHosts()
    setViewport(360)
    const { container } = mount(<HostsPage />, '/hosts', '/hosts')
    await screen.findByText('Alex Rivers')
    await screen.findAllByText('withdrawable')

    await expectNoA11yViolations(container, BODY_SCAN)
  })
})

describe('names that stand on their own', () => {
  it('names every row control by its host, not by its position', async () => {
    /*
     * ⚠️ A roster of bare "Suspend" and "Ban" buttons is unusable by voice or
     * by a rotor list — and on this screen choosing the wrong row ends the
     * wrong person's broadcast.
     */
    seedMockHosts()
    mount(<HostsPage />, '/hosts', '/hosts')
    await screen.findByText('Alex Rivers')

    expect(
      screen.getByRole('button', { name: 'Suspend Alex Rivers' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ban Alex Rivers' })).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: /^suspend$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^ban$/i })).toBeNull()
  })

  it('names the control for a host who has no display name', async () => {
    /*
     * The fallback chain has to reach the control's accessible name too,
     * otherwise the one row an operator most needs to identify is the one
     * whose button says only "Reactivate".
     */
    seedMockHosts()
    mount(<HostsPage />, '/hosts', '/hosts?status=SUSPENDED')
    await screen.findByText('No display name')

    expect(
      screen.getByRole('button', { name: 'Reactivate usr_100' }),
    ).toBeInTheDocument()
  })
})
