import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { resetMockWallet, seedMockWallet } from '@/mocks/handlers/wallet'
import { expectNoA11yViolations } from '@tests/a11y'
import { render, screen, setViewport, within } from '@tests/render'

import { PackagesPage } from './PackagesPage'
import { TopUpRequestsPage } from './TopUpRequestsPage'

/**
 * Accessibility of the top-up queue — phase W2.
 *
 * Swept against the **least tidy** state available: the hostile fixture has no
 * profile, no email, a 420-character transaction id and a `javascript:`
 * receipt. A tidy fixture would pass without rendering the states that are
 * hardest to get right.
 *
 * ⚠️ **The empty state is swept too**, because it is the only thing the live
 * service can currently show — the state most operators will actually meet is
 * the one a happy-path sweep would never visit.
 *
 * Colour contrast is excluded (jsdom has no canvas) and is verified in a real
 * browser at W8.
 */

/** See `features/hosts/a11y.test.tsx` for why `region` is off for body sweeps. */
const BODY_SCAN = { rules: { region: { enabled: false } } }

function mount(entry = '/diamonds/top-ups') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/diamonds/top-ups', element: <TopUpRequestsPage /> }],
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
  resetMockWallet()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the top-up queue', () => {
  it.each([1440, 360])(
    'has no violations with every fixture on screen at %i',
    async (width) => {
      seedMockWallet()
      setViewport(width)
      const { container } = mount()
      await screen.findByText('Rakibul Khan')

      await expectNoA11yViolations(container, BODY_SCAN)
    },
  )

  it('has no violations in the empty state', async () => {
    const { container } = mount()
    await screen.findByText('No top-up requests yet')

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('has no violations when filters are narrowing an empty result', async () => {
    seedMockWallet()
    const { container } = mount('/diamonds/top-ups?status=CANCELLED')
    await screen.findByText('No payments match this view')

    await expectNoA11yViolations(container, BODY_SCAN)
  })
})

describe('the diamond price list', () => {
  function mountPackages() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter(
      [{ path: '/diamonds/packages', element: <PackagesPage /> }],
      { initialEntries: ['/diamonds/packages'] },
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

  it.each([1440, 360])('has no violations at %i', async (width) => {
    seedMockWallet()
    setViewport(width)
    const { container } = mountPackages()
    await screen.findByText('Starter Pack')

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('has no violations in the editor, which is a portal no page sweep reaches', async () => {
    seedMockWallet()
    const user = userEvent.setup()
    const { container } = mountPackages()

    await screen.findByText('Starter Pack')
    await user.click(await screen.findByRole('button', { name: 'Edit Starter Pack' }))
    const dialog = await screen.findByRole('dialog', { name: /edit package/i })
    await within(dialog).findByLabelText(/Sort order/)

    await expectNoA11yViolations(container, BODY_SCAN)
  })
})
