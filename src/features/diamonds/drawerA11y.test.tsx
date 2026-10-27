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

import { TopUpRequestsPage } from './TopUpRequestsPage'

/**
 * Accessibility of the payment drawer and its dialogs — phase W3.
 *
 * ⚠️ Both dialogs are **portals**, so no page-level sweep has ever measured
 * them — the same gap the feedback module's status dialog had.
 */

const BODY_SCAN = { rules: { region: { enabled: false } } }

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/diamonds/top-ups', element: <TopUpRequestsPage /> }],
    { initialEntries: ['/diamonds/top-ups'] },
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
  seedMockWallet()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the payment drawer', () => {
  it('has no violations on the hostile record', async () => {
    const user = userEvent.setup()
    const { container } = mount()

    await user.click(await screen.findByText('No account details'))
    const drawer = await screen.findByRole('dialog')
    await within(drawer).findByRole('heading', { name: 'Payment' })

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('has no violations with the receipt open', async () => {
    const user = userEvent.setup()
    const { container } = mount()

    await user.click(await screen.findByText('Rakibul Khan'))
    const drawer = await screen.findByRole('dialog')
    await user.click(
      await within(drawer).findByRole('button', { name: /view the receipt/i }),
    )

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('has no violations with the approve confirmation open', async () => {
    const user = userEvent.setup()
    const { container } = mount()

    await user.click(await screen.findByText('Rakibul Khan'))
    const drawer = await screen.findByRole('dialog')
    await user.click(await within(drawer).findByRole('button', { name: 'Approve' }))
    await screen.findByRole('dialog', { name: /approve this payment/i })

    await expectNoA11yViolations(container, BODY_SCAN)
  })
})
