import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { http, HttpResponse } from 'msw'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import {
  mockTopUpRequests,
  resetMockWallet,
  seedMockWallet,
} from '@/mocks/handlers/wallet'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { TopUpRequestsPage } from './TopUpRequestsPage'

/**
 * The payment drawer and its two decisions — phase W3.
 */

function renderScreen({
  entry = '/diamonds/top-ups',
  withToaster = false,
}: { entry?: string; withToaster?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/diamonds/top-ups', element: <TopUpRequestsPage /> }],
    { initialEntries: [entry] },
  )

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TooltipProvider delayDuration={0}>
          <RouterProvider router={router} />
          {withToaster ? <Toaster /> : null}
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>,
  )

  return userEvent.setup()
}

/**
 * Open the drawer on a row.
 *
 * ⚠️ **Wait for the section heading, not just for the dialog.** The row paints
 * before the drawer's content does, and an assertion made at that moment fails
 * on content that is simply not there yet — the mistake that cost a session in
 * the host module, three times.
 */
async function openDrawer(user: ReturnType<typeof userEvent.setup>, rowText: string) {
  await user.click(await screen.findByText(rowText))
  const drawer = await screen.findByRole('dialog')
  await within(drawer).findByRole('heading', { name: 'Payment' })
  return drawer
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

describe('the drawer', () => {
  it('opens on a row and shows the payment', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Rakibul Khan')

    expect(within(drawer).getByText(/(BDT|৳)\s?3,000$/)).toBeInTheDocument()
    expect(within(drawer).getByText('9K38FX92P1')).toBeInTheDocument()
    expect(within(drawer).getByText('Diamond Chest')).toBeInTheDocument()
  })

  it('offers no decisions on a payment already reviewed', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Nabila')

    expect(within(drawer).getByText(/already been reviewed/i)).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('says plainly when a gateway already settled the payment', async () => {
    /*
     * ⚠️ The guide frames this queue as manual mobile-money review. An
     * operator who treats an App Store row the same way goes looking for a
     * bank statement entry that will never exist (plan.md O7).
     */
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Nabila')

    expect(
      within(drawer).getByText(/nothing to reconcile against a bank statement/i),
    ).toBeInTheDocument()
  })

  it('shows the reason a payment was refused', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Imran')

    expect(
      within(drawer).getByText(/not found in the merchant statement/i),
    ).toBeInTheDocument()
  })
})

describe('the receipt is defused before the browser fetches it', () => {
  it('mounts no image until the operator asks', async () => {
    /*
     * ⚠️ Opening a row must not fire a request to a stranger's host from an
     * admin session. Asserting only on the button would pass with a hidden
     * `<img>` behind it, so this asserts on the DOM.
     */
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Rakibul Khan')

    expect(drawer.querySelector('img')).toBeNull()
    expect(
      within(drawer).getByRole('button', { name: /view the receipt/i }),
    ).toBeInTheDocument()
  })

  it('loads the image once View is clicked, with no referrer', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Rakibul Khan')

    await user.click(within(drawer).getByRole('button', { name: /view the receipt/i }))

    const image = drawer.querySelector('img')
    expect(image?.getAttribute('src')).toBe(
      'https://cdn.callschat.com/receipts/proof_1029.jpg',
    )
    /*
     * ⚠️ Without this the request tells whoever hosts the image that an admin
     * at a named deployment opened their receipt, and on which row.
     */
    expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('refuses a javascript: receipt and shows it as inert text', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'No account details')

    expect(
      within(drawer).getByText(/treat the payment as unevidenced/i),
    ).toBeInTheDocument()
    expect(within(drawer).getByText(/^javascript:/)).toBeInTheDocument()

    /* No element in the drawer may carry the scheme. */
    const unsafe = [...drawer.querySelectorAll('[src], [href]')].filter((el) =>
      /^\s*javascript:/i.test(el.getAttribute('src') ?? el.getAttribute('href') ?? ''),
    )
    expect(unsafe).toEqual([])
  })

  it('says so when nothing was attached, rather than showing an empty box', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Imran')
    expect(within(drawer).getByText(/no receipt was attached/i)).toBeInTheDocument()
  })
})

describe('approving', () => {
  it('asks for confirmation rather than acting on the click', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Rakibul Khan')

    await user.click(within(drawer).getByRole('button', { name: 'Approve' }))

    const dialog = await screen.findByRole('dialog', { name: /approve this payment/i })
    expect(within(dialog).getByText(/no way to un-approve/i)).toBeInTheDocument()
    /* Nothing has been written yet. */
    expect(mockTopUpRequests()[0]?.status).toBe('PENDING')
  })

  it('asks for no reason, since the endpoint has nowhere to put one', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Rakibul Khan')
    await user.click(within(drawer).getByRole('button', { name: 'Approve' }))

    const dialog = await screen.findByRole('dialog', { name: /approve this payment/i })
    expect(within(dialog).queryByLabelText(/reason/i)).toBeNull()
  })

  it('credits the payer once confirmed', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Rakibul Khan')
    await user.click(within(drawer).getByRole('button', { name: 'Approve' }))

    const dialog = await screen.findByRole('dialog', { name: /approve this payment/i })
    await user.click(
      within(dialog).getByRole('button', { name: /approve and credit/i }),
    )

    await waitFor(() =>
      expect(
        mockTopUpRequests().find((r) => r.id === 'cmvo2ve4l0003wkihbnpnc5jb')?.status,
      ).toBe('APPROVED'),
    )
    /* ⚠️ Leave nothing open — a leaked dialog pollutes later tests in this file. */
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('a colleague got there first', () => {
  it('surfaces the 409 verbatim instead of "something went wrong"', async () => {
    /*
     * ⚠️ **This is the only concurrency guard the screen has.** There is no
     * `GET /admin/wallet/requests/:id` (it answers `ROUTE_NOT_FOUND`), so the
     * drawer cannot notice a record changing underneath an operator the way
     * the host application drawer does. The `409` on submit is the single
     * point at which two admins reviewing one payment is detected, and the
     * service's own sentence says exactly what happened. Flattening it into a
     * generic failure leaves the second operator believing the backend is
     * broken rather than that a colleague acted.
     *
     * ⚠️ **Mounts a `Toaster`**, which no other component test in this repo
     * does — `App.tsx` owns the only one, so toast copy is normally
     * unobservable and `features/announcements/editor.test.tsx` says as much.
     * It is mounted here because without it this test cannot fail: a mutation
     * replacing the service's message with a generic string passed the whole
     * suite.
     */
    server.use(
      http.patch('*/admin/wallet/requests/:id/approve', () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'CONFLICT',
              message:
                'Request is already in APPROVED status and cannot be re-processed.',
            },
          },
          { status: 409 },
        ),
      ),
    )

    const user = renderScreen({ withToaster: true })
    const drawer = await openDrawer(user, 'Rakibul Khan')
    await user.click(within(drawer).getByRole('button', { name: 'Approve' }))

    const dialog = await screen.findByRole('dialog', { name: /approve this payment/i })
    await user.click(
      within(dialog).getByRole('button', { name: /approve and credit/i }),
    )

    expect(
      await screen.findByText(/already in APPROVED status and cannot be re-processed/i),
    ).toBeInTheDocument()

    /* ⚠️ And the dialog stays open, so nothing the operator typed is lost. */
    expect(
      screen.getByRole('dialog', { name: /approve this payment/i }),
    ).toBeInTheDocument()
  })
})

describe('rejecting', () => {
  it('requires a reason before it will send', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Rakibul Khan')
    await user.click(within(drawer).getByRole('button', { name: 'Reject' }))

    const dialog = await screen.findByRole('dialog', { name: /reject this payment/i })
    await user.click(within(dialog).getByRole('button', { name: /reject and notify/i }))

    /* The dialog refuses on click rather than disabling the button. */
    expect(dialog).toBeInTheDocument()
    expect(mockTopUpRequests()[0]?.status).toBe('PENDING')
  })

  it('says the reason goes to the payer, not to an audit log', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Rakibul Khan')
    await user.click(within(drawer).getByRole('button', { name: 'Reject' }))

    const dialog = await screen.findByRole('dialog', { name: /reject this payment/i })
    expect(
      within(dialog).getByText(/write it for them, not for the log/i),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/audit log with your name/i)).toBeNull()

    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    /*
     * ⚠️ The confirm dialog closes; the **drawer stays open**, and a Sheet is
     * itself `role="dialog"`. Querying for "no dialog" here asserts the
     * operator was thrown out of the record they were reading, which is the
     * opposite of what cancelling should do.
     */
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /reject this payment/i })).toBeNull(),
    )
    /*
     * ⚠️ Named for the payer, not "Top-up request". `SheetContent` carries an
     * `aria-label`, but Radix also sets `aria-labelledby` pointing at
     * `SheetTitle`, and `aria-labelledby` wins — so the drawer's accessible
     * name is whatever the title renders.
     */
    expect(screen.getByRole('dialog', { name: /rakibul khan/i })).toBeInTheDocument()
  })

  it('records the rejection with the text the operator wrote', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Rakibul Khan')
    await user.click(within(drawer).getByRole('button', { name: 'Reject' }))

    const dialog = await screen.findByRole('dialog', { name: /reject this payment/i })
    await user.type(
      within(dialog).getByLabelText(/reason/i),
      'No matching entry in the bKash merchant statement for 25 October.',
    )
    await user.click(within(dialog).getByRole('button', { name: /reject and notify/i }))

    await waitFor(() => {
      const row = mockTopUpRequests().find((r) => r.id === 'cmvo2ve4l0003wkihbnpnc5jb')
      expect(row?.status).toBe('REJECTED')
      expect(row?.rejectionReason).toMatch(/bKash merchant statement/)
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
