import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  mockAnnouncements,
  resetMockAnnouncements,
} from '@/mocks/handlers/announcements'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { API_PREFIX } from '@/mocks/handlers/shared'
import { server } from '@/mocks/server'
import { fireEvent, render, screen, setViewport, waitFor, within } from '@tests/render'

import { AnnouncementsPage } from './AnnouncementsPage'

/**
 * Compose, edit and delete (plan.md §7, phase B3).
 *
 * Narrow on purpose. The contract and the mock are pinned by `contract.test.ts`
 * and `mockFidelity.test.ts`; the queue by `queue.test.tsx`. This file asserts
 * only what makes the **write** surface safe, because every write here lands on
 * every phone on the platform and none of it can be recalled:
 *
 *   - publishing takes two deliberate actions, never one;
 *   - `status` comes from the button pressed, never from a control;
 *   - media uploads on commit and nowhere else (the route has no delete);
 *   - deleting demands the headline typed out.
 */

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

/** Open the compose dialog and fill the two required fields. */
async function compose(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /new announcement/i }))

  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByLabelText(/headline/i), 'A brand new notice')
  await user.type(within(dialog).getByLabelText(/^body/i), 'Something worth saying.')

  return dialog
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

describe('status comes from the button, not from a control', () => {
  it('offers no status select anywhere in the form', async () => {
    /*
     * ⚠️ The structural guard behind §3.5. There are exactly two outcomes —
     * draft, or live now — so a dropdown would imply a third AND would let the
     * dangerous value sit in a control nobody looked at. If a status select
     * ever appears, this fails.
     */
    const user = userEvent.setup()
    mount()
    await screen.findByText(PUBLISHED_ROW)

    const dialog = await compose(user)

    expect(within(dialog).queryByLabelText(/^status/i)).not.toBeInTheDocument()
    /* The two buttons that do carry the decision. */
    expect(
      within(dialog).getByRole('button', { name: /save as draft/i }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: /publish now/i }),
    ).toBeInTheDocument()
  })

  it('saves a draft in one step, with no confirmation', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText(PUBLISHED_ROW)

    const dialog = await compose(user)
    await user.click(within(dialog).getByRole('button', { name: /save as draft/i }))

    /*
     * No confirm step: a draft reaches nobody, so nothing needs guarding.
     *
     * ⚠️ Asserted on the **store**, not on the toast. `tests/render.tsx` mounts
     * no `Toaster`, so toast copy is unobservable here — and a test that looked
     * for it would be asserting on the harness rather than on the write.
     */
    await waitFor(() => {
      expect(
        mockAnnouncements().find((row) => row.title === 'A brand new notice')?.status,
      ).toBe('DRAFT')
    })
  })

  it('will not publish on a single click', async () => {
    /*
     * ⚠️ **The most important assertion in this file.** Publishing broadcasts
     * to every matching user before the response returns, and there is no
     * unsend. One click must never be enough.
     */
    const user = userEvent.setup()
    mount()
    await screen.findByText(PUBLISHED_ROW)

    const dialog = await compose(user)
    await user.click(within(dialog).getByRole('button', { name: /publish now/i }))

    /* The confirm step appeared and nothing was written. */
    expect(
      await within(dialog).findByText(/publish to every matching user now/i),
    ).toBeInTheDocument()
    expect(mockAnnouncements().some((row) => row.title === 'A brand new notice')).toBe(
      false,
    )
  })

  it('publishes once the second confirmation is given', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText(PUBLISHED_ROW)

    const dialog = await compose(user)
    await user.click(within(dialog).getByRole('button', { name: /publish now/i }))
    await user.click(
      await within(dialog).findByRole('button', { name: /yes, publish now/i }),
    )

    await waitFor(() => {
      expect(
        mockAnnouncements().find((row) => row.title === 'A brand new notice')?.status,
      ).toBe('PUBLISHED')
    })
  })

  it('lets the operator back out of the confirm step without publishing', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText(PUBLISHED_ROW)

    const dialog = await compose(user)
    await user.click(within(dialog).getByRole('button', { name: /publish now/i }))
    await user.click(await within(dialog).findByRole('button', { name: /go back/i }))

    /* Back to the two-button footer, nothing sent. */
    expect(
      within(dialog).getByRole('button', { name: /save as draft/i }),
    ).toBeInTheDocument()
    expect(mockAnnouncements().some((row) => row.title === 'A brand new notice')).toBe(
      false,
    )
  })
})

describe('editing something already live', () => {
  it('offers no "Save as draft", because that would withdraw it silently', async () => {
    /*
     * ⚠️ Moving live copy back to `DRAFT` removes it from every user's feed.
     * That is an act of withdrawal and belongs behind the explicit Archive
     * action — not behind a button labelled "Save as draft". Absent rather than
     * disabled: a disabled control invites the question of how to enable it.
     */
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByText(PUBLISHED_ROW))

    const dialog = await screen.findByRole('dialog')

    expect(
      within(dialog).queryByRole('button', { name: /save as draft/i }),
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: /save changes/i }),
    ).toBeInTheDocument()
  })

  it('says plainly that an edit does not re-notify anyone', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByText(PUBLISHED_ROW))

    expect(
      await screen.findByText(/does not re-notify anyone who has already read it/i),
    ).toBeInTheDocument()
  })

  it('seeds the form from the row it was opened from', async () => {
    /*
     * There is no `GET /admin/announcements/:id` (§3.2), so the list row is the
     * only source. A blank form here would mean an edit silently cleared
     * everything it did not resend.
     */
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByText(DRAFT_ROW))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/headline/i)).toHaveValue(DRAFT_ROW)
  })
})

describe('media is uploaded on commit and nowhere else', () => {
  it('does not upload when a file is merely chosen', async () => {
    /*
     * ⚠️ `POST /media/upload` has **no delete route**, so every accepted byte
     * is permanent and publicly readable. Uploading on selection would litter
     * the CDN with an orphan for every abandoned draft — and two such orphans
     * from contract probing are still there, which is why this is a test and
     * not a comment.
     */
    let uploads = 0
    server.use(
      http.post(`${API_PREFIX}/media/upload`, () => {
        uploads += 1
        return Response.json({
          success: true,
          data: {
            url: 'https://media.callschat.com/calls-chat-media/uploads/x.png',
            key: 'uploads/x.png',
            filename: 'x.png',
            mimetype: 'image/png',
          },
        })
      }),
    )

    const user = userEvent.setup()
    mount()
    await screen.findByText(PUBLISHED_ROW)

    const dialog = await compose(user)
    const file = new File(['bytes'], 'poster.png', { type: 'image/png' })
    await user.upload(within(dialog).getByLabelText(/attachment/i), file)

    /* Chosen, shown, and not sent. */
    expect(await within(dialog).findByText(/poster\.png/)).toBeInTheDocument()
    expect(uploads).toBe(0)

    await user.click(within(dialog).getByRole('button', { name: /save as draft/i }))
    await waitFor(() => {
      expect(uploads).toBe(1)
    })
  })

  it('refuses a file type the mobile client could not render', async () => {
    /*
     * The server validates nothing — it stored a `text/plain` file during
     * contract probing — so this gate is the only one there is, and
     * `broadcast.md` §5.2 renders only an image lightbox or a video player.
     */
    const user = userEvent.setup()
    mount()
    await screen.findByText(PUBLISHED_ROW)

    const dialog = await compose(user)
    const input = within(dialog).getByLabelText(/attachment/i)

    /*
     * ⚠️ `fireEvent`, not `user.upload`, and the reason is the whole point of
     * the test. `userEvent` honours the input's `accept` attribute and silently
     * drops a non-matching file, so the handler never runs and the test would
     * pass with the validation deleted.
     *
     * A real browser is not that strict: `accept` only filters the picker's
     * default view, a person can switch it to "All files", and drag-and-drop
     * ignores `accept` altogether. So the bypass is simulated directly — which
     * is the case the validation exists for, and the live service proved it
     * matters by storing a `text/plain` file during contract probing.
     */
    fireEvent.change(input, {
      target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] },
    })

    expect(await within(dialog).findByText(/cannot be attached/i)).toBeInTheDocument()
    expect(within(dialog).queryByText(/notes\.txt/)).not.toBeInTheDocument()
  })

  it('warns that an attachment can never be removed', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText(PUBLISHED_ROW)

    const dialog = await compose(user)

    expect(
      within(dialog).getByText(/cannot be removed afterwards/i),
    ).toBeInTheDocument()
  })
})

describe('validation', () => {
  it('requires both halves of a call to action, or neither', async () => {
    /*
     * ⚠️ The one rule in this form with no server counterpart. The service
     * stores an `actionText` with no `actionUrl` happily, and
     * `broadcast.md` §5.2 then renders a prominent button on every user's phone
     * that goes nowhere. Invisible from the panel, visible to everyone else.
     */
    const user = userEvent.setup()
    mount()
    await screen.findByText(PUBLISHED_ROW)

    const dialog = await compose(user)
    await user.type(within(dialog).getByLabelText(/button label/i), 'Learn more')
    await user.click(within(dialog).getByRole('button', { name: /save as draft/i }))

    expect(
      await within(dialog).findByText(/needs both a label and a link/i),
    ).toBeInTheDocument()
    expect(mockAnnouncements().some((row) => row.title === 'A brand new notice')).toBe(
      false,
    )
  })

  it('attributes a server rejection to the control it names', async () => {
    /*
     * The service concatenates every bad field into one message —
     * `body/title Title must be at least 3 characters` — and
     * `applyServerFieldErrors` already splits exactly that shape, which is why
     * B3 needed no new error-handling code.
     */
    server.use(
      http.post(`${API_PREFIX}/admin/announcements`, () =>
        Response.json(
          {
            error: {
              code: 'FST_ERR_VALIDATION',
              message: 'body/title Title must be at least 3 characters',
            },
          },
          { status: 400 },
        ),
      ),
    )

    const user = userEvent.setup()
    mount()
    await screen.findByText(PUBLISHED_ROW)

    const dialog = await compose(user)
    await user.click(within(dialog).getByRole('button', { name: /save as draft/i }))

    expect(
      await within(dialog).findByText(/at least 3 characters/i),
    ).toBeInTheDocument()
    /* Still open, with the operator's copy intact. */
    expect(within(dialog).getByLabelText(/headline/i)).toHaveValue('A brand new notice')
  })
})

describe('the destructive actions', () => {
  it('hides them behind a menu, leaving pin in the open', async () => {
    /*
     * Pinning is reversible in one click; archiving withdraws a message from
     * every feed and deleting destroys it and its media permanently. Neither
     * belongs one stray click from a row the operator was only trying to open.
     */
    const user = userEvent.setup()
    mount()
    await screen.findByText(PUBLISHED_ROW)

    expect(
      screen.getByRole('button', { name: `Unpin ${PUBLISHED_ROW}` }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: `More actions for ${PUBLISHED_ROW}` }),
    )

    expect(await screen.findByRole('menuitem', { name: /delete/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /archive/i })).toBeInTheDocument()
  })

  it('offers archive only for something currently live', async () => {
    /* Archiving a draft is a no-op an operator could not tell from a failure. */
    const user = userEvent.setup()
    mount()
    await screen.findByText(DRAFT_ROW)

    await user.click(
      screen.getByRole('button', { name: `More actions for ${DRAFT_ROW}` }),
    )

    expect(await screen.findByRole('menuitem', { name: /delete/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /archive/i })).not.toBeInTheDocument()
  })

  it('demands the headline typed out before deleting', async () => {
    /*
     * ⚠️ A typed confirmation, and the headline rather than the id, because the
     * mistake this guards against is acting on the wrong row — not a slip of
     * the finger. Typing what is printed on the row means the operator looked
     * at which row they are on.
     */
    const user = userEvent.setup()
    mount()
    await screen.findByText(DRAFT_ROW)

    await user.click(
      screen.getByRole('button', { name: `More actions for ${DRAFT_ROW}` }),
    )
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }))

    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: /delete permanently/i }),
    )

    /* Nothing happened: the typed confirmation is still empty. */
    expect(mockAnnouncements().some((row) => row.title === DRAFT_ROW)).toBe(true)

    await user.type(within(dialog).getByLabelText(/to confirm/i), DRAFT_ROW)
    await user.click(
      within(dialog).getByRole('button', { name: /delete permanently/i }),
    )

    await waitFor(() => {
      expect(mockAnnouncements().some((row) => row.title === DRAFT_ROW)).toBe(false)
    })
  })

  it('says that deleting a published announcement recalls nothing', async () => {
    /*
     * ⚠️ An operator deleting a live announcement to "undo" it would otherwise
     * believe they had. The notification is already on every phone.
     */
    const user = userEvent.setup()
    mount()
    await screen.findByText(PUBLISHED_ROW)

    await user.click(
      screen.getByRole('button', { name: `More actions for ${PUBLISHED_ROW}` }),
    )
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }))

    expect(
      await screen.findByText(/deleting does not recall anything/i),
    ).toBeInTheDocument()
  })

  it('archives without demanding a reason the API cannot store', async () => {
    /*
     * `reason="none"`: `PATCH` accepts no reason field and writes no audit row,
     * so demanding ten characters the client then discards would imply a record
     * that is never sent.
     */
    const user = userEvent.setup()
    mount()
    await screen.findByText(PUBLISHED_ROW)

    await user.click(
      screen.getByRole('button', { name: `More actions for ${PUBLISHED_ROW}` }),
    )
    await user.click(await screen.findByRole('menuitem', { name: /archive/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText(/^reason/i)).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /^archive$/i }))

    await waitFor(() => {
      expect(
        mockAnnouncements().find((row) => row.title === PUBLISHED_ROW)?.status,
      ).toBe('ARCHIVED')
    })
  })
})
