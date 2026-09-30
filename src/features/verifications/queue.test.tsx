import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { resetMockVerifications } from '@/mocks/handlers/verifications'
import { render, screen, setViewport, waitFor } from '@tests/render'

import { resolveSubject, SUBJECT_UNKNOWN_LABEL } from './subject'
import { VerificationQueuePage } from './VerificationQueuePage'

/**
 * The queue (plan.md §7, phase V1).
 *
 * Narrow on purpose: this asserts the four behaviours §3 says the screen must
 * have, not the shape of the markup. The contract and the mock are already
 * pinned by `contract.test.ts` and `mockFidelity.test.ts`.
 *
 * ⚠️ Every assertion below waits for a **control or a row**, never for static
 * copy. V0 found this the hard way in `reachNotice.test.tsx`: a page's headings
 * and notices render on the first paint while everything permission-gated is
 * still disabled, so awaiting a heading proves nothing about the page.
 */

function mount(entry = '/verifications') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/verifications', element: <VerificationQueuePage /> },
      { path: '/verifications/:id', element: <div>application screen</div> },
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
  resetMockVerifications()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the default view is filtered, and says so (§3.8)', () => {
  it('opens on the pending applications, not on everything', async () => {
    mount()

    /* Three pending business applications; the two approved ones are hidden. */
    await waitFor(() => {
      expect(screen.getByText('DeliGo')).toBeInTheDocument()
    })
    expect(screen.queryByText('Rahim Ahmed')).not.toBeInTheDocument()
  })

  it('names the filter rather than letting the view pass for everything', async () => {
    mount()
    await screen.findByText('DeliGo')

    /*
     * ⚠️ The §3.8 mitigation. Without this sentence an operator reads three
     * rows as the whole queue — the API returns exactly that for a request with
     * no `status`, and it is the failure mode the plan calls the default trap.
     */
    expect(screen.getByText(/applications only/)).toBeInTheDocument()
    expect(screen.getByText(/All statuses/)).toBeInTheDocument()
  })

  it('shows every status once ALL is chosen', async () => {
    mount('/verifications?status=ALL')

    await waitFor(() => {
      expect(screen.getByText('Rahim Ahmed')).toBeInTheDocument()
    })
    expect(screen.getByText('DeliGo')).toBeInTheDocument()
  })
})

describe('a row may name nobody (§3.4)', () => {
  it('shows the company on a business application', async () => {
    mount()
    await waitFor(() => {
      expect(screen.getByText('DeliGo')).toBeInTheDocument()
    })
  })

  it('shows the person on an identity application', async () => {
    mount('/verifications?status=APPROVED')
    await waitFor(() => {
      expect(screen.getByText('Rahim Ahmed')).toBeInTheDocument()
    })
  })

  it('names the gap when neither source yields a name', () => {
    /*
     * Asserted on the resolver rather than the DOM: all three live business
     * rows happen to carry a company name, so the null-name path is reachable
     * from the contract but not from the seed. This is the case the fallback
     * exists for.
     */
    const subject = resolveSubject({
      id: 'x',
      targetType: 'BUSINESS_ENTITY',
      userId: null,
      businessId: null,
      status: 'PENDING',
      idType: null,
      submittedAt: '2026-09-13T18:11:54.153Z',
      reviewedAt: null,
      applicant: {
        displayName: null,
        username: null,
        email: null,
        phone: null,
        avatarUrl: null,
        accountType: 'PERSONAL',
      },
    })

    expect(subject.name).toBeNull()
    expect(SUBJECT_UNKNOWN_LABEL).toBe('Applicant not returned')
  })

  it('falls through every applicant field rather than checking the object', () => {
    /*
     * ⚠️ The bug this resolver exists to prevent: `applicant` is PRESENT on a
     * business row and full of nulls, so `record.applicant ? name : fallback`
     * would render an empty string.
     */
    const subject = resolveSubject({
      id: 'x',
      targetType: 'USER_IDENTITY',
      userId: 'u1',
      businessId: null,
      status: 'PENDING',
      idType: 'NATIONAL_ID',
      submittedAt: '2026-09-13T18:11:54.153Z',
      reviewedAt: null,
      applicant: {
        displayName: null,
        username: null,
        email: 'someone@example.com',
        phone: null,
        avatarUrl: null,
        accountType: 'PERSONAL',
      },
    })

    expect(subject.name).toBe('someone@example.com')
    /* Shown once, not twice — it is already the primary line. */
    expect(subject.secondary).toBeNull()
  })
})

describe('an application with nothing to review is flagged (§3.5)', () => {
  it('marks a zero-document row rather than printing a quiet 0', async () => {
    mount()
    await screen.findByText('DeliGo')

    /* All three pending applications carry no documents at all. */
    expect(screen.getAllByText('None').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/nothing was submitted to review/).length,
    ).toBeGreaterThan(0)
  })
})

describe('the queue offers no sort it cannot honour', () => {
  it('renders no sortable column header', async () => {
    mount()
    await screen.findByText('DeliGo')

    /*
     * The endpoint accepts no `sortBy` and silently ignores unknown query
     * parameters, so a header control would appear to work and reorder
     * nothing — the staff directory's situation, not the feedback queue's.
     */
    expect(screen.queryByRole('button', { name: /sort by/i })).not.toBeInTheDocument()
    expect(screen.getByText(/cannot be re-sorted/)).toBeInTheDocument()
  })
})

describe('an out-of-range page gets its own empty state (§3.9)', () => {
  it('does not tell the operator to clear filters they never set', async () => {
    mount('/verifications?status=ALL&page=99')

    await waitFor(() => {
      expect(screen.getByText('There is no page here')).toBeInTheDocument()
    })
    /*
     * `total` still reports 5 and `totalPages` still reports 1 on this
     * response, so only the row count could have detected it.
     */
    expect(
      screen.getByRole('button', { name: /back to the first page/i }),
    ).toBeInTheDocument()
  })
})

describe('a chip means the operator changed something from the default', () => {
  /*
   * ⚠️ Two reported bugs with one cause, and both are about the word "clear".
   *
   * V1 showed a status chip for every value except `ALL`, including the default
   * `PENDING`, so the filtered default view could never pass for "everything"
   * (§3.8). That made the chip permanent — and it made "Clear all" visibly fail,
   * because clearing returns every filter to its default and the default IS
   * `PENDING`. An operator who cleared a Type filter watched the Status chip
   * stay put under a button labelled Clear all.
   *
   * The rule now: **a chip exists only when a filter differs from its default**,
   * in either direction. So "a chip exists" and "something is clearable" are the
   * same condition, and both controls finally mean the same thing.
   *
   * §3.8 is unaffected — the notice strip and the Status select both state what
   * is on screen, and neither can be mistaken for a control.
   */
  it('shows no chip at all on the landing view', async () => {
    mount()

    /* Waits for rows, so an absent chip is a fact and not a race. */
    await waitFor(() => {
      expect(screen.getByText('DeliGo')).toBeInTheDocument()
    })
    expect(screen.queryByText('Status:')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  it('still says the default view is filtered, in the notice rather than a chip', async () => {
    /*
     * The §3.8 guarantee, now carried entirely by the notice. If this ever goes
     * quiet, the queue is back to looking like it shows everything.
     */
    mount()

    await waitFor(() => {
      expect(screen.getByText('DeliGo')).toBeInTheDocument()
    })
    expect(screen.getByText(/applications only/)).toBeInTheDocument()
  })

  it('appears when the view is narrowed past the default', async () => {
    mount('/verifications?targetType=BUSINESS_ENTITY')

    expect(await screen.findByRole('button', { name: 'Clear all' })).toBeInTheDocument()
  })

  it('appears when the view is WIDENED to every status', async () => {
    /*
     * ⚠️ The inversion of V1, and the more useful of the two chips: a queue
     * showing every status is the state worth flagging. V1 showed nothing here,
     * which left the operator with no chip to dismiss and no Clear all either.
     */
    mount('/verifications?status=ALL')

    await waitFor(() => {
      expect(screen.getByText('Status:')).toBeInTheDocument()
    })
    /* Not asserted by its value: "All statuses" is also the select's own
     * label and appears in the notice. The chip's presence is the claim. */
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
  })

  it('dismissing the status chip returns to the default, not to ALL', async () => {
    /*
     * ⚠️ This reverses V1's rule that ✕ must widen. That only held while the
     * chip was permanent — ✕ had to do *something*. Now the chip means "you
     * changed this", so ✕ undoes the change, which is what Clear all does for
     * every filter at once.
     */
    const user = userEvent.setup()
    mount('/verifications?status=ALL')

    await user.click(
      await screen.findByRole('button', { name: /Remove Status filter/i }),
    )

    await waitFor(() => {
      expect(screen.queryByText('Status:')).not.toBeInTheDocument()
    })
    /* Back to the pending-only landing view, with nothing left to clear. */
    expect(screen.getByText(/applications only/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  it('Clear all empties the chip row completely', async () => {
    /*
     * ⚠️ The reported bug, pinned. Previously the Status chip survived this and
     * the button looked broken.
     */
    const user = userEvent.setup()
    mount('/verifications?status=APPROVED&targetType=USER_IDENTITY&search=call')

    await user.click(await screen.findByRole('button', { name: 'Clear all' }))

    await waitFor(() => {
      expect(screen.queryByText('Status:')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Search:')).not.toBeInTheDocument()
    expect(screen.queryByText('Type:')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  it('empties the search box, not just the results', async () => {
    /*
     * ⚠️ The second half of the same bug. `defaultValue` is read once, so an
     * uncontrolled input went on displaying a term that had already been
     * cleared — the rows updated while the box still claimed to be filtering by
     * something, which reads as the button having half-worked.
     */
    const user = userEvent.setup()
    mount('/verifications?search=deligo')

    const input = await screen.findByRole('searchbox', { name: 'Search' })
    expect(input).toHaveValue('deligo')

    await user.click(await screen.findByRole('button', { name: 'Clear all' }))

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
    })
  })
})
