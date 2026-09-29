import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { resetMockBootstrap } from '@/mocks/handlers/bootstrap'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { BootstrapTab } from './BootstrapTab'

/**
 * Editing the bootstrap configuration — phase B2.
 *
 * Every assertion here is about something the **API** does that a form would
 * otherwise get wrong, not about React:
 *
 * - `features` and `blockedVersions` REPLACE, so a partial send deletes the
 *   rest (§2.4) — the defect most likely to be introduced by someone
 *   "optimising" the payload later;
 * - `platform` is optional on the wire and defaults to Android (§3.3), so a
 *   body that omits it edits the wrong record in silence;
 * - the three URL fields accept `javascript:` (§3.2), so the field is the only
 *   guard;
 * - a non-SemVer blocked version is stored and blocks nobody (§3.4).
 *
 * Two things about the fixture shape these tests. The seeded Android record
 * carries a `javascript:` store URL, so **the release card cannot save until
 * that field is fixed** — a test below asserts exactly that, and the others
 * repair it first. And every mutating test waits for the card's success
 * message before finishing: `writes` is recorded at request start, so a test
 * that stopped there could end while the mock handler was still writing, and
 * the next test's `resetMockBootstrap()` would race it.
 */

/** Every write the screen issued, with its parsed body. */
let writes: { path: string; body: Record<string, unknown> }[] = []

function renderScreen(entry = '/settings/bootstrap') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/settings/bootstrap', element: <BootstrapTab /> }],
    { initialEntries: [entry] },
  )

  render(
    <QueryClientProvider client={client}>
      {/*
       * `AuthProvider` is required: since B2 the screen asks `can()` whether
       * the operator may edit. It resolves from the mock `/admin/auth/me`,
       * which answers as a Super Admin — so `canEdit` is true and the save
       * controls render.
       */}
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
 * The card whose title matches, so a save button is unambiguous.
 *
 * Waits for the save controls to exist, not just for the card. `canEdit`
 * comes from `useAuth`, which resolves from `/admin/auth/me` **after** the
 * config query — so for one paint the cards render read-only and every
 * `getByRole('button')` below would miss.
 */
async function card(title: string): Promise<HTMLElement> {
  /*
   * Wait for the save controls FIRST, then look up the heading.
   *
   * Order matters: `canEdit` resolves from `/admin/auth/me` after the config
   * query, so the cards re-render once auth lands. A heading captured before
   * that is detached by the time it is used, and `closest()` on a detached
   * node returns null — which surfaces as "Expected container to be an
   * Element ... but got null" several lines later.
   */
  await screen.findAllByRole('button', { name: 'Save changes' })
  const heading = await screen.findByText(title)
  return heading.closest('div[data-slot="card"]') as HTMLElement
}

beforeEach(() => {
  resetMockBootstrap()
  /* `/admin/auth/me` reads the mock's own session store — see the helper. */
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
    const clone = request.clone()
    writes.push({
      path: new URL(request.url).pathname,
      body: (await clone.json().catch(() => ({}))) as Record<string, unknown>,
    })
  })
})

describe('feature flags REPLACE, so the card sends every flag (§2.4)', () => {
  it('sends all three flags when only one is toggled', async () => {
    /*
     * ⚠️ THE assertion of this phase. Sending `{"chat":false}` alone deleted
     * `calls` and `signup` on the live API — a 200, no warning, two features
     * gone. The card holds the whole map so the payload cannot be a diff.
     */
    const user = renderScreen()
    const flags = await card('Feature flags')

    await user.click(within(flags).getByLabelText('calls'))
    await user.click(within(flags).getByRole('button', { name: /save/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body['features']).toEqual({
      chat: true,
      calls: false,
      signup: true,
    })
  })

  it('keeps the other flags alive afterwards, not just in the request', async () => {
    const user = renderScreen()
    const flags = await card('Feature flags')

    await user.click(within(flags).getByLabelText('signup'))
    await user.click(within(flags).getByRole('button', { name: /save/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    /* The refetched record still has three flags, not one. */
    await waitFor(() => {
      expect(screen.getByLabelText('chat')).toBeInTheDocument()
      expect(screen.getByLabelText('calls')).toBeInTheDocument()
    })
  })

  it('says on the card that saving replaces the whole list', async () => {
    /*
     * Stated on screen, not only in a comment. An operator who assumes this
     * behaves like the partial saves around it will delete two features.
     */
    renderScreen()
    const flags = await card('Feature flags')

    expect(within(flags).getByText(/replaces the whole list/)).toBeInTheDocument()
  })

  it('refuses a flag name the app could never read', async () => {
    const user = renderScreen()
    const flags = await card('Feature flags')

    await user.type(within(flags).getByLabelText('Add a flag'), 'Video Calls!')
    await user.click(within(flags).getByRole('button', { name: 'Add' }))

    expect(within(flags).getByRole('alert')).toHaveTextContent(/letters and numbers/)
    expect(writes).toHaveLength(0)
  })

  it('adds a new flag turned off, and sends it with the rest', async () => {
    const user = renderScreen()
    const flags = await card('Feature flags')

    await user.type(within(flags).getByLabelText('Add a flag'), 'videoCalls')
    await user.click(within(flags).getByRole('button', { name: 'Add' }))
    await user.click(within(flags).getByRole('button', { name: /save/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body['features']).toEqual({
      chat: true,
      calls: true,
      signup: true,
      videoCalls: false,
    })
  })
})

describe('blocked versions replace, and must be real versions (§3.4)', () => {
  it('refuses an entry that is not a version number, before any request', async () => {
    /*
     * The server stores `"garbage"` happily. Such an entry matches no client,
     * so the operator believes a bad build is barred when it is not.
     */
    const user = renderScreen()
    const release = await card('Release policy')

    await user.type(within(release).getByLabelText('Blocked versions'), 'garbage2')
    await user.click(within(release).getByRole('button', { name: 'Add' }))

    expect(within(release).getByRole('alert')).toHaveTextContent(/not a version number/)
    expect(writes).toHaveLength(0)
  })

  it('sends the whole array, including entries it did not add', async () => {
    const user = renderScreen()
    const release = await card('Release policy')

    await user.type(within(release).getByLabelText('Blocked versions'), '1.3.0')
    await user.click(within(release).getByRole('button', { name: 'Add' }))
    await user.click(
      within(release).getByRole('button', { name: 'Save blocked versions' }),
    )

    await waitFor(() => expect(writes).toHaveLength(1))
    /* The seeded `garbage` entry survives — removing it is a separate decision. */
    expect(writes[0]!.body['blockedVersions']).toEqual(['1.1.0', 'garbage', '1.3.0'])
    /*
     * Settle before the test ends. This control has no success message — its
     * save button simply disappears once the list matches the server — so that
     * is the signal. Without it the write can land after the next test's
     * `resetMockBootstrap()`, which is how this file went order-dependent the
     * first time.
     *
     * Two details, both of which made this wait a no-op at first:
     *
     * - queried through `screen`, not `within(release)` — the card re-renders
     *   when the refetch lands, so a node captured earlier is detached and a
     *   query inside it returns null immediately;
     * - matching **both** labels, because the button reads "Saving…" while the
     *   mutation is in flight, so waiting for "Save blocked versions" to
     *   disappear succeeded the moment the save began.
     */
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Save blocked versions|Saving/ }),
      ).not.toBeInTheDocument(),
    )
  })

  it('removes an entry and sends the array without it', async () => {
    const user = renderScreen()
    const release = await card('Release policy')

    await user.click(within(release).getByRole('button', { name: 'Remove garbage' }))
    await user.click(
      within(release).getByRole('button', { name: 'Save blocked versions' }),
    )

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body['blockedVersions']).toEqual(['1.1.0'])
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Save blocked versions|Saving/ }),
      ).not.toBeInTheDocument(),
    )
  })
})

describe('the URL fields are the only guard (§3.2)', () => {
  it('refuses a javascript: store URL before any request is made', async () => {
    const user = renderScreen()
    const release = await card('Release policy')

    const input = within(release).getByLabelText('Store link')
    await user.clear(input)
    await user.type(input, 'javascript:alert(1)')
    await user.click(within(release).getByRole('button', { name: /save/i }))

    expect(
      await within(release).findByText(/Must be a full https:\/\/ web address/),
    ).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('refuses an http: URL too — clients open this link', async () => {
    const user = renderScreen()
    const legal = await card('Platform & legal')

    const input = within(legal).getByLabelText('Privacy policy')
    await user.clear(input)
    await user.type(input, 'http://callschat.com/privacy')
    await user.click(within(legal).getByRole('button', { name: /save/i }))

    expect(
      await within(legal).findByText(/Must be a full https:\/\/ web address/),
    ).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('accepts a real https URL and sends it', async () => {
    const user = renderScreen()
    const release = await card('Release policy')

    const input = within(release).getByLabelText('Store link')
    await user.clear(input)
    await user.type(
      input,
      'https://play.google.com/store/apps/details?id=com.callschat',
    )
    await user.click(within(release).getByRole('button', { name: /save/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body['storeUrl']).toBe(
      'https://play.google.com/store/apps/details?id=com.callschat',
    )
    await within(release).findByText(/Saved\./)
  })
})

describe('a stored value the panel would refuse to send', () => {
  it('blocks the release card until the poisoned store URL is fixed', async () => {
    /*
     * ⚠️ Found while writing these tests, and kept because it is the right
     * behaviour: the seeded record already holds `javascript:alert(…)` in
     * `storeUrl` — a value the live API accepted — so the card will not save
     * *anything* until that field is repaired, including an unrelated version
     * bump.
     *
     * Harsh, and correct. The field is invalid, it is in this card, and every
     * save sends it. Letting a version change through would quietly re-send
     * the poisoned URL to every mobile client.
     */
    const user = renderScreen()
    const release = await card('Release policy')

    const version = within(release).getByLabelText('Latest version')
    await user.clear(version)
    await user.type(version, '1.3.0')
    await user.click(within(release).getByRole('button', { name: /save/i }))

    expect(
      await within(release).findByText(/Must be a full https:\/\/ web address/),
    ).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })
})

describe('every write names its platform (§3.3)', () => {
  it('sends platform on a release save', async () => {
    const user = renderScreen()
    const release = await card('Release policy')

    /* The seeded store URL is poisoned, and the card refuses to save until it is fixed. */
    const storeUrl = within(release).getByLabelText('Store link')
    await user.clear(storeUrl)
    await user.type(
      storeUrl,
      'https://play.google.com/store/apps/details?id=com.callschat',
    )

    const input = within(release).getByLabelText('Latest version')
    await user.clear(input)
    await user.type(input, '1.3.0')
    await user.click(within(release).getByRole('button', { name: /save/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body['platform']).toBe('ANDROID')
    await within(release).findByText(/Saved\./)
  })

  it('sends IOS when the iOS tab is open — not the default', async () => {
    /*
     * ⚠️ A body without `platform` returns 200 and writes to ANDROID. An
     * operator editing iOS would see their change appear to do nothing, while
     * silently altering Android.
     */
    const user = renderScreen('/settings/bootstrap?platform=IOS')
    const legal = await card('Platform & legal')

    const input = within(legal).getByLabelText('Support email')
    await user.clear(input)
    await user.type(input, 'ios-support@callschat.com')
    await user.click(within(legal).getByRole('button', { name: /save/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body['platform']).toBe('IOS')
  })

  it('omits minAndroidSdk on iOS, where it means nothing (§3.9)', async () => {
    const user = renderScreen('/settings/bootstrap?platform=IOS')
    const legal = await card('Platform & legal')

    await user.clear(within(legal).getByLabelText('Terms of service'))
    await user.type(
      within(legal).getByLabelText('Terms of service'),
      'https://callschat.com/terms-ios',
    )
    await user.click(within(legal).getByRole('button', { name: /save/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect('minAndroidSdk' in writes[0]!.body).toBe(false)
  })
})

describe('validation the server does not do', () => {
  it('refuses a minimum newer than the latest release', async () => {
    /*
     * The API accepts this without comment, and it forces every client to
     * update to a version that does not exist.
     */
    const user = renderScreen()
    const release = await card('Release policy')

    const input = within(release).getByLabelText('Minimum supported version')
    await user.clear(input)
    await user.type(input, '9.9.9')
    await user.click(within(release).getByRole('button', { name: /save/i }))

    expect(
      await within(release).findByText(/cannot be newer than the latest release/),
    ).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('refuses a non-SemVer version, matching the server', async () => {
    const user = renderScreen()
    const release = await card('Release policy')

    const input = within(release).getByLabelText('Latest version')
    await user.clear(input)
    await user.type(input, 'not-a-version')
    await user.click(within(release).getByRole('button', { name: /save/i }))

    expect(
      await within(release).findByText(/Must be a version number/),
    ).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('refuses a build number below 1, matching the server', async () => {
    const user = renderScreen()
    const release = await card('Release policy')

    const input = within(release).getByLabelText('Minimum build number')
    await user.clear(input)
    await user.type(input, '0')
    await user.click(within(release).getByRole('button', { name: /save/i }))

    expect(await within(release).findByText(/1 or greater/)).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })
})

describe('the maintenance message, but not the switch', () => {
  it('saves the message', async () => {
    const user = renderScreen()
    const maintenance = await card('Maintenance')

    await user.type(within(maintenance).getByLabelText('Message'), 'Back by 09:00 UTC.')
    await user.click(within(maintenance).getByRole('button', { name: /save/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body['maintenanceMessage']).toBe('Back by 09:00 UTC.')
    await within(maintenance).findByText(/Saved/)
  })

  it('sends null for an emptied message, never an empty string', async () => {
    /*
     * The server clears on both, so this is about what the panel *means*: an
     * absent message rather than an empty one.
     */
    const user = renderScreen()
    const maintenance = await card('Maintenance')

    await user.type(within(maintenance).getByLabelText('Message'), '   ')
    await user.click(within(maintenance).getByRole('button', { name: /save/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body['maintenanceMessage']).toBeNull()
    await within(maintenance).findByText(/Saved/)
  })

  it('keeps the message save separate from the switch', async () => {
    /*
     * ⚠️ INVERTED IN B3. It asserted the switch did not exist, which was right
     * while it had no confirmation dialog behind it.
     *
     * They are different kinds of act and they save differently: editing the
     * wording is preparation and rides with the card's save; the switch blacks
     * out every client and acts on its own, through a dialog. They share a card
     * because the message is what the switch displays.
     */
    renderScreen()
    const maintenance = await card('Maintenance')

    expect(within(maintenance).getByLabelText('Maintenance mode')).toBeInTheDocument()
    expect(within(maintenance).getByLabelText('Message')).toBeInTheDocument()
    /* One save button on the card — it belongs to the message, not the switch. */
    expect(
      within(maintenance).getAllByRole('button', { name: 'Save changes' }),
    ).toHaveLength(1)
  })
})

describe('when a save fails', () => {
  it('keeps the operator’s edits', async () => {
    server.use(
      http.patch('*/admin/bootstrap', () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'Boom' } },
          { status: 500 },
        ),
      ),
    )

    const user = renderScreen()
    const release = await card('Release policy')

    const storeUrl = within(release).getByLabelText('Store link')
    await user.clear(storeUrl)
    await user.type(
      storeUrl,
      'https://play.google.com/store/apps/details?id=com.callschat',
    )

    const input = within(release).getByLabelText('Latest version')
    await user.clear(input)
    await user.type(input, '1.4.0')
    await user.click(within(release).getByRole('button', { name: /save/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(input).toHaveValue('1.4.0')
  })

  it('maps the server’s own field rejection onto the field', async () => {
    server.use(
      http.patch('*/admin/bootstrap', () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'FST_ERR_VALIDATION',
              message: 'body/supportEmail Must be a valid email address',
            },
          },
          { status: 400 },
        ),
      ),
    )

    const user = renderScreen()
    const legal = await card('Platform & legal')

    const input = within(legal).getByLabelText('Support email')
    await user.clear(input)
    await user.type(input, 'someone@example.com')
    await user.click(within(legal).getByRole('button', { name: /save/i }))

    expect(
      await within(legal).findByText('Must be a valid email address'),
    ).toBeInTheDocument()
  })
})
