import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import {
  mockVerificationDocumentViews,
  resetMockVerifications,
} from '@/mocks/handlers/verifications'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor } from '@tests/render'

import { VerificationDetailPage } from './VerificationDetailPage'

/**
 * The document viewer (plan.md §7, phase V3).
 *
 * ⚠️ **This file guards the two security properties of the whole module**, and
 * neither is observable by looking at the screen:
 *
 * 1. **Nothing fetches a document that a human did not ask for.** Every call to
 *    the route writes a permanent `VIEWED_DOCUMENT` audit row naming the acting
 *    admin and their IP, so a prefetch fabricates evidence that somebody opened
 *    a stranger's passport. `mockVerificationDocumentViews()` is the only way to
 *    see that, and a test that asserts it is the only thing that catches a
 *    regression.
 * 2. **Every blob URL is revoked.** A leaked one outlives the page that made it,
 *    and anyone holding the string can read a decrypted national ID for as long
 *    as the tab is open. `revokeObjectURL` is spied on and asserted — the plan's
 *    acceptance criterion says *asserted, not assumed*.
 *
 * Every assertion waits for **content**, never for a heading or a notice: static
 * copy paints before the query resolves, which is what `reachNotice.test.tsx`
 * cost V0 and `rbac.spec.ts` cost V1.
 */

const PDF_IDENTITY = 'cmulfjl62000201r33hha40xi'
const PNG_IDENTITY = 'cmulfjl62000301r33hha40xj'
const PDF_NAME = '_Weil_ Full.pdf'
const PNG_NAME =
  'a-very-long-unbroken-filename-that-must-not-widen-the-row-nid_front.png'
const DOCUMENT_ROUTE = '*/api/v1/admin/verifications/:id/document/:docIndex'

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

/** Opens the first document and waits for the viewer to be on screen. */
async function openFirstDocument(user: ReturnType<typeof userEvent.setup>) {
  const view = await screen.findByRole('button', { name: /^View/ })
  await user.click(view)
  return screen.findByRole('dialog')
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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a document is fetched only when a person asks (§3.3, R3)', () => {
  it('renders the manifest with no fetch at all', async () => {
    mount(PDF_IDENTITY)
    await screen.findAllByText(PDF_NAME)

    /* The View control exists and has still cost the applicant nothing. */
    expect(await screen.findByRole('button', { name: /^View/ })).toBeEnabled()
    expect(mockVerificationDocumentViews()).toEqual([])
  })

  it('fetches once — exactly once — when View is pressed', async () => {
    /*
     * ⚠️ The count matters as much as the fact. Two rows in the trail say a
     * human looked twice, and an effect that re-runs on a parent re-render would
     * write the second one silently.
     */
    const user = userEvent.setup()
    mount(PDF_IDENTITY)
    await openFirstDocument(user)

    await waitFor(() => {
      expect(mockVerificationDocumentViews()).toEqual([
        { id: PDF_IDENTITY, docIndex: 0 },
      ])
    })
  })

  it('does not fetch on hover', async () => {
    const user = userEvent.setup()
    mount(PDF_IDENTITY)

    await user.hover(await screen.findByRole('button', { name: /^View/ }))

    expect(mockVerificationDocumentViews()).toEqual([])
  })
})

describe('the bytes never leave the blob (§3.3, R2)', () => {
  it('renders a PDF from a blob URL and never from the API path', async () => {
    const user = userEvent.setup()
    mount(PDF_IDENTITY)
    const dialog = await openFirstDocument(user)

    const frame = await waitFor(() => {
      const found = dialog.querySelector('iframe')
      expect(found).not.toBeNull()
      return found as HTMLIFrameElement
    })

    expect(frame.getAttribute('src')).toMatch(/^blob:/)
    /*
     * An `<iframe src>` on the API path would send a credential-less request,
     * 401, and look merely broken — while a signed-in operator would see it work
     * and conclude the path is safe to paste to a colleague.
     */
    expect(frame.getAttribute('src')).not.toContain('/document/')
  })

  it('renders an image from a blob URL, named by its file name', async () => {
    const user = userEvent.setup()
    mount(PNG_IDENTITY)
    await openFirstDocument(user)

    const image = await screen.findByRole('img', { name: PNG_NAME })

    expect(image.getAttribute('src')).toMatch(/^blob:/)
    expect(image.getAttribute('src')).not.toContain('/document/')
  })

  it('revokes the blob URL when the viewer is closed', async () => {
    /*
     * ⚠️ The acceptance criterion says *asserted, not assumed*. Closing the
     * dialog unmounts the viewer, and the revoke rides on that unmount — one
     * code path for "closed" and "navigated away", so neither can rot alone.
     */
    const created: string[] = []
    const create = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((blob: Blob | MediaSource) => {
        const url = `blob:mock/${String(created.length)}`
        created.push(url)
        void blob
        return url
      })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const user = userEvent.setup()
    mount(PDF_IDENTITY)
    await openFirstDocument(user)

    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1)
    })
    expect(revoke).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(revoke).toHaveBeenCalledWith(created[0])
    })
  })

  it('revokes the blob URL when the page unmounts mid-view', async () => {
    const created: string[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:mock/${String(created.length)}`
      created.push(url)
      return url
    })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const user = userEvent.setup()
    const view = mount(PDF_IDENTITY)
    await openFirstDocument(user)
    await waitFor(() => {
      expect(created).toHaveLength(1)
    })

    view.unmount()

    expect(revoke).toHaveBeenCalledWith(created[0])
  })

  it('offers no way to download it, with the viewer open', async () => {
    const user = userEvent.setup()
    mount(PDF_IDENTITY)
    const dialog = await openFirstDocument(user)

    expect(
      screen.queryByRole('button', { name: /download|save/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /download|save/i }),
    ).not.toBeInTheDocument()
    /* Not even an anchor that a browser would treat as one. */
    expect(dialog.querySelector('a[download]')).toBeNull()
  })
})

describe('the viewer is titled from the manifest, not the response (CORS)', () => {
  it('keeps the manifest name even when the response disagrees', async () => {
    /*
     * ⚠️ `Content-Disposition` is NOT exposed cross-origin — the live route's
     * `access-control-expose-headers` is `X-Request-ID` and nothing else,
     * verified by preflight 2026-09-30. So a browser cannot read the name off
     * the response, and anything that titled itself from it would render blank
     * in production while passing under MSW, which does serve the header.
     *
     * This handler makes the two disagree on purpose. The manifest must win.
     */
    server.use(
      http.get(
        DOCUMENT_ROUTE,
        () =>
          new HttpResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': 'inline; filename="not-the-manifest-name.pdf"',
            },
          }),
      ),
    )

    const user = userEvent.setup()
    mount(PDF_IDENTITY)
    const dialog = await openFirstDocument(user)

    expect(await screen.findByRole('heading', { name: PDF_NAME })).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('not-the-manifest-name.pdf')
  })

  it('states that the view has already been recorded, in the past tense', async () => {
    /*
     * The list says opening a document *is* recorded. By the time the viewer is
     * open the row exists, so the sentence changes tense — an operator should
     * read it as a fact about what they have just done, not a warning about what
     * might happen.
     */
    const user = userEvent.setup()
    mount(PDF_IDENTITY)
    const dialog = await openFirstDocument(user)

    expect(dialog).toHaveTextContent(/this view has been recorded/i)
  })
})

describe('a document that will not decrypt is its own failure (§5.7)', () => {
  it('names it as a problem with the file, not with the page', async () => {
    server.use(
      http.get(DOCUMENT_ROUTE, () =>
        HttpResponse.json(
          {
            error: { code: 'INTERNAL_ERROR', message: 'Failed to decrypt document' },
          },
          { status: 500 },
        ),
      ),
    )

    const user = userEvent.setup()
    mount(PDF_IDENTITY)
    await openFirstDocument(user)

    /*
     * The distinction that decides what the operator does next: retry, or reject
     * the application and tell the applicant to resubmit.
     */
    expect(await screen.findByText(/could not be decrypted/i)).toBeInTheDocument()
    expect(screen.getByText(/resubmit/i)).toBeInTheDocument()
    /* The server's own words, kept — an investigation needs them. */
    expect(screen.getByText('Failed to decrypt document')).toBeInTheDocument()
  })

  it('stays open, rather than closing and leaving a toast behind', async () => {
    server.use(
      http.get(DOCUMENT_ROUTE, () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'boom' } },
          {
            status: 500,
          },
        ),
      ),
    )

    const user = userEvent.setup()
    mount(PDF_IDENTITY)
    await openFirstDocument(user)
    await screen.findByText(/could not be decrypted/i)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('says the failed attempt was recorded too', async () => {
    /*
     * It was: the audit row is written by the route, not by a successful
     * decrypt. An operator who retries three times has three rows with their
     * name on them and should know it.
     */
    server.use(
      http.get(DOCUMENT_ROUTE, () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'boom' } },
          {
            status: 500,
          },
        ),
      ),
    )

    const user = userEvent.setup()
    mount(PDF_IDENTITY)
    await openFirstDocument(user)

    expect(await screen.findByText(/recorded either way/i)).toBeInTheDocument()
  })

  it('retries into a second, separate audited view', async () => {
    let calls = 0
    server.use(
      http.get(DOCUMENT_ROUTE, () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json(
            { error: { code: 'INTERNAL_ERROR', message: 'boom' } },
            { status: 500 },
          )
        }
        return new HttpResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        })
      }),
    )

    const user = userEvent.setup()
    mount(PDF_IDENTITY)
    const dialog = await openFirstDocument(user)
    await screen.findByText(/could not be decrypted/i)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => {
      expect(dialog.querySelector('iframe')).not.toBeNull()
    })
    expect(calls).toBe(2)
  })

  it('offers no retry for a document the vault no longer holds', async () => {
    /*
     * A `404` will `404` again, and each press is another audited view. A trail
     * saying an admin opened one document four times reads like suspicion rather
     * than like a file that is simply gone.
     */
    server.use(
      http.get(DOCUMENT_ROUTE, () =>
        HttpResponse.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Document manifest at index not found',
            },
          },
          { status: 404 },
        ),
      ),
    )

    const user = userEvent.setup()
    mount(PDF_IDENTITY)
    await openFirstDocument(user)

    expect(await screen.findByText(/no longer in the vault/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('refuses to render a type it does not trust, and offers no escape hatch', async () => {
    /*
     * ⚠️ The renderer is chosen from the response's content type. An HTML body
     * rendered as a document is a stored-XSS surface, and the temptation at
     * exactly this point is a download link — which would write an unencrypted
     * identity document to the operator's disk (§1.2).
     */
    server.use(
      http.get(
        DOCUMENT_ROUTE,
        () =>
          new HttpResponse('<script>alert(1)</script>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    )

    const user = userEvent.setup()
    mount(PDF_IDENTITY)
    const dialog = await openFirstDocument(user)

    expect(await screen.findByText(/cannot be displayed here/i)).toBeInTheDocument()
    expect(dialog.querySelector('iframe')).toBeNull()
    expect(dialog.querySelector('img')).toBeNull()
    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument()
  })
})
