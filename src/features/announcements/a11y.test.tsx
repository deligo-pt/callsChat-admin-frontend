import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resetMockAnnouncements } from '@/mocks/handlers/announcements'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { expectNoA11yViolations } from '@tests/a11y'
import { fireEvent, render, screen, setViewport, within } from '@tests/render'

import { AnnouncementsPage } from './AnnouncementsPage'

/**
 * Accessibility of the announcements surfaces — phase B5.
 *
 * Swept against the **least tidy** state available, never a clean one:
 *
 * - the queue with every fixture on screen, so all three status tones, all four
 *   priority tones, the pinned marker, the media cell with and without
 *   metadata, and the 255-character unbroken headline are all rendered at once;
 * - the **editor**, which is the richest form in the module — two text fields,
 *   two selects, two optional CTA inputs, a file input and a switch;
 * - the editor **in its validation-error state**, because an error that is
 *   announced to nobody is the failure mode this sweep exists for;
 * - the editor's **publish confirmation**, which replaces the footer and must
 *   not orphan the controls it replaces;
 * - the **delete dialog**, the one surface carrying a typed confirmation.
 *
 * A clean fixture would pass without ever rendering the states that are hardest
 * to get right.
 *
 * Colour contrast is excluded here — jsdom has no canvas — and is verified
 * against a real browser in `tests/e2e/contrast.spec.ts`.
 */

/**
 * `region` is disabled for the body sweeps, and only those: a test that mounts
 * one page without `AdminLayout` has no `<main>` landmark, so every node reads
 * as "not contained by a landmark". That is an artifact of the harness, and the
 * landmark structure is covered by `tests/e2e/shell.spec.ts`.
 */
const BODY_SCAN = { rules: { region: { enabled: false } } }

function mount(entry = '/announcements') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/announcements', element: <AnnouncementsPage /> }],
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

const PUBLISHED_ROW = 'Important Security Update'
const DRAFT_ROW = 'Business tools are coming to your workspace'

/** Open the compose dialog. */
async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /new announcement/i }))
  return screen.findByRole('dialog')
}

beforeEach(() => {
  resetMockAnnouncements()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the queue', () => {
  it('has no violations with every fixture on screen', async () => {
    const { container } = mount()
    await screen.findByText(PUBLISHED_ROW)

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('has no violations as a stack of cards on a phone', async () => {
    /*
     * ⚠️ A different renderer, not a narrower one. Below `lg`, `DataList`
     * swaps `DataTable` for `RecordCardList` — different markup, different
     * roles, different place for the row actions — so the desktop sweep says
     * nothing about it.
     */
    setViewport(360)
    const { container } = mount()
    await screen.findByText(PUBLISHED_ROW)

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('has no violations in its empty state', async () => {
    /*
     * The state the live platform is actually in — the announcements table
     * holds zero rows — so it is the first thing anyone will see.
     */
    const { container } = mount('/announcements?status=ARCHIVED&priority=URGENT')
    await screen.findByText(/no announcements match this view/i)

    await expectNoA11yViolations(container, BODY_SCAN)
  })
})

describe('the editor', () => {
  it('has no violations when composing', async () => {
    const user = userEvent.setup()
    const { container } = mount()
    await screen.findByText(PUBLISHED_ROW)

    await openEditor(user)

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('has no violations when editing the most hostile record', async () => {
    /*
     * The 255-character unbroken headline and the several-thousand-character
     * body, loaded into a form. Both are legal server-side.
     */
    const user = userEvent.setup()
    const { container } = mount()
    const hostile = await screen.findByText(/^Operational-notice-concerning/)

    await user.click(hostile)
    await screen.findByRole('dialog')

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('announces a validation error rather than only colouring it', async () => {
    /*
     * ⚠️ The sweep that justifies this file. A rejected save that is signalled
     * only by a red border tells a screen-reader user nothing at all — and the
     * CTA rule here has no server counterpart, so this error is the only thing
     * standing between a typo and a dead button on every phone.
     */
    const user = userEvent.setup()
    const { container } = mount()
    await screen.findByText(PUBLISHED_ROW)

    const dialog = await openEditor(user)
    await user.type(within(dialog).getByLabelText(/headline/i), 'A valid headline')
    await user.type(within(dialog).getByLabelText(/^body/i), 'Valid body copy.')
    /* Half a call to action — label with no link. */
    await user.type(within(dialog).getByLabelText(/button label/i), 'Learn more')
    await user.click(within(dialog).getByRole('button', { name: /save as draft/i }))

    const error = await within(dialog).findByText(/needs both a label and a link/i)
    /* `FormField` renders errors with `role="alert"`, so they are spoken. */
    expect(error).toHaveAttribute('role', 'alert')

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('announces a rejected attachment', async () => {
    const user = userEvent.setup()
    const { container } = mount()
    await screen.findByText(PUBLISHED_ROW)

    const dialog = await openEditor(user)
    /*
     * `fireEvent`, because `userEvent` honours `accept` and would drop the file
     * before the handler ran — see `editor.test.tsx` for why a real browser is
     * not that strict.
     */
    fireEvent.change(within(dialog).getByLabelText(/attachment/i), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    })

    await within(dialog).findByText(/cannot be attached/i)

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('has no violations in the publish confirmation', async () => {
    /*
     * The confirm step replaces the footer rather than covering the form, so
     * the controls it replaces must not be left orphaned in the accessibility
     * tree — which is exactly what a hidden-but-focusable button would be.
     */
    const user = userEvent.setup()
    const { container } = mount()
    await screen.findByText(PUBLISHED_ROW)

    const dialog = await openEditor(user)
    await user.type(within(dialog).getByLabelText(/headline/i), 'A valid headline')
    await user.type(within(dialog).getByLabelText(/^body/i), 'Valid body copy.')
    await user.click(within(dialog).getByRole('button', { name: /publish now/i }))

    await within(dialog).findByText(/publish to every matching user now/i)

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('has no violations at 360, where the form is one column', async () => {
    setViewport(360)
    const user = userEvent.setup()
    const { container } = mount()
    await screen.findByText(PUBLISHED_ROW)

    await openEditor(user)

    await expectNoA11yViolations(container, BODY_SCAN)
  })
})

describe('the destructive dialogs', () => {
  it('has no violations on the delete dialog and its typed confirmation', async () => {
    const user = userEvent.setup()
    const { container } = mount()
    await screen.findByText(DRAFT_ROW)

    await user.click(
      screen.getByRole('button', { name: `More actions for ${DRAFT_ROW}` }),
    )
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }))
    await screen.findByLabelText(/to confirm/i)

    await expectNoA11yViolations(container, BODY_SCAN)
  })

  it('has no violations on the archive dialog', async () => {
    const user = userEvent.setup()
    const { container } = mount()
    await screen.findByText(PUBLISHED_ROW)

    await user.click(
      screen.getByRole('button', { name: `More actions for ${PUBLISHED_ROW}` }),
    )
    await user.click(await screen.findByRole('menuitem', { name: /archive/i }))
    await screen.findByText(/removes the announcement from the app for everyone/i)

    await expectNoA11yViolations(container, BODY_SCAN)
  })
})

describe('names that stand on their own', () => {
  it('names every row control by its announcement, not by its position', async () => {
    /*
     * ⚠️ A table of "Pin" and "More actions" buttons is unusable by voice or
     * by a rotor list: fourteen identically-named controls with nothing to tell
     * them apart. Each one carries its row's headline.
     */
    mount()
    await screen.findByText(PUBLISHED_ROW)

    expect(
      screen.getByRole('button', { name: `Unpin ${PUBLISHED_ROW}` }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: `More actions for ${PUBLISHED_ROW}` }),
    ).toBeInTheDocument()

    /* And no bare ones left behind. */
    expect(screen.queryByRole('button', { name: /^pin$/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^more actions$/i }),
    ).not.toBeInTheDocument()
  })

  it('states the pin outcome rather than the current state', async () => {
    /*
     * "Pinned" would leave a screen-reader user unsure whether pressing it pins
     * or unpins. Asserted here as well as in `queue.test.tsx` because this is
     * the file about whether the panel can be operated without seeing it.
     */
    mount()
    await screen.findByText(DRAFT_ROW)

    expect(screen.getByRole('button', { name: `Pin ${DRAFT_ROW}` })).toBeInTheDocument()
  })

  it('gives the stats strip a heading that says the numbers are global', async () => {
    /*
     * A sighted operator reads "Platform totals, unaffected by the filters
     * below" beside the heading. A screen-reader user navigating by region
     * needs the region itself to be named, or the five numbers are just five
     * numbers next to a filtered table.
     */
    mount()
    await screen.findByText(PUBLISHED_ROW)

    expect(
      screen.getByRole('region', { name: /all announcements/i }),
    ).toBeInTheDocument()
  })

  it('labels the reach figures, which are not buttons and say so', async () => {
    mount()
    await screen.findByText(PUBLISHED_ROW)

    /* The distinction a sighted user gets from the missing border. */
    expect(
      screen.getByText(/total opens, including repeats by the same person/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/one per person per announcement/i)).toBeInTheDocument()
  })
})
