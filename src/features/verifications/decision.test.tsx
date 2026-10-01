import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { resetMockVerifications } from '@/mocks/handlers/verifications'
import { server } from '@/mocks/server'
import { render, screen, waitFor, within } from '@tests/render'

import { VerificationDetailPage } from './VerificationDetailPage'

/**
 * The decision (plan.md §7, phase V4).
 *
 * ⚠️ **The write this file guards grants or withdraws a real person's verified
 * status, and the server will let the panel do it badly.** Three of the four
 * §3 traps are enforced only on the client:
 *
 * - `REJECT` with no `rejectionCode` returns **200** (§3.6);
 * - `REJECT` with no `rejectionReason` returns **200** (§3.6);
 * - `REJECT` against an `APPROVED` record returns **200** and rejects it, though
 *   the doc calls that state immutable (§3.1).
 *
 * So the assertions below are not about markup. They are about what leaves the
 * browser, and about whether the operator was told what they were overwriting.
 */

const APPROVED_IDENTITY = 'cmulfjl62000201r33hha40xi'
const PENDING_BUSINESS = 'cmu04s71l003701oi3wvzvbdp'
const DECISION_ROUTE = '*/api/v1/admin/verifications/:id/decision'
const REASON = 'The document is unreadable at the corners.'

function mount(id: string) {
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

/** Captures the decision payload instead of applying it. */
function captureDecision() {
  const sent: Record<string, unknown>[] = []

  server.use(
    http.patch(DECISION_ROUTE, async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({
        success: true,
        data: {
          id: 'cmulfjl62000201r33hha40xi',
          status: 'REJECTED',
          reviewedAt: new Date().toISOString(),
        },
      })
    }),
  )

  return sent
}

/** Opens a decision dialog and returns it. */
async function openDialog(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole('button', { name }))
  return screen.findByRole('dialog')
}

/**
 * The mandatory-reason textarea.
 *
 * ⚠️ Matched by role, because `getByLabelText(/^Reason/)` also matches the
 * "Reason code" select — and those two fields are the ones this module must never
 * confuse: one is read by the applicant and the other drives their app.
 */
function reasonBox(dialog: HTMLElement): HTMLElement {
  return within(dialog).getByRole('textbox', { name: /^Reason/ })
}

async function chooseCode(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
): Promise<void> {
  await user.click(screen.getByLabelText(/Reason code/))
  await user.click(await screen.findByRole('option', { name: label }))
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

describe('a rejection cannot be sent without both halves (§3.6)', () => {
  it('will not send one with a sentence but no code', async () => {
    /*
     * ⚠️ The live service answers 200 to this and tells the applicant they were
     * refused for no stated reason their app can display. `confirmDisabled` is
     * the only thing stopping it, since the operator has done everything the
     * dialog visibly asks for.
     */
    const sent = captureDecision()
    const user = userEvent.setup()
    mount(PENDING_BUSINESS)

    const dialog = await openDialog(user, /^Reject/)
    await user.type(reasonBox(dialog), REASON)
    await user.click(within(dialog).getByRole('button', { name: /^Reject/ }))

    expect(sent).toEqual([])
    /* Still open, so the operator can see what is missing. */
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('will not send one with a code but no sentence', async () => {
    const sent = captureDecision()
    const user = userEvent.setup()
    mount(PENDING_BUSINESS)

    const dialog = await openDialog(user, /^Reject/)
    await chooseCode(user, 'Blurry or unreadable')
    await user.click(within(dialog).getByRole('button', { name: /^Reject/ }))

    expect(sent).toEqual([])
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('sends both, with the internal note as its own separate field', async () => {
    const sent = captureDecision()
    const user = userEvent.setup()
    mount(PENDING_BUSINESS)

    const dialog = await openDialog(user, /^Reject/)
    await chooseCode(user, 'Blurry or unreadable')
    await user.type(reasonBox(dialog), REASON)
    await user.type(
      within(dialog).getByLabelText(/Internal note/),
      'Third attempt from this account.',
    )
    await user.click(within(dialog).getByRole('button', { name: /^Reject/ }))

    await waitFor(() => {
      expect(sent).toHaveLength(1)
    })
    /*
     * ⚠️ Asserted key by key. `rejectionReason` is read by the applicant and
     * `adminNotes` is not, so a payload that merged them — or swapped them —
     * would tell a stranger something written about them internally.
     */
    expect(sent[0]).toEqual({
      action: 'REJECT',
      rejectionCode: 'BLURRY_DOCUMENT',
      rejectionReason: REASON,
      adminNotes: 'Third attempt from this account.',
    })
  })

  it('tells the operator the applicant will read the reason', async () => {
    const user = userEvent.setup()
    mount(PENDING_BUSINESS)

    const dialog = await openDialog(user, /^Reject/)

    expect(dialog).toHaveTextContent(/The applicant reads this/)
    expect(dialog).toHaveTextContent(/the applicant never sees this/i)
  })
})

describe('an approval collects nothing and sends nothing but the action', () => {
  /*
   * ⚠️ REVISED 2026-10-01, and this is a deliberate loosening. V4 routed the
   * dialog's mandatory reason into `adminNotes`, so every approval carried a
   * typed justification. The reason field was removed on request: approving is
   * now two clicks and records no stated reason.
   *
   * These tests pin what that means on the wire, because the risk is silent —
   * the dialog still looks careful, and nothing on screen says the panel stopped
   * asking why.
   */
  it('sends only the action, with no notes and nothing applicant-facing', async () => {
    const sent = captureDecision()
    const user = userEvent.setup()
    mount(PENDING_BUSINESS)

    const dialog = await openDialog(user, /^Approve/)
    await user.click(within(dialog).getByRole('button', { name: /^Approve/ }))

    await waitFor(() => {
      expect(sent).toHaveLength(1)
    })
    expect(sent[0]).toEqual({ action: 'APPROVE' })
  })

  it('omits adminNotes rather than sending an empty string', async () => {
    /*
     * ⚠️ The distinction that matters. `adminNotes: ""` would blank whatever note
     * is already on the record — the approve payload's only text field, wiped by
     * an action that no longer collects text. Omitting the key leaves it alone.
     */
    const sent = captureDecision()
    const user = userEvent.setup()
    mount(PENDING_BUSINESS)

    const dialog = await openDialog(user, /^Approve/)
    await user.click(within(dialog).getByRole('button', { name: /^Approve/ }))

    await waitFor(() => {
      expect(sent).toHaveLength(1)
    })
    expect(sent[0]).not.toHaveProperty('adminNotes')
    expect(sent[0]).not.toHaveProperty('rejectionReason')
    expect(sent[0]).not.toHaveProperty('rejectionCode')
  })

  it('offers no reason field at all, so nothing blocks the confirm', async () => {
    const user = userEvent.setup()
    mount(PENDING_BUSINESS)

    const dialog = await openDialog(user, /^Approve/)

    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
    expect(dialog).not.toHaveTextContent(/at least 10 characters/)
  })

  it('still states what approving does, which is now the only safeguard left', async () => {
    /*
     * With no typed justification, the copy is all that stands between an
     * operator and an evidence-free approval. If this goes quiet, nothing warns.
     */
    const user = userEvent.setup()
    mount(PENDING_BUSINESS)

    const dialog = await openDialog(user, /^Approve/)

    expect(dialog).toHaveTextContent(/no evidence at all/)
    expect(dialog).toHaveTextContent(/will be marked verified/)
  })
})

describe('approving with nothing to review is escalated (§3.5, R6)', () => {
  it('warns on the card before the dialog is even opened', async () => {
    mount(PENDING_BUSINESS)

    expect(
      await screen.findByText(/grants verification on no evidence/),
    ).toBeInTheDocument()
    /*
     * The decision card's own wording, which deliberately does not repeat the
     * documents card's "no documents were submitted / nothing to review" — one
     * fact, stated once, in the place that can act on it.
     */
    expect(screen.getByText(/no evidence to weigh/)).toBeInTheDocument()
  })

  it('states the absence of evidence inside the confirmation', async () => {
    /*
     * Every pending business application on the live service is in this state
     * (§3.5), so this is the ordinary path rather than an edge case.
     */
    const user = userEvent.setup()
    mount(PENDING_BUSINESS)

    const dialog = await openDialog(user, /^Approve/)

    expect(dialog).toHaveTextContent(/no evidence at all/)
  })
})

describe('a decision is reversible, and the panel says so (§3.1, R1)', () => {
  it('still offers the controls on an already-approved application', async () => {
    /*
     * ⚠️ `verification_doc.md` calls `APPROVED` a terminal, immutable state. It
     * is not. Hiding the controls would match the documentation and mislead the
     * operator about what anyone holding this permission can do.
     */
    mount(APPROVED_IDENTITY)

    expect(await screen.findByText('Change this decision')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reject/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Approve again/ })).toBeEnabled()
  })

  it('names the decision it is about to overwrite, with its date', async () => {
    const user = userEvent.setup()
    mount(APPROVED_IDENTITY)

    const dialog = await openDialog(user, /^Reject/)

    /* The §3.1 mitigation, verbatim in spirit: state, date, consequence. */
    expect(dialog).toHaveTextContent(/This application was approved on/)
    expect(dialog).toHaveTextContent(/overwrites that decision/)
  })

  it('warns on the card that deciding again withdraws a granted verification', async () => {
    mount(APPROVED_IDENTITY)

    expect(
      await screen.findByText(/withdrawing a verification that was granted/),
    ).toBeInTheDocument()
  })
})

describe('the screen is drawn from a refetch, never from the write', () => {
  it('shows the new status by re-reading the application', async () => {
    /*
     * ⚠️ The decision response carries three keys and describes none of what
     * changed — the applicant's account, the audit trail and the record all move
     * together. So the mutation invalidates and `GET /:id` draws the result.
     * A new audit row appearing is the proof it re-read rather than patched.
     */
    const user = userEvent.setup()
    mount(PENDING_BUSINESS)

    const dialog = await openDialog(user, /^Approve/)
    await user.click(within(dialog).getByRole('button', { name: /^Approve/ }))

    /* The decision card flips to its already-decided copy. */
    expect(await screen.findByText('Change this decision')).toBeInTheDocument()
    /*
     * ⚠️ Proof of a refetch, now that there is no typed note to look for: the
     * audit trail gains an `Approved` row, and the write's three-key response
     * never carried audit data. `getAllByText` because `Approved` is also the
     * status badge — the point is that it now appears MORE than once.
     */
    await waitFor(() => {
      expect(screen.getAllByText('Approved').length).toBeGreaterThan(1)
    })
  })

  it('keeps the dialog and the typed reason when the write fails', async () => {
    /*
     * ⚠️ A rejection sentence written for a real person is not something to
     * discard because a request timed out. The dialog stays open with the text
     * in it.
     */
    server.use(
      http.patch(DECISION_ROUTE, () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Decision could not be saved' } },
          { status: 500 },
        ),
      ),
    )

    const user = userEvent.setup()
    mount(PENDING_BUSINESS)

    const dialog = await openDialog(user, /^Reject/)
    await chooseCode(user, 'Blurry or unreadable')
    await user.type(reasonBox(dialog), REASON)
    await user.click(within(dialog).getByRole('button', { name: /^Reject/ }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    expect(reasonBox(screen.getByRole('dialog'))).toHaveValue(REASON)
  })
})
