import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { server } from '@/mocks/server'
import type { UserIdentity } from '@/types/identity'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { AdjustBalanceAction } from './AdjustBalanceAction'

/**
 * Credit or debit one user's diamonds — W5, moved onto the user record.
 *
 * ⚠️ **This lived on a page of its own until 2026-10-27.** The move is the
 * point: `POST /admin/wallet/adjust` takes an opaque `userId`, and a
 * standalone form had no way to show whose account it was — it had to warn the
 * operator that it could not verify the ID. Here the name is in the dialog's
 * own target line and the balances are on the page behind it, so the warning
 * became unnecessary rather than being dropped.
 */

const USER = {
  id: 'cmv80oug40000b9kzd52qpjds',
  displayName: 'Rakibul Khan',
} as unknown as UserIdentity

/** Every `POST /admin/wallet/adjust` body the action sent. */
let sent: Array<Record<string, unknown>> = []

function renderAction() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TooltipProvider delayDuration={0}>
          <AdjustBalanceAction user={USER} />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>,
  )

  return userEvent.setup()
}

/** Open the form, fill it, and reach the typed confirmation. */
async function review(
  user: ReturnType<typeof userEvent.setup>,
  values: { amount: string; note: string; debit?: boolean },
) {
  await user.click(screen.getByRole('button', { name: /adjust the diamond balance/i }))
  const form = await screen.findByRole('dialog', { name: /adjust diamond balance/i })

  if (values.debit) await user.click(within(form).getByLabelText(/^Debit/))
  await user.type(within(form).getByLabelText(/^Amount/), values.amount)
  await user.type(within(form).getByLabelText(/^Note/), values.note)
  await user.click(within(form).getByRole('button', { name: /review adjustment/i }))

  return form
}

beforeEach(() => {
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })

  sent = []
  server.use(
    http.post('*/admin/wallet/adjust', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ success: true, data: {} })
    }),
  )
})

describe('the account being adjusted is never in doubt', () => {
  it('names the user in the form and in the confirmation', async () => {
    /*
     * ⚠️ The reason this moved off its own page. The standalone version
     * showed a cuid and a warning that it could not look up who that was.
     */
    const user = renderAction()
    await review(user, { amount: '500', note: 'Compensation for a dropped call.' })

    const confirm = await screen.findByRole('dialog', { name: /credit this wallet/i })
    expect(within(confirm).getByText(/Rakibul Khan/)).toBeInTheDocument()
    expect(within(confirm).getByText(/cmv80oug40000b9kzd52qpjds/)).toBeInTheDocument()
  })

  it('sends the id from the record, never a typed one', async () => {
    const user = renderAction()
    await review(user, { amount: '500', note: 'Compensation for a dropped call.' })

    const confirm = await screen.findByRole('dialog', { name: /credit this wallet/i })
    await user.type(within(confirm).getByLabelText(/type/i), '500')
    await user.click(
      within(confirm).getByRole('button', { name: /credit the wallet/i }),
    )

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ userId: 'cmv80oug40000b9kzd52qpjds', amount: 500 })
  })
})

describe('the direction is a named choice, not a minus sign', () => {
  it('sends a NEGATIVE amount for a debit, from a positive input', async () => {
    const user = renderAction()
    await review(user, {
      amount: '500',
      note: 'Reversing a duplicate credit.',
      debit: true,
    })

    const confirm = await screen.findByRole('dialog', { name: /debit this wallet/i })
    await user.type(within(confirm).getByLabelText(/type/i), '-500')
    await user.click(within(confirm).getByRole('button', { name: /debit the wallet/i }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ amount: -500 })
  })

  it('makes the operator retype the signed amount, minus sign included', async () => {
    /*
     * ⚠️ The last point at which a debit can be caught being a credit. The
     * unsigned magnitude must NOT satisfy the confirmation.
     */
    const user = renderAction()
    await review(user, {
      amount: '500',
      note: 'Reversing a duplicate credit.',
      debit: true,
    })

    const confirm = await screen.findByRole('dialog', { name: /debit this wallet/i })
    await user.type(within(confirm).getByLabelText(/type/i), '500')
    await user.click(within(confirm).getByRole('button', { name: /debit the wallet/i }))

    expect(sent).toHaveLength(0)
  })
})

describe('what the form refuses to send', () => {
  it('refuses zero, as the server does', async () => {
    const user = renderAction()
    await review(user, { amount: '0', note: 'A note long enough to pass.' })

    expect(await screen.findByText('Amount must be more than zero')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /credit this wallet/i })).toBeNull()
  })

  it('refuses a fractional amount, because diamonds are whole units', async () => {
    const user = renderAction()
    await review(user, { amount: '2.5', note: 'A note long enough to pass.' })

    expect(await screen.findByText('Diamonds are whole units')).toBeInTheDocument()
  })

  it('asks for more of a note than the server does', async () => {
    /*
     * ⚠️ The server accepts one character. This is the only explanation
     * anyone auditing the ledger will ever see.
     */
    const user = renderAction()
    await review(user, { amount: '100', note: 'fix' })

    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })
})

describe('after it is applied', () => {
  it('warns that this page will not show the result', async () => {
    /*
     * ⚠️ No ledger or balance endpoint exists for the panel (plan.md O4), so
     * the figures behind this dialog will not move. Saying so beats implying
     * a confirmation that never arrives.
     */
    const user = renderAction()
    await user.click(
      screen.getByRole('button', { name: /adjust the diamond balance/i }),
    )

    const form = await screen.findByRole('dialog', { name: /adjust diamond balance/i })
    expect(
      within(form).getByText(/no endpoint for reading balances back/i),
    ).toBeInTheDocument()
  })

  it('keeps the note when the server refuses the adjustment', async () => {
    server.use(
      http.post('*/admin/wallet/adjust', () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'BAD_REQUEST',
              message:
                'Insufficient diamond balance for debit adjustment. Current: 10, debit: 500.',
            },
          },
          { status: 400 },
        ),
      ),
    )

    const user = renderAction()
    await review(user, {
      amount: '500',
      note: 'Reversing a duplicate credit from the 24th.',
      debit: true,
    })

    const confirm = await screen.findByRole('dialog', { name: /debit this wallet/i })
    await user.type(within(confirm).getByLabelText(/type/i), '-500')
    await user.click(within(confirm).getByRole('button', { name: /debit the wallet/i }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /debit this wallet/i })).toBeNull(),
    )
    /* The form is still open and still holds the note. */
    const form = screen.getByRole('dialog', { name: /adjust diamond balance/i })
    expect(within(form).getByLabelText(/^Note/)).toHaveValue(
      'Reversing a duplicate credit from the 24th.',
    )
  })
})
