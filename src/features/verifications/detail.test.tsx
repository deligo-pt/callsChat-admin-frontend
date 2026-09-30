import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import {
  mockVerificationDocumentViews,
  resetMockVerifications,
} from '@/mocks/handlers/verifications'
import { render, screen, setViewport, waitFor } from '@tests/render'

import { describeIdType, formatBytes, initialsFor } from './labels'
import { VerificationDetailPage } from './VerificationDetailPage'

/**
 * The application page (plan.md §7, phase V2).
 *
 * Narrow on purpose. This asserts the behaviours §3 says the read-only page
 * must have — the three honest-emptiness cases, the IP disclosure, and the
 * no-prefetch rule — not the shape of the markup.
 *
 * ⚠️ Every assertion waits for **content**, never for a heading or a notice.
 * V0 learned this in `reachNotice.test.tsx` and V1 learned it again in
 * `rbac.spec.ts`: static copy paints before the query resolves.
 */

const APPROVED_IDENTITY = 'cmulfjl62000201r33hha40xi'
const PENDING_BUSINESS = 'cmu04s71l003701oi3wvzvbdp'
const REJECTED_NO_REASON = 'cmulfjl62000301r33hha40xj'
const UNKNOWN_AUDIT_ACTION = 'cmu04s71l003901oi3wvzvbdr'

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

describe('nothing fetches a document (§3.3)', () => {
  it('renders the whole page without opening one', async () => {
    /*
     * ⚠️ The most important assertion in this file. Every call to the document
     * route writes a permanent audit row naming the acting admin and their IP —
     * `VIEWED_DOCUMENT` rows are real, confirmed live — so a prefetch on mount
     * would forge a record of a human opening a stranger's passport.
     */
    mount(APPROVED_IDENTITY)

    /*
     * `getAllBy`, because the name appears twice on purpose — once in the
     * manifest and once in the `VIEWED_DOCUMENT` audit row, which is the whole
     * substance of that row.
     */
    await waitFor(() => {
      expect(screen.getAllByText('_Weil_ Full.pdf').length).toBeGreaterThan(0)
    })
    expect(mockVerificationDocumentViews()).toEqual([])
  })

  it('shows size and type before any fetch is possible', async () => {
    mount(APPROVED_IDENTITY)
    await screen.findAllByText('_Weil_ Full.pdf')

    /* Opening a 20 MB scan should be a decision, not a surprise. */
    expect(screen.getByText(/509 KB · application\/pdf/)).toBeInTheDocument()
    expect(mockVerificationDocumentViews()).toEqual([])
  })

  it('offers no download affordance at all', async () => {
    mount(APPROVED_IDENTITY)
    await screen.findAllByText('_Weil_ Full.pdf')

    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument()
  })

  it('never turns the manifest path into an element that would fetch it', async () => {
    const view = mount(APPROVED_IDENTITY)
    await screen.findAllByText('_Weil_ Full.pdf')

    /*
     * An `<img src>` or `<iframe src>` pointing at the API path would send a
     * credential-less request, 401, and look broken — or worse, look like it
     * worked to anyone who made it authenticate.
     */
    expect(view.container.querySelector('img[src*="/document/"]')).toBeNull()
    expect(view.container.querySelector('iframe')).toBeNull()
  })
})

describe('an application with nothing to review says so (§3.5)', () => {
  it('names the absence of documents rather than showing an empty list', async () => {
    mount(PENDING_BUSINESS)

    await waitFor(() => {
      expect(screen.getByText(/No documents were submitted/)).toBeInTheDocument()
    })
    expect(screen.getByText(/nothing to review/)).toBeInTheDocument()
  })

  it('names the absence of an audit trail, including the missing submission', async () => {
    /*
     * A live state and a strange one: this application has zero audit rows —
     * not even the `SUBMITTED` that created it (backend ask #4). "Nothing has
     * happened" and "nothing was recorded" are different facts.
     */
    mount(PENDING_BUSINESS)

    await waitFor(() => {
      expect(screen.getByText(/No history was recorded/)).toBeInTheDocument()
    })
    expect(screen.getByText(/not even its submission/)).toBeInTheDocument()
  })
})

describe('a rejection with no reason is named, not blanked (§3.6)', () => {
  it('says the explanation was never recorded', async () => {
    mount(REJECTED_NO_REASON)

    await waitFor(() => {
      expect(screen.getByText(/No explanation was recorded/)).toBeInTheDocument()
    })
    /*
     * The consequence stated, not just the gap. An operator answering "why was
     * I rejected?" has to know the answer does not exist.
     */
    expect(screen.getByText(/given nothing to act on/)).toBeInTheDocument()
  })

  it('still shows the reason code that WAS recorded', async () => {
    mount(REJECTED_NO_REASON)
    await screen.findByText(/No explanation was recorded/)

    expect(screen.getByText('Blurry or unreadable')).toBeInTheDocument()
  })

  it('labels the internal note as invisible to the applicant', async () => {
    mount(APPROVED_IDENTITY)

    await waitFor(() => {
      expect(screen.getByText(/the applicant never sees this/)).toBeInTheDocument()
    })
  })
})

describe('admin IPs are present but not on display (§3.7)', () => {
  it('keeps the IP behind a disclosure that is closed by default', async () => {
    mount(APPROVED_IDENTITY)

    const disclosures = await screen.findAllByText('Show request details')
    expect(disclosures.length).toBeGreaterThan(0)

    /*
     * Present in the DOM — this is `<details>`, not conditional rendering — but
     * inside a closed disclosure, so it is not visible to someone reading over
     * the operator's shoulder.
     */
    const summary = disclosures[0]?.closest('details')
    expect(summary).not.toBeNull()
    expect(summary?.open).toBe(false)
  })

  it('shows who and what without being opened', async () => {
    mount(APPROVED_IDENTITY)

    /*
     * `Approved` is deliberately NOT the assertion: it is both the status badge
     * and the audit action, and an ambiguous query would pass on either.
     * "Opened a document" exists only in the timeline, and it is the row that
     * matters — evidence that a named human looked at someone's passport.
     */
    await waitFor(() => {
      expect(screen.getByText('Opened a document')).toBeInTheDocument()
    })
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(1)
  })

  it('degrades an action it has never seen rather than throwing', async () => {
    mount(UNKNOWN_AUDIT_ACTION)

    await waitFor(() => {
      expect(screen.getByText('Resubmitted with courier receipt')).toBeInTheDocument()
    })
  })
})

describe('the business block, captured live 2026-09-29', () => {
  it('renders the address, which the four-field placeholder would have hidden', async () => {
    mount(PENDING_BUSINESS)

    await waitFor(() => {
      expect(screen.getByText('lisbon portugal')).toBeInTheDocument()
    })
  })

  it('offers the owning account id, the only link from a KYB row to a person', async () => {
    /*
     * `applicant` is entirely null on these (§3.4), so without `business.userId`
     * nobody can say who filed the application.
     */
    mount(PENDING_BUSINESS)

    /*
     * ⚠️ Asserted on the `<dt>`, which is the **visible** caption.
     * `CopyableId`'s own `label` is `sr-only`, so the first cut of this card
     * rendered two bare truncated ids side by side with nothing on screen to
     * say which was the person and which the company. Matching any "Owner
     * account" text would pass on the screen-reader label alone and would not
     * have caught that.
     */
    await waitFor(() => {
      const labels = screen.getAllByText(/Owner account/)
      expect(labels.some((element) => element.tagName === 'DT')).toBe(true)
    })
  })
})

describe('labels', () => {
  it('humanises an idType it has never seen, because the field is free text', () => {
    /* §3.10 — the four documented values are examples, not an enum. */
    expect(describeIdType('NATIONAL_ID')).toBe('National ID')
    expect(describeIdType('VOTER_CARD')).toBe('Voter card')
    expect(describeIdType(null)).toBeNull()
  })

  it('builds initials rather than loading an avatar storage key', () => {
    /*
     * `avatarUrl` is `"avatars/avatar_….jpg"` — relative, no origin. An
     * `<img src>` resolves it against the panel's host and 404s on every
     * application.
     */
    expect(initialsFor('Rahim Ahmed')).toBe('RA')
    expect(initialsFor('DeliGo')).toBe('D')
    expect(initialsFor(null)).toBe('?')
  })

  it('formats sizes in binary units, as uploads are measured', () => {
    /* Integer KB above 10 — a size hint, not an accountancy figure. */
    expect(formatBytes(520_882)).toBe('509 KB')
    expect(formatBytes(900)).toBe('900 B')
  })
})
