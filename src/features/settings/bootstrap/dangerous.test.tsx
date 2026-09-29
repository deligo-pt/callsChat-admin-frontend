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

/** The seeded record with one switch already on, so "off" can be tested. */
function servingWith(overrides: Record<string, unknown>) {
  server.use(
    http.get('*/admin/bootstrap', () =>
      HttpResponse.json({
        success: true,
        data: {
          id: 'cfg_1',
          platform: 'ANDROID',
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
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'GET') return
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
    expect(writes[0]!.body).toEqual({ platform: 'ANDROID', maintenanceMode: true })
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

  it('names the platform being affected, not just "clients"', async () => {
    const user = renderScreen('/settings/bootstrap?platform=IOS')
    await ready()

    await user.click(screen.getByLabelText('Maintenance mode'))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(/Every iOS client/)).toBeInTheDocument()
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
    expect(writes[0]!.body).toEqual({ platform: 'ANDROID', maintenanceMode: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('needs no reason to restore service', async () => {
    servingWith({ forceLogout: true })
    const user = renderScreen()
    await ready()

    await user.click(screen.getByLabelText('Global force logout'))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.body).toEqual({ platform: 'ANDROID', forceLogout: false })
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
