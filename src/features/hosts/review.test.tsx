import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import {
  mockHostApplications,
  mockLiveHosts,
  resetMockHosts,
  seedMockHosts,
} from '@/mocks/handlers/hosts'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { HostApplicationsPage } from './HostApplicationsPage'
import { introMediaKind, safeIntroMediaSrc } from './introMedia'

/**
 * The detail drawer and the two review decisions — phase H5.
 */

const PENDING_ID = 'cmv6j6vfk00007wvb59fdeh07'
const HOSTILE_ID = 'cmv6j6vfk00027wvb59fdeh09'

/** Every write the screen issued, with its parsed body. */
let writes: { path: string; body: Record<string, unknown> }[] = []

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/host-applications', element: <HostApplicationsPage /> },
      { path: '/hosts', element: <div>host roster</div> },
    ],
    { initialEntries: ['/host-applications'] },
  )

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TooltipProvider delayDuration={0}>
          <RouterProvider router={router} />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>,
  )

  return userEvent.setup()
}

/**
 * The confirmation dialog, by its title.
 *
 * ⚠️ **Named, because the drawer behind it is also `role="dialog"`.**
 * `ConfirmActionDialog` is built on `Dialog`, not `AlertDialog`, so an
 * unnamed query matches two elements once the confirmation opens — and
 * `role="alertdialog"`, which is what I reached for first, matches none.
 */
function confirmDialog(title: RegExp) {
  return screen.findByRole('dialog', { name: title })
}

/** Open the drawer for a row by its visible applicant name. */
async function openDrawer(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByText(name))

  /*
   * ⚠️ Queried by role alone, not by an accessible name.
   *
   * `SheetContent` carries `aria-label="Host application"`, but Radix also
   * wires `aria-labelledby` to `SheetTitle`, and `aria-labelledby` wins — so
   * the dialog's accessible name is the applicant's, which changes per row.
   * Matching on a fixed name timed out every test in this file.
   */
  const drawer = await screen.findByRole('dialog')

  /*
   * ⚠️ **Wait for the record, not just for the dialog.**
   *
   * The drawer fetches its own detail, so it paints a skeleton first and every
   * assertion made at that moment fails on content that is simply not there
   * yet. The "Application" section heading is the marker because it renders for
   * every record — including the hostile one, which has no name, no email and
   * no commitment. It replaced "Category and commitment" in H7, when the flat
   * field stack became titled sections.
   *
   * Centralised here after making this same mistake three times in one
   * session: the stats strip in `queue.test.tsx`, and twice here. A per-test
   * `waitFor` fixes one test; a helper that cannot return early fixes the
   * class.
   */
  await within(drawer).findByRole('heading', { name: 'Application' })

  return drawer
}

beforeEach(() => {
  resetMockHosts()
  seedMockHosts()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })

  writes = []
  server.events.removeAllListeners('request:start')
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'GET') return
    /*
     * ⚠️ Scoped to the host routes. An unscoped listener also captures
     * `AuthProvider`'s token traffic, and `writes[0]` would then be whichever
     * landed first — a race that passes alone and fails under load. That exact
     * bug cost a session in the bootstrap module.
     */
    const path = new URL(request.url).pathname
    if (!path.includes('/admin/live/')) return

    const clone = request.clone()
    writes.push({
      path,
      body: (await clone.json().catch(() => ({}))) as Record<string, unknown>,
    })
  })
})

describe('the drawer', () => {
  it('opens on a row and shows the applicant', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Alice Johnson')

    expect(within(drawer).getByText('sk_alice@test.com')).toBeInTheDocument()
    expect(within(drawer).getByText(/12 hrs\/week/)).toBeInTheDocument()
  })

  it('offers no decisions on an application already reviewed', async () => {
    /*
     * ⚠️ And says why. An operator who simply sees no buttons cannot tell
     * whether the decision was already made or whether their role is too low.
     */
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Rafa')

    expect(within(drawer).queryByRole('button', { name: /^approve$/i })).toBeNull()
    expect(within(drawer).getByText(/already been reviewed/i)).toBeInTheDocument()
  })

  it('shows the rejection reason that was sent to the applicant', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Rafa')

    expect(
      within(drawer).getByText(/Sample intro audio was unclear/),
    ).toBeInTheDocument()
  })
})

describe('intro media is defused before the browser fetches it', () => {
  /*
   * ⚠️ **A stronger requirement than the panel's other URL guards.** Elsewhere
   * an unvalidated URL becomes an `href` and a human must click. Here it
   * becomes a `src` the browser loads on render — by the time an operator
   * could notice, the request has gone.
   */

  it('refuses a javascript: sample and shows it as text instead', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'No display name')

    expect(within(drawer).getByText(/cannot be played/i)).toBeInTheDocument()
    expect(
      within(drawer).getByText('javascript:alert(document.domain)'),
    ).toBeInTheDocument()
  })

  it('mounts no media element at all for a refused sample', async () => {
    /*
     * The assertion that matters: not "a warning is shown" but "nothing was
     * loaded". A warning above a live `<video src="javascript:…">` would read
     * as safe and not be.
     */
    const user = renderScreen()
    const drawer = await openDrawer(user, 'No display name')

    expect(drawer.querySelector('video')).toBeNull()
    expect(drawer.querySelector('audio')).toBeNull()
    expect(drawer.querySelector('[src*="javascript"]')).toBeNull()
  })

  it('fetches nothing until the operator asks to see it', async () => {
    /*
     * ⚠️ H7. The player used to mount with the drawer under
     * `preload="metadata"`, so opening an application pulled that applicant's
     * media off a stranger's host whether or not anyone watched it. The
     * resting state must now carry no media element and no `src` at all —
     * asserting only on the button would pass with a hidden `<video>` behind
     * it.
     */
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Alice Johnson')

    expect(drawer.querySelector('video')).toBeNull()
    expect(drawer.querySelector('audio')).toBeNull()
    expect(drawer.querySelector('[src]')).toBeNull()

    expect(
      within(drawer).getByRole('button', { name: /play video/i }),
    ).toBeInTheDocument()
  })

  it('plays an https video sample once View is clicked', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Alice Johnson')

    await user.click(within(drawer).getByRole('button', { name: /play video/i }))

    const video = drawer.querySelector('video')
    expect(video?.getAttribute('src')).toBe(
      'https://cdn.callschat.com/samples/intro.mp4',
    )
  })

  it('shows the questionnaire answers, including the ones that are not text', async () => {
    /*
     * ⚠️ O4, closed 2026-10-15 by a live record: the field is `qaResponses`
     * and the guide names no field at all. The keys are whatever the mobile
     * form asked, and the values are not necessarily strings — this fixture
     * answers with a number and a boolean, which a `z.string()` contract or a
     * text-only renderer would have dropped without a word.
     */
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Alice Johnson')

    expect(within(drawer).getByRole('heading', { name: 'Questionnaire' })).toBeVisible()
    expect(within(drawer).getByText('Years experience')).toBeInTheDocument()
    expect(within(drawer).getByText('3')).toBeInTheDocument()
    expect(within(drawer).getByText('true')).toBeInTheDocument()
    expect(within(drawer).getByText(/Condenser mic/)).toBeInTheDocument()
  })

  it('leaves the questionnaire out when the applicant answered nothing', async () => {
    /* The hostile fixture carries `{}` — an empty card is noise, not data. */
    const user = renderScreen()
    const drawer = await openDrawer(user, 'No display name')

    expect(within(drawer).queryByRole('heading', { name: 'Questionnaire' })).toBeNull()
  })

  it('shows a non-playable social link as text rather than a link', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'No display name')

    expect(within(drawer).getByText(/not a usable link/i)).toBeInTheDocument()
    expect(within(drawer).queryByRole('link', { name: /not-a-url-at-all/ })).toBeNull()
  })
})

describe('the media kind is inferred, because the contract carries no type', () => {
  /*
   * ⚠️ There is no MIME field anywhere in this response. The doc says to embed
   * `<video>` for mp4 and `<audio>` for mp3, but the only signal available is
   * the extension on a string the applicant chose.
   */

  it.each([
    ['https://cdn.example.com/a/intro.mp4', 'video'],
    ['https://cdn.example.com/a/clip.webm', 'video'],
    ['https://cdn.example.com/a/sample.mp3', 'audio'],
    ['https://cdn.example.com/a/sample.m4a', 'audio'],
  ])('classifies %s as %s', (url, kind) => {
    expect(introMediaKind(url)).toBe(kind)
  })

  it('is not fooled by a query string', () => {
    expect(introMediaKind('https://cdn.example.com/a/intro.mp4?x=.mp3')).toBe('video')
  })

  it('returns unknown rather than guessing a default', () => {
    /*
     * ⚠️ An `<audio>` pointed at a video plays sound with no picture, and a
     * reviewer would judge the applicant on a sample they never saw. Unknown
     * renders as a link instead.
     */
    expect(introMediaKind('https://cdn.example.com/a/file')).toBe('unknown')
  })

  it('refuses everything that is not https', () => {
    expect(safeIntroMediaSrc('javascript:alert(1)')).toBeNull()
    expect(safeIntroMediaSrc('http://cdn.example.com/a.mp4')).toBeNull()
    expect(safeIntroMediaSrc('data:text/html,<script>')).toBeNull()
    expect(safeIntroMediaSrc('uploads/relative.mp4')).toBeNull()
    expect(safeIntroMediaSrc(null)).toBeNull()
  })
})

describe('approve', () => {
  it('asks for confirmation rather than acting on the click', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Alice Johnson')

    await user.click(within(drawer).getByRole('button', { name: /^approve$/i }))

    expect(await screen.findByText(/There is no way to un-approve/)).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('sends only the action, because the API takes nothing else', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Alice Johnson')
    await user.click(within(drawer).getByRole('button', { name: /^approve$/i }))

    await user.click(await screen.findByRole('button', { name: /approve and notify/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body).toEqual({ action: 'APPROVE' })

    /*
     * ⚠️ Settle before the test ends. A successful review invalidates three
     * query keys and closes the drawer; if the test stops at the assertion,
     * those refetches land after the next test's `resetMockHosts()` and
     * corrupt the record it is about to read. That is how `edits.test.tsx`
     * went order-dependent in the bootstrap module — and why the three tests
     * that pass alone were failing in file order here.
     */
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('asks for no reason, since the endpoint has nowhere to put one', async () => {
    /*
     * ⚠️ Demanding ten characters the client then discards would imply a
     * record that is never sent. The approve body is `{action}` and nothing
     * else.
     */
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Alice Johnson')
    await user.click(within(drawer).getByRole('button', { name: /^approve$/i }))

    const dialog = await confirmDialog(/approve this application/i)
    expect(within(dialog).queryByLabelText(/reason/i)).toBeNull()
  })

  it('creates the live host profile, which is why it cannot be undone', async () => {
    const user = renderScreen()
    expect(mockLiveHosts().some((h) => h.userId === 'cmu2moelr0000zwvbz66ignv7')).toBe(
      false,
    )

    const drawer = await openDrawer(user, 'Alice Johnson')
    await user.click(within(drawer).getByRole('button', { name: /^approve$/i }))
    await user.click(await screen.findByRole('button', { name: /approve and notify/i }))

    await waitFor(() => {
      expect(
        mockLiveHosts().find((h) => h.userId === 'cmu2moelr0000zwvbz66ignv7')?.status,
      ).toBe('ACTIVE')
    })

    /*
     * ⚠️ Settle before the test ends. A successful review invalidates three
     * query keys and closes the drawer; if the test stops at the assertion,
     * those refetches land after the next test's `resetMockHosts()` and
     * corrupt the record it is about to read. That is how `edits.test.tsx`
     * went order-dependent in the bootstrap module — and why the three tests
     * that pass alone were failing in file order here.
     */
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('reject', () => {
  it('requires a reason before it will send', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Alice Johnson')
    await user.click(within(drawer).getByRole('button', { name: /^reject$/i }))

    const dialog = await confirmDialog(/reject this application/i)

    /*
     * ⚠️ Clicked, not inspected for `disabled`.
     *
     * `ConfirmActionDialog` deliberately leaves the confirm button enabled and
     * refuses on click, revealing the error — my first version asserted
     * `toBeDisabled()` and failed against a component that was behaving
     * correctly. Clicking is the better assertion anyway: it proves the guard
     * holds, not that a button is styled a particular way.
     */
    await user.click(within(dialog).getByRole('button', { name: /reject and notify/i }))

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('says the reason goes to the applicant, not to an audit log', async () => {
    /*
     * ⚠️ The shared dialog's default hint promises the text is "recorded in
     * the audit log with your name and the current time". True for the
     * consumer-user actions it was built for, and the wrong promise here —
     * this text is a message a real person reads about their own application.
     */
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Alice Johnson')
    await user.click(within(drawer).getByRole('button', { name: /^reject$/i }))

    const dialog = await confirmDialog(/reject this application/i)
    expect(within(dialog).getByText(/sent to the applicant/i)).toBeInTheDocument()
    expect(within(dialog).queryByText(/audit log/i)).toBeNull()
  })

  it('sends the reason as rejectionReason', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Alice Johnson')
    await user.click(within(drawer).getByRole('button', { name: /^reject$/i }))

    const dialog = await confirmDialog(/reject this application/i)
    await user.type(
      within(dialog).getByLabelText(/reason/i),
      'The intro sample has no audio at all.',
    )
    await user.click(within(dialog).getByRole('button', { name: /reject and notify/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body).toEqual({
      action: 'REJECT',
      rejectionReason: 'The intro sample has no audio at all.',
    })

    /*
     * ⚠️ Settle before the test ends. A successful review invalidates three
     * query keys and closes the drawer; if the test stops at the assertion,
     * those refetches land after the next test's `resetMockHosts()` and
     * corrupt the record it is about to read. That is how `edits.test.tsx`
     * went order-dependent in the bootstrap module — and why the three tests
     * that pass alone were failing in file order here.
     */
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('is stricter than the service, deliberately', async () => {
    /*
     * ⚠️ The service accepts 5 characters; this dialog requires 10. The panel
     * is the stricter of the two on purpose — "nope." clears the server's bar
     * and is not something to send a person about their own application.
     *
     * Asserted with a 9-character reason: long enough for the API, short
     * enough for the panel to refuse.
     */
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Alice Johnson')
    await user.click(within(drawer).getByRole('button', { name: /^reject$/i }))

    const dialog = await confirmDialog(/reject this application/i)
    await user.type(within(dialog).getByLabelText(/reason/i), 'too short')
    await user.click(within(dialog).getByRole('button', { name: /reject and notify/i }))

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('records the rejection on the record', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'Alice Johnson')
    await user.click(within(drawer).getByRole('button', { name: /^reject$/i }))

    const dialog = await confirmDialog(/reject this application/i)
    await user.type(
      within(dialog).getByLabelText(/reason/i),
      'The intro sample has no audio at all.',
    )
    await user.click(within(dialog).getByRole('button', { name: /reject and notify/i }))

    await waitFor(() => {
      const row = mockHostApplications().find((r) => r.id === PENDING_ID)
      expect(row?.status).toBe('REJECTED')
      expect(row?.rejectionReason).toBe('The intro sample has no audio at all.')
    })

    /*
     * ⚠️ Settle before the test ends. A successful review invalidates three
     * query keys and closes the drawer; if the test stops at the assertion,
     * those refetches land after the next test's `resetMockHosts()` and
     * corrupt the record it is about to read. That is how `edits.test.tsx`
     * went order-dependent in the bootstrap module — and why the three tests
     * that pass alone were failing in file order here.
     */
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('the hostile record survives the drawer', () => {
  it('names an applicant with no profile at all', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'No display name')

    expect(within(drawer).getByText(/No email on this account/)).toBeInTheDocument()
  })

  it('renders a several-thousand-character motivation without a crash', async () => {
    const user = renderScreen()
    const drawer = await openDrawer(user, 'No display name')

    const row = mockHostApplications().find((r) => r.id === HOSTILE_ID)
    expect((row?.motivation ?? '').length).toBeGreaterThan(2000)
    expect(within(drawer).getByText(/Motivation/)).toBeInTheDocument()
  })
})
