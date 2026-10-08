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
 * The three switches that can stop the product — phase B3.
 *
 * `maintenanceMode` blacks out every mobile client, `forceUpdate` walls them
 * all behind an update screen, and `forceLogout` destroys every session. Each
 * is one boolean in the payload, live on the public endpoint on the next
 * request, and nothing in the API marks them as different from
 * `minAndroidSdk`.
 *
 * So the assertions are about the asymmetry: **on** must be hard, **off** must
 * be instant, and the dialog must describe the consequence rather than the
 * field.
 */

let writes: { body: Record<string, unknown> }[] = []

function renderScreen(entry = '/settings/bootstrap') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/settings/bootstrap', element: <BootstrapTab /> }],
    { initialEntries: [entry] },
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

/** Waits for auth, so the switches are enabled rather than disabled. */
async function ready(): Promise<void> {
  await screen.findAllByRole('button', { name: 'Save changes' })
}

/**
 * The seeded record with one switch already on, so "off" can be tested.
 *
 * `overrides` reaches `platform` and `appType` as well as the switches, which
 * is what lets the D4 block below serve a **Business** record — see the note
 * there for why asserting against Personal alone was not enough.
 */
function servingWith(overrides: Record<string, unknown>) {
  server.use(
    http.get('*/admin/bootstrap', () =>
      HttpResponse.json({
        success: true,
        data: {
          id: 'cfg_1',
          platform: 'ANDROID',
          appType: 'PERSONAL',
          configVersion: 30,
          maintenanceMode: false,
          maintenanceMessage: null,
          minSupportedVersion: '1.0.0',
          latestVersion: '1.2.0',
          minBuildNumber: 1,
          latestBuildNumber: 12,
          forceUpdate: false,
          storeUrl: 'https://play.google.com/store/apps/details?id=com.callschat',
          blockedVersions: [],
          forceLogout: false,
          forceLogoutBeforeVersion: null,
          minAndroidSdk: 24,
          privacyPolicyUrl: 'https://callschat.com/privacy',
          termsUrl: 'https://callschat.com/terms',
          supportEmail: 'support@callschat.com',
          features: { chat: true },
          createdAt: '2026-09-26T09:27:21.633Z',
          updatedAt: '2026-09-28T03:52:10.118Z',
          updatedBy: 'cmt8orkov00004upco3oifg2v',
          ...overrides,
        },
      }),
    ),
  )
}

beforeEach(() => {
  resetMockBootstrap()
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })

  writes = []
  server.events.removeAllListeners('request:start')
  /*
   * ⚠️ **Scoped to the bootstrap route**, not to "any non-GET request".
   *
   * It used to capture every write the app made, which silently included
   * `AuthProvider`'s token traffic. `expect(writes).toHaveLength(0)` then meant
   * "the app sent nothing at all", not "the screen saved nothing" — so an auth
   * POST landing inside the assertion window failed a test about a dialog.
   *
   * It survived because the race needs load to lose: it fired in the full
   * suite roughly one run in two and never once when this file ran alone,
   * which is the worst shape a flake can have. Found when D4 added three more
   * renders to this file and tipped the timing.
   */
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'GET') return
    if (!new URL(request.url).pathname.endsWith('/admin/bootstrap')) return
    const clone = request.clone()
    writes.push({
      body: (await clone.json().catch(() => ({}))) as Record<string, unknown>,
    })
  })
})

describe('turning one ON is hard', () => {
  it('opens a dialog and sends nothing until it is confirmed', async () => {
    const user = renderScreen()
    await ready()

    await user.click(screen.getByLabelText('Maintenance mode'))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    /* ⚠️ Not sent on the click. The switch is a request to confirm, not a save. */
    expect(writes).toHaveLength(0)
  })

  it('requires a reason before it will send', async () => {
    const user = renderScreen()
    await ready()

    await user.click(screen.getByLabelText('Maintenance mode'))
    const dialog = await screen.findByRole('dialog')

    await user.click(
      within(dialog).getByRole('button', { name: /Turn on maintenance/ }),
    )

    expect(writes).toHaveLength(0)
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /at least 10 characters/i,
    )
  })

  it('sends the flag once the reason is given', async () => {
    const user = renderScreen()
    await ready()

    await user.click(screen.getByLabelText('Maintenance mode'))
    const dialog = await screen.findByRole('dialog')

    await user.type(
      within(dialog).getByLabelText(/reason/i),
      'Database migration window.',
    )
    await user.click(
      within(dialog).getByRole('button', { name: /Turn on maintenance/ }),
    )

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body).toEqual({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      maintenanceMode: true,
    })
  })

  it('says the reason is stored nowhere, because it is not', async () => {
    /*
     * ⚠️ The API has no field for it and no change log (§3.6). Promising a
     * record that does not exist would be the easiest lie on this screen — the
     * same honesty the staff module needed, and the opposite of the feedback
     * module, where the transition note really is saved.
     */
    const user = renderScreen()
    await ready()

    await user.click(screen.getByLabelText('Global force logout'))
    const dialog = await screen.findByRole('dialog')

    expect(
      within(dialog).getByText(/stores no reason and keeps no history/),
    ).toBeInTheDocument()
  })

  it('describes the consequence, not the field name', async () => {
    const user = renderScreen()
    await ready()

    await user.click(screen.getByLabelText('Emergency force update'))
    const dialog = await screen.findByRole('dialog')

    expect(
      within(dialog).getByText(/blocked behind an update wall/),
    ).toBeInTheDocument()
    /* Including the part an operator would not expect. */
    expect(
      within(dialog).getByText(/already on the latest version/),
    ).toBeInTheDocument()
  })

  it('names the record being affected, not just "clients"', async () => {
    const user = renderScreen('/settings/bootstrap?platform=IOS')
    await ready()

    await user.click(screen.getByLabelText('Maintenance mode'))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(/Every Personal iOS client/)).toBeInTheDocument()
  })

  it('distinguishes Business from the live Personal record (D5)', async () => {
    /*
     * ⚠️ **The D5 defect, pinned.**
     *
     * Until D5 this sentence was built from `platform` alone and read "Every
     * iOS client will show a full-screen maintenance notice…" on **all four**
     * records. So the confirmation for blacking out Business was word-for-word
     * identical to the one for blacking out Personal — the only record of the
     * four that is live for real users (plan.md §2.1).
     *
     * The write itself was never wrong: `DangerousSwitch` has sent both keys
     * since D1. Only the sentence asking the operator to confirm it was
     * under-specified, which is the half a person actually reads before
     * stopping the product.
     *
     * Asserted on Business specifically, and asserted that the Personal
     * wording is **absent** — a label that fell back to Personal would
     * otherwise satisfy a looser check.
     */
    const user = renderScreen('/settings/bootstrap?platform=IOS&appType=BUSINESS')
    await ready()

    await user.click(screen.getByLabelText('Maintenance mode'))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(/Every Business iOS client/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/Every Personal iOS client/)).toBeNull()
  })

  it('names the record in the dialog target as well as the sentence', async () => {
    /*
     * `ConfirmActionDialog` renders `target` in its own bordered box, above
     * the effect sentence. Both are read; both must name the record, or the
     * two halves of one dialog disagree about what is about to happen.
     */
    const user = renderScreen('/settings/bootstrap?appType=BUSINESS')
    await ready()

    await user.click(screen.getByLabelText('Maintenance mode'))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText('Business Android clients')).toBeInTheDocument()
  })

  it('sends nothing when the dialog is cancelled', async () => {
    const user = renderScreen()
    await ready()

    await user.click(screen.getByLabelText('Maintenance mode'))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(writes).toHaveLength(0)
    /* And the switch is back where it was — it never represented the truth. */
    expect(screen.getByLabelText('Maintenance mode')).not.toBeChecked()
  })
})

describe('turning one OFF is instant', () => {
  it('sends immediately, with no dialog', async () => {
    /*
     * ⚠️ The asymmetry, and it is deliberate. This is the action that ends an
     * outage; every second of ceremony is a second of downtime, and the person
     * undoing the damage is often not the one who caused it.
     */
    servingWith({ maintenanceMode: true })
    const user = renderScreen()
    await ready()

    await user.click(screen.getByLabelText('Maintenance mode'))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body).toEqual({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      maintenanceMode: false,
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('needs no reason to restore service', async () => {
    servingWith({ forceLogout: true })
    const user = renderScreen()
    await ready()

    await user.click(screen.getByLabelText('Global force logout'))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body).toEqual({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      forceLogout: false,
    })
  })
})

describe('the inline write sites name the record (D4 — closes the D2 gap)', () => {
  /*
   * ⚠️ **The hole D2 left open, and why it was a hole.**
   *
   * D2 guards the five payload builders against a `BUSINESS` key, because a
   * builder asserted at `PERSONAL` passes even if it ignores its argument and
   * hard-codes the string. The three *inline* write sites — `DangerousSwitch`
   * on and off, and `SessionCard` — are asserted through the screen, and until
   * D4 the screen could only ever be `PERSONAL`. So their assertions had
   * exactly the weakness D2's own docblock warns about.
   *
   * The switcher makes Business reachable, so they are re-asserted here
   * against `IOS/BUSINESS` — a pair that shares neither value with the
   * default. A site that hard-codes either key fails.
   */

  const BUSINESS_KEY = { platform: 'IOS', appType: 'BUSINESS' } as const

  it('DangerousSwitch — turning one ON', async () => {
    servingWith({ ...BUSINESS_KEY, storeUrl: 'https://apps.apple.com/app/x' })
    const user = renderScreen('/settings/bootstrap?platform=IOS&appType=BUSINESS')
    await ready()

    await user.click(screen.getByLabelText('Maintenance mode'))
    const dialog = await screen.findByRole('dialog')
    await user.type(
      within(dialog).getByLabelText(/reason/i),
      'Scheduled upgrade window.',
    )
    await user.click(within(dialog).getByRole('button', { name: /maintenance/i }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body).toMatchObject(BUSINESS_KEY)
  })

  it('DangerousSwitch — turning one OFF', async () => {
    servingWith({ ...BUSINESS_KEY, forceLogout: true })
    const user = renderScreen('/settings/bootstrap?platform=IOS&appType=BUSINESS')
    await ready()

    await user.click(screen.getByLabelText('Global force logout'))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body).toEqual({ ...BUSINESS_KEY, forceLogout: false })
  })

  it('SessionCard — the force-logout threshold', async () => {
    servingWith(BUSINESS_KEY)
    const user = renderScreen('/settings/bootstrap?platform=IOS&appType=BUSINESS')
    await ready()

    await user.type(screen.getByLabelText('Sign out below version'), '1.2.0')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body).toEqual({
      ...BUSINESS_KEY,
      forceLogoutBeforeVersion: '1.2.0',
    })
  })
})

describe('the LIVE NOW banner reacts', () => {
  it('names each switch that is currently on', async () => {
    servingWith({ maintenanceMode: true, forceUpdate: true })
    renderScreen()

    const banner = await screen.findByRole('alert')
    expect(within(banner).getByText(/Maintenance mode is on/)).toBeInTheDocument()
    expect(within(banner).getByText(/Emergency force update is on/)).toBeInTheDocument()
    expect(
      within(banner).queryByText(/Global force logout is on/),
    ).not.toBeInTheDocument()
  })

  it('is absent when nothing is stopping the product', async () => {
    renderScreen()
    await ready()

    expect(screen.queryByText(/clients are affected right now/)).not.toBeInTheDocument()
  })
})

describe('sign out below version', () => {
  it('refuses a value that is not a version, sending nothing', async () => {
    /*
     * The server accepts any string, and a value that is not a version signs
     * nobody out — the same silent no-op as a non-SemVer blocked version.
     */
    const user = renderScreen()
    await ready()

    await user.type(screen.getByLabelText('Sign out below version'), 'yesterday')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/not a version number/)
    expect(writes).toHaveLength(0)
  })

  it('sends a real version without a dialog — choosing it is the decision', async () => {
    const user = renderScreen()
    await ready()

    await user.type(screen.getByLabelText('Sign out below version'), '1.2.0')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body).toEqual({
      platform: 'ANDROID',
      appType: 'PERSONAL',
      forceLogoutBeforeVersion: '1.2.0',
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await screen.findByText(/signed out on their next start/)
  })

  it('clears with null, meaning no threshold rather than an empty version', async () => {
    servingWith({ forceLogoutBeforeVersion: '1.1.0' })
    const user = renderScreen()
    await ready()

    await user.clear(screen.getByLabelText('Sign out below version'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body['forceLogoutBeforeVersion']).toBeNull()
  })

  it('says that turning the switch off does not sign anyone back in', async () => {
    const user = renderScreen()
    await ready()

    await user.click(screen.getByLabelText('Global force logout'))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(/does not sign anyone back in/)).toBeInTheDocument()
  })
})

describe('focus after the dialog closes', () => {
  it('returns to the switch that opened it', async () => {
    /*
     * ⚠️ The defect found in the feedback module on 2026-09-07: a dialog
     * opened from something other than a plain button can leave focus on
     * `document.body`, and a keyboard operator loses their place entirely.
     */
    const user = renderScreen()
    await ready()

    const control = screen.getByLabelText('Maintenance mode')
    await user.click(control)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByLabelText('Maintenance mode')).toHaveFocus())
  })
})

describe('without permission', () => {
  it('disables every dangerous switch', async () => {
    signInMockAdmin('MODERATOR')
    renderScreen()

    /*
     * A Moderator never reaches this route — `RequirePermission` refuses it
     * before the screen renders. Asserted here anyway, because the component
     * must not assume the route guard: it is the only thing standing between a
     * read-only viewer and a control that blacks out the product.
     */
    await screen.findByText('Release policy')
    for (const control of screen.getAllByRole('switch')) {
      expect(control).toBeDisabled()
    }
  })
})
