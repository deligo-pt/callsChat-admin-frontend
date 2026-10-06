import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { render, screen, setViewport, within } from '@tests/render'

import { MaintenanceTab } from './general/MaintenanceTab'

/**
 * The screen that edits a record mobile clients do not read
 * (plan.md §3.1, phase B4).
 *
 * ⚠️ This is the **first component test of any settings tab**. The settings
 * suite is contract and schema tests, so "the settings suite stays green"
 * could never have proved this notice renders — B4's acceptance criterion
 * would have been satisfied by a page that silently dropped it.
 *
 * What it guards is not cosmetic. This screen saves successfully and changes
 * nothing a phone is told, so without the notice an operator starting
 * maintenance during an incident watches nothing happen, with no way to learn
 * why.
 *
 * ⚠️ It covered **two** screens until 2026-10-06. The other was Releases,
 * which had the same split for app versions — that one was resolved by
 * deleting the section rather than annotating it, since Mobile bootstrap holds
 * a strict superset of its fields. Maintenance keeps its notice because its
 * `/admin/settings` field may still serve the web client (§8 O2).
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

    /*
     * ⚠️ The button is waited for, not queried synchronously after the notice.
     * The notice is static text and renders on the first paint; the button is
     * behind `canEdit`, which is false until `AuthProvider` has resolved
     * `GET /admin/auth/me`. Querying it right after the notice was a race that
     * the session query usually won — and began losing once the mock handler
     * list grew, which is how it was found.
     */
    await screen.findByText(/does not black out the mobile app/)
    expect(
      await screen.findByRole('button', { name: /Start maintenance/ }),
    ).toBeEnabled()
  })
})
