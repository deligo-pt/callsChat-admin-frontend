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
import { expectNoA11yViolations } from '@tests/a11y'
import { render, screen, setViewport, waitFor, within } from '@tests/render'

import { BootstrapTab } from './BootstrapTab'

/**
 * Accessibility of the bootstrap screen — phase B1.
 *
 * Run against the **poisoned** record, not a tidy one: the Android seed
 * carries a `javascript:` store URL and a non-SemVer blocked version, so the
 * danger-toned warnings and the flagged tag are on screen for the sweep. A
 * clean fixture would pass without ever rendering the states that are hardest
 * to get right.
 *
 * Colour contrast is excluded here (jsdom has no canvas) and is verified
 * against a real browser in `tests/e2e/contrast.spec.ts`.
 */

function mount(entry = '/settings/bootstrap') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/settings/bootstrap', element: <BootstrapTab /> }],
    { initialEntries: [entry] },
  )

  return render(
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
}

beforeEach(() => {
  resetMockBootstrap()
  /* `/admin/auth/me` reads the mock's own session store — see the helper. */
  signInMockAdmin('SUPER_ADMIN')
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('no axe violations', () => {
  it.each([1440, 360])('the Android record, poisoned, at %ipx', async (width) => {
    setViewport(width)
    const { container } = mount()
    await screen.findByText('Release policy')
    await expectNoA11yViolations(container)
  })

  it.each([1440, 360])('the iOS record at %ipx', async (width) => {
    setViewport(width)
    const { container } = mount('/settings/bootstrap?platform=IOS')
    await screen.findByText('Release policy')
    await expectNoA11yViolations(container)
  })

  it('the LIVE NOW state, where every dangerous switch is on', async () => {
    server.use(
      http.get('*/admin/bootstrap', () =>
        HttpResponse.json({
          success: true,
          data: {
            id: 'cfg_1',
            platform: 'ANDROID',
            configVersion: 30,
            maintenanceMode: true,
            maintenanceMessage: 'Back in 15 minutes.',
            minSupportedVersion: '1.0.0',
            latestVersion: '1.2.0',
            minBuildNumber: 1,
            latestBuildNumber: 12,
            forceUpdate: true,
            storeUrl: 'https://play.google.com/store/apps/details?id=com.callschat',
            blockedVersions: ['1.1.0'],
            forceLogout: true,
            forceLogoutBeforeVersion: '1.1.0',
            minAndroidSdk: 24,
            privacyPolicyUrl: 'https://callschat.com/privacy',
            termsUrl: 'https://callschat.com/terms',
            supportEmail: 'support@callschat.com',
            features: { chat: true, calls: false },
            createdAt: '2026-09-26T09:27:21.633Z',
            updatedAt: '2026-09-28T03:52:10.118Z',
            updatedBy: 'cmt8orkov00004upco3oifg2v',
          },
        }),
      ),
    )
    setViewport(1440)
    const { container } = mount()
    await screen.findByRole('alert')
    await expectNoA11yViolations(container)
  })
})

describe('the platform switch announces its state', () => {
  it('marks the selected platform pressed, and the other not', async () => {
    /*
     * Two buttons rather than a Radix `Tabs`, because the value has to live in
     * the URL (plan.md §4.1). `aria-pressed` is what carries the selection to
     * a screen reader in the absence of a tablist.
     */
    setViewport(1440)
    mount()
    await screen.findByText('Release policy')

    expect(screen.getByRole('button', { name: 'Android' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'iOS' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('names the group, so two bare platform names have context', async () => {
    setViewport(1440)
    mount()
    await screen.findByText('Release policy')

    expect(screen.getByRole('group', { name: 'Platform' })).toBeInTheDocument()
  })
})

describe('the preview announces its own changes', () => {
  it('is a live region, because watching it move is the point', async () => {
    setViewport(1440)
    mount()
    await screen.findByText('What a client would see')

    const live = document.querySelector('[aria-live="polite"]')
    expect(live).not.toBeNull()
    expect(live?.textContent).toContain('No update')
  })
})

describe('the open confirmation dialog', () => {
  /*
   * ⚠️ The surface a page-level sweep can never see. `ConfirmActionDialog` is
   * a portal rendered outside the render container, so it is scanned against
   * `document.body` — scanning the container would pass by finding nothing at
   * all, which is the failure mode this block exists to avoid.
   *
   * `region` is disabled for these, and only these: the body of a test that
   * mounts one page without `AdminLayout` has no `<main>` landmark, so every
   * node is "not contained by a landmark". That is an artifact of the harness,
   * and the landmark structure is covered by `tests/e2e/shell.spec.ts`.
   */
  const BODY_SCAN = { rules: { region: { enabled: false } } }

  it.each([1440, 360])('the maintenance dialog at %ipx', async (width) => {
    setViewport(width)
    mount()
    const user = userEvent.setup()

    await screen.findAllByRole('button', { name: 'Save changes' })
    await user.click(screen.getByLabelText('Maintenance mode'))

    await screen.findByRole('dialog')
    await expectNoA11yViolations(document.body, BODY_SCAN)
  })

  it('the dialog carrying a validation error, which is a different render', async () => {
    /*
     * The error state is reached by trying to confirm with an empty reason,
     * and it changes the field's `aria-invalid` and its described-by target —
     * exactly the wiring axe has something to say about.
     */
    setViewport(1440)
    mount()
    const user = userEvent.setup()

    await screen.findAllByRole('button', { name: 'Save changes' })
    await user.click(screen.getByLabelText('Global force logout'))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Sign everyone out/ }))

    await within(dialog).findByRole('alert')
    await expectNoA11yViolations(document.body, BODY_SCAN)
  })
})

describe('keyboard traversal of the three dangerous switches', () => {
  it('reaches each one, and each announces what it controls', async () => {
    /*
     * Three switches spread across three cards, each able to stop the product.
     * A keyboard operator has to reach them without a pointer, and a bare
     * "on/off" would say nothing about which one they are about to flip.
     */
    setViewport(1440)
    mount()
    await screen.findAllByRole('button', { name: 'Save changes' })

    for (const name of [
      'Maintenance mode',
      'Emergency force update',
      'Global force logout',
    ]) {
      const control = screen.getByLabelText(name)
      control.focus()
      expect(control).toHaveFocus()
      expect(control).toHaveAccessibleName(name)
    }
  })

  it('opens a dialog from the keyboard alone', async () => {
    setViewport(1440)
    mount()
    const user = userEvent.setup()

    await screen.findAllByRole('button', { name: 'Save changes' })
    screen.getByLabelText('Maintenance mode').focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('returns focus to the switch when the dialog closes', async () => {
    setViewport(1440)
    mount()
    const user = userEvent.setup()

    await screen.findAllByRole('button', { name: 'Save changes' })
    await user.click(screen.getByLabelText('Emergency force update'))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() =>
      expect(screen.getByLabelText('Emergency force update')).toHaveFocus(),
    )
  })
})
