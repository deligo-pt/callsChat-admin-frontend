import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { render, screen, setViewport, within } from '@tests/render'

import { MaintenanceTab } from './general/MaintenanceTab'
import { ReleasesTab } from './releases/ReleasesTab'

/**
 * The two screens that edit a record mobile clients do not read
 * (plan.md §3.1, phase B4).
 *
 * ⚠️ This is the **first component test of any settings tab**. The settings
 * suite is contract and schema tests, so "the settings suite stays green"
 * could never have proved these notices render — B4's acceptance criterion
 * would have been satisfied by a page that silently dropped them.
 *
 * What it guards is not cosmetic. Both of these screens save successfully and
 * change nothing a phone is told, so without the notice an operator setting a
 * force update during an incident watches nothing happen, with no way to learn
 * why.
 */

function mount(element: React.ReactElement, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path, element },
      { path: '/settings/bootstrap', element: <div>bootstrap screen</div> },
    ],
    { initialEntries: [path] },
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
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('Settings › Releases', () => {
  it('says mobile clients read their update policy somewhere else', async () => {
    mount(<ReleasesTab />, '/settings/releases')

    const notices = await screen.findAllByText(
      /read their update policy from Mobile bootstrap/,
    )
    /* One per platform policy — Android and iOS each carry their own form. */
    expect(notices.length).toBeGreaterThan(0)
  })

  it('links across, rather than naming a screen and leaving them to find it', async () => {
    mount(<ReleasesTab />, '/settings/releases')

    const links = await screen.findAllByRole('link', { name: 'Open Mobile bootstrap' })
    expect(links[0]).toHaveAttribute('href', '/settings/bootstrap')
  })

  it('keeps the editor working — the notice explains, it does not disable', async () => {
    /*
     * Neither older editor is deleted or locked. Nothing proves the
     * `/admin/settings` fields are dead — they may serve the web client (§8
     * O2) — so the panel states what each reaches rather than guessing.
     */
    mount(<ReleasesTab />, '/settings/releases')

    /* Two platform forms, so two of each field — the first is Android's. */
    const inputs = await screen.findAllByLabelText(/Latest version/)
    expect(inputs[0]).toBeEnabled()
    expect(
      (await screen.findAllByRole('button', { name: /save/i })).length,
    ).toBeGreaterThan(0)
  })
})

describe('Settings › Maintenance', () => {
  it('says this switch does not black out the mobile app', async () => {
    mount(<MaintenanceTab />, '/settings/maintenance')

    expect(
      await screen.findByText(/does not black out the mobile app/),
    ).toBeInTheDocument()
  })

  it('names the switch that does, and links to it', async () => {
    mount(<MaintenanceTab />, '/settings/maintenance')

    const notice = (
      await screen.findByText(/does not black out the mobile app/)
    ).closest('p') as HTMLElement

    expect(
      within(notice).getByRole('link', { name: 'Open Mobile bootstrap' }),
    ).toHaveAttribute('href', '/settings/bootstrap')
  })

  it('keeps its own control working', async () => {
    /*
     * A button, not a switch — this tab asks for confirmation before starting
     * an outage and offers a one-click exit from one, which is the same
     * asymmetry `DangerousSwitch` applies in the bootstrap module.
     */
    mount(<MaintenanceTab />, '/settings/maintenance')

    await screen.findByText(/does not black out the mobile app/)
    expect(screen.getByRole('button', { name: /Start maintenance/ })).toBeEnabled()
  })
})

describe('the two notices say different things', () => {
  it('does not reuse one sentence for both, because they stop different things', async () => {
    /*
     * A generic "this may not reach mobile" on both would be true and useless.
     * The version notice is about what a phone is *told on launch*; the
     * maintenance one is about whether the app is *blocked at all*.
     */
    const releases = mount(<ReleasesTab />, '/settings/releases')
    const releasesText = releases.container.textContent ?? ''
    releases.unmount()

    const maintenance = mount(<MaintenanceTab />, '/settings/maintenance')
    await screen.findByText(/does not black out the mobile app/)
    const maintenanceText = maintenance.container.textContent ?? ''

    expect(releasesText).not.toContain('does not black out the mobile app')
    expect(maintenanceText).not.toContain(
      'read their update policy from Mobile bootstrap',
    )
  })
})
