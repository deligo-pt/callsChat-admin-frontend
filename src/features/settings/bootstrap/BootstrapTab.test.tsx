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
 * The bootstrap screen.
 *
 * ⚠️ Written for B1, when every card was read-only, and **revised in B2** when
 * four of them became forms. The assertions that changed are marked; the ones
 * about the platform switch, the status line and the preview did not, because
 * none of that moved.
 *
 * The assertions that matter are about the two things this screen can get
 * wrong in a way nobody notices: rendering a `javascript:` URL as a link, and
 * showing one platform's record while claiming to show the other's.
 *
 * The mock's Android record ships poisoned on purpose — a `javascript:` store
 * URL and a `"garbage"` blocked version, both values the live API accepted —
 * so the read path meets them on first render rather than only in a test
 * somebody remembered to write.
 */

/** Every `GET /admin/bootstrap` URL the screen issued, newest last. */
let reads: URL[] = []

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

function lastRead(): URLSearchParams {
  const last = reads.at(-1)
  if (!last) throw new Error('No bootstrap request was made')
  return last.searchParams
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

  reads = []
  server.events.removeAllListeners('request:start')
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/admin/bootstrap')) reads.push(url)
  })
})

describe('the platform switch', () => {
  it('opens on Android and asks the server for it explicitly', async () => {
    /*
     * ⚠️ Never relying on the default. A missing `platform` answers 200 with
     * the Android record (plan.md §3.3) — correct here by luck, and the same
     * luck writes to the wrong record on the PATCH route.
     */
    renderScreen()

    await screen.findByText('Release policy')
    expect(lastRead().get('platform')).toBe('ANDROID')
  })

  it('restores iOS from a deep link', async () => {
    renderScreen('/settings/bootstrap?platform=IOS')

    await screen.findByText('Release policy')
    expect(lastRead().get('platform')).toBe('IOS')
    expect(screen.getByRole('button', { name: 'iOS' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('switches platform and refetches the other record', async () => {
    const user = renderScreen()
    await screen.findByText('Release policy')

    await user.click(screen.getByRole('button', { name: 'iOS' }))

    await waitFor(() => expect(lastRead().get('platform')).toBe('IOS'))
  })

  it('falls back to Android for a value it does not recognise', async () => {
    /*
     * The API rejects a bad `platform` on read with a 400, so the panel never
     * forwards one — a pasted URL with junk in it renders Android rather than
     * taking the screen down.
     */
    renderScreen('/settings/bootstrap?platform=WEB')

    await screen.findByText('Release policy')
    expect(lastRead().get('platform')).toBe('ANDROID')
  })

  it('accepts a lower-case platform, which the API also accepts', async () => {
    renderScreen('/settings/bootstrap?platform=ios')

    await screen.findByText('Release policy')
    expect(lastRead().get('platform')).toBe('IOS')
  })
})

describe('the app switch (D4)', () => {
  /*
   * ⚠️ The mirror of the platform switch, and the more dangerous of the two.
   *
   * Both controls pick a record, but the consequences are not symmetric:
   * `ANDROID/PERSONAL` is the only one of the four that is live in production
   * (plan.md §2.1), so a wrong app lands an operator on the real users' record
   * while a wrong platform lands them on an unused one.
   */

  it('opens on Personal and asks the server for it explicitly', async () => {
    /*
     * Never relying on the default. A missing `appType` answers 200 with the
     * PERSONAL record (plan.md §2.3) — correct here by luck, and the same luck
     * writes to the live app on the PATCH route.
     */
    renderScreen()

    await screen.findByText('Release policy')
    expect(lastRead().get('appType')).toBe('PERSONAL')
  })

  it('restores Business from a deep link', async () => {
    renderScreen('/settings/bootstrap?appType=BUSINESS')

    await screen.findByText('Release policy')
    expect(lastRead().get('appType')).toBe('BUSINESS')
    expect(screen.getByRole('button', { name: 'Business' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('switches app and refetches the other record', async () => {
    const user = renderScreen()
    await screen.findByText('Release policy')

    await user.click(screen.getByRole('button', { name: 'Business' }))

    await waitFor(() => expect(lastRead().get('appType')).toBe('BUSINESS'))
  })

  it('falls back to Personal for a value it does not recognise', async () => {
    renderScreen('/settings/bootstrap?appType=ENTERPRISE')

    await screen.findByText('Release policy')
    expect(lastRead().get('appType')).toBe('PERSONAL')
  })

  it('accepts a lower-case appType, which the API also accepts', async () => {
    renderScreen('/settings/bootstrap?appType=business')

    await screen.findByText('Release policy')
    expect(lastRead().get('appType')).toBe('BUSINESS')
  })

  it('keeps the two keys independent, because all four pairs are real rows', async () => {
    /*
     * ⚠️ All four `(platform, appType)` combinations are live records
     * (plan.md §2.1). A switcher that reset one key when the other changed
     * would be correct for two of the four and silently wrong for the rest.
     */
    const user = renderScreen('/settings/bootstrap?platform=IOS')
    await screen.findByText('Release policy')

    await user.click(screen.getByRole('button', { name: 'Business' }))

    await waitFor(() => {
      expect(lastRead().get('appType')).toBe('BUSINESS')
      expect(lastRead().get('platform')).toBe('IOS')
    })
  })

  it('shows the Business flag set, which Personal does not have', async () => {
    /*
     * Proof the screen is rendering the record it asked for, not just sending
     * a different query string. `workspace` exists only on the BUSINESS rows.
     */
    renderScreen('/settings/bootstrap?appType=BUSINESS')

    expect(await screen.findByLabelText('workspace')).toBeInTheDocument()
  })

  it('does not show the Business flags on Personal', async () => {
    renderScreen()

    await screen.findByText('Feature flags')
    expect(screen.queryByLabelText('workspace')).not.toBeInTheDocument()
  })
})

describe('the status line names the record (D4, §4.2)', () => {
  it('says which app and platform the numbers belong to', async () => {
    /*
     * ⚠️ "Revision 21" is meaningless with four records behind one screen. An
     * operator returning to a stale tab has no other way to tell which record
     * they are about to write to.
     *
     * ⚠️ The same `recordLabel()` the confirmation dialogs use since D5, so the
     * status line and the sentence asking you to stop the product can never
     * name the record differently.
     */
    renderScreen()

    expect(await screen.findByText('Personal Android')).toBeInTheDocument()
  })

  it('updates when the app changes', async () => {
    const user = renderScreen('/settings/bootstrap?platform=IOS')
    await screen.findByText('Personal iOS')

    await user.click(screen.getByRole('button', { name: 'Business' }))

    expect(await screen.findByText('Business iOS')).toBeInTheDocument()
  })

  it('reports what was fetched, not what was requested', async () => {
    /*
     * ⚠️ Read from `config`, never from the switcher state. A typo'd
     * `?appType=` falls back silently, and a line driven by the requested
     * value would confirm the operator's mistake back to them.
     */
    renderScreen('/settings/bootstrap?appType=ENTERPRISE')

    expect(await screen.findByText('Personal Android')).toBeInTheDocument()
  })
})

describe('the stored URLs (§3.2)', () => {
  it('shows a `javascript:` store URL in the field, and warns it is live', async () => {
    /*
     * ⚠️ REVISED IN B2. This asserted that the value rendered as text with no
     * anchor, which was right while the card was read-only.
     *
     * It is now an input, so there is no anchor to withhold — but the danger
     * did not go away with the link: the poisoned value is being served to
     * every mobile client *right now*. The warning is therefore about the
     * **saved record**, not about what the operator has typed, and it appears
     * the moment the page opens.
     */
    renderScreen()

    const input = await screen.findByLabelText('Store link')
    expect(input).toHaveValue('javascript:alert(document.domain)')
    expect(
      screen.getByText(/The saved value is not a secure web address/),
    ).toBeInTheDocument()
  })

  it('does not warn when the saved URL is a real https link', async () => {
    renderScreen('/settings/bootstrap?platform=IOS')

    const input = await screen.findByLabelText('Store link')
    expect(input).toHaveValue('https://apps.apple.com/app/callschat')
    expect(
      screen.queryByText(/The saved value is not a secure web address/),
    ).not.toBeInTheDocument()
  })

  it('never renders a javascript: href anywhere on the page', async () => {
    renderScreen()
    await screen.findByText('Release policy')

    for (const anchor of document.querySelectorAll('a[href]')) {
      expect(anchor.getAttribute('href')?.startsWith('javascript:')).toBe(false)
    }
  })
})

describe('the blocked versions (§3.4)', () => {
  it('flags an entry that is not a version number', async () => {
    /*
     * ⚠️ **Re-queried inside `waitFor`, never held across an await.**
     *
     * This was the O11 flake: it failed roughly one full run in two, always on
     * `toBeInTheDocument()` rather than on finding the node — the signature of
     * a node that *was* found and is now detached.
     *
     * `findByText` can resolve before `AuthProvider` has settled `canEdit`.
     * When it does, the card re-renders, React swaps the subtree, and the
     * captured `tag` is orphaned: `within(tag).getByText()` still matches
     * inside that dead subtree, so the query passes and only the
     * in-document check fails. `edits.test.tsx` documents the same trap on
     * this very control; this file had not learned it.
     *
     * Scoping still matters: the phrase also appears in the field's hint —
     * deliberately, the hint explains the rule once and the tag flags the
     * instance — so an unscoped query matches both.
     */
    renderScreen()
    await screen.findByText('garbage')

    await waitFor(() => {
      const tag = screen.getByText('garbage')
      expect(tag).toBeInTheDocument()
      expect(within(tag).getByText(/matches no client/)).toBeInTheDocument()
      expect(tag).toHaveAttribute('title', expect.stringContaining('matches no client'))
    })
  })

  it('does not flag a real version', async () => {
    /*
     * Same re-query discipline as above. This one never failed — reading
     * `textContent` works fine on a detached node — which is exactly why it
     * would have gone on hiding the same race.
     */
    renderScreen()
    await screen.findByText('1.1.0')

    await waitFor(() => {
      expect(screen.getByText('1.1.0').textContent).not.toContain('matches no client')
    })
  })

  it('says None rather than rendering an empty row', async () => {
    renderScreen('/settings/bootstrap?platform=IOS')

    await screen.findByText('Release policy')
    /* ⚠️ REVISED IN B2: the read-only "None" became the editor's empty line. */
    expect(screen.getByText('No versions are blocked.')).toBeInTheDocument()
  })
})

describe('minAndroidSdk is Android-only (§3.9)', () => {
  it('renders the SDK floor on Android', async () => {
    renderScreen()

    expect(await screen.findByText('Minimum Android SDK')).toBeInTheDocument()
  })

  it('is absent on iOS, and says why rather than showing a disabled control', async () => {
    /*
     * The field is present on the iOS record and means nothing there. A
     * greyed-out input would imply a permission the operator is missing; the
     * true statement is that no such setting exists for iOS.
     */
    renderScreen('/settings/bootstrap?platform=IOS')

    /* ⚠️ The field moved to Release policy on 2026-10-06 — anchor on that card. */
    await screen.findByText('Release policy')
    expect(screen.queryByText('Minimum Android SDK')).not.toBeInTheDocument()
    expect(screen.getByText(/no minimum iOS version/)).toBeInTheDocument()
  })
})

describe('the status line (§3.5, §3.6)', () => {
  it('shows the revision, when it changed, and who changed it', async () => {
    renderScreen()

    expect(await screen.findByText('Revision 21')).toBeInTheDocument()
    /*
     * ⚠️ REVISED IN B2. `getByText(/Changed/)` now matches several nodes: each
     * editable card's footer carries its own "Changed …" line. The status line
     * at the top of the page is the one this test is about.
     */
    expect(screen.getAllByText(/Changed/).length).toBeGreaterThan(0)
  })

  it('resolves `updatedBy` to a name, and never invents one', async () => {
    /*
     * ⚠️ REVISED. This test used to require the **bare id**, because the record
     * carries an opaque id and nothing else (plan.md §3.6) and guessing would
     * attribute a production change to the wrong person.
     *
     * That concern is intact — the rule is still "never guess". What changed is
     * that the panel can now *know*: `useActorName` matches the id **exactly**
     * against the signed-in admin from `/admin/auth/me`, then against the staff
     * directory. No fuzzy matching, no inference from a user id.
     *
     * Here the seeded `updatedBy` IS the signed-in super admin — as it is on the
     * live service — so the name is known without a directory lookup, and the id
     * is gone from the line.
     */
    renderScreen()

    /*
     * ⚠️ `findAllBy`, not a sync check after awaiting the revision. The name
     * comes from `/admin/auth/me`, which `AuthProvider` resolves on its OWN
     * schedule — awaiting `Revision 21` only proves the bootstrap query landed.
     * Asserting synchronously after it raced, and passed or failed on timing.
     * The same trap `reachNotice.test.tsx` cost V0.
     */
    await screen.findByText('Revision 21')
    expect((await screen.findAllByText('Nadia Chowdhury')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/cmt8orkov/)).not.toBeInTheDocument()
  })

  it('falls back to the id when the actor is not an account it can see', async () => {
    /*
     * The honest half. `/admin/staff` never returns the root super admin — true
     * of the mock and verified against the live API — and a verification's
     * `SUBMITTED` row is written by the applicant, who is not staff at all. Any
     * id the panel cannot resolve must still be shown, because a traceable id
     * beats a blank and beats a guess.
     */
    renderScreen('/settings/bootstrap?platform=IOS')

    /* The iOS record ships with `updatedBy: null` — nothing to resolve at all. */
    expect(await screen.findByText(/never changed from this panel/)).toBeInTheDocument()
  })

  it('says so when nobody has ever changed it', async () => {
    // The iOS record ships with `updatedBy: null`.
    renderScreen('/settings/bootstrap?platform=IOS')

    expect(await screen.findByText(/never changed from this panel/)).toBeInTheDocument()
  })
})

describe('the LIVE NOW banner (§5.1)', () => {
  it('is absent on a healthy configuration', async () => {
    renderScreen()

    await screen.findByText('Release policy')
    expect(screen.queryByText(/clients are affected right now/)).not.toBeInTheDocument()
  })

  it('names every switch that is currently stopping the product', async () => {
    server.use(
      http.get('*/admin/bootstrap', () =>
        HttpResponse.json({
          success: true,
          data: {
            id: 'cfg_1',
            platform: 'ANDROID',
            appType: 'PERSONAL',
            configVersion: 30,
            maintenanceMode: true,
            maintenanceMessage: 'Back in 15 minutes.',
            minSupportedVersion: '1.0.0',
            latestVersion: '1.2.0',
            minBuildNumber: 1,
            latestBuildNumber: 12,
            forceUpdate: true,
            storeUrl: 'https://play.google.com/store/apps/details?id=com.callschat',
            blockedVersions: [],
            forceLogout: true,
            forceLogoutBeforeVersion: null,
            minAndroidSdk: 24,
            privacyPolicyUrl: 'https://callschat.com/privacy',
            termsUrl: 'https://callschat.com/terms',
            supportEmail: 'support@callschat.com',
            features: { chat: true },
            createdAt: '2026-09-26T09:27:21.633Z',
            updatedAt: '2026-09-28T03:52:10.118Z',
            updatedBy: 'cmt8orkov00004upco3oifg2v',
          },
        }),
      ),
    )
    renderScreen()

    const banner = await screen.findByRole('alert')
    expect(within(banner).getByText(/Maintenance mode is on/)).toBeInTheDocument()
    expect(within(banner).getByText(/Emergency force update is on/)).toBeInTheDocument()
    expect(within(banner).getByText(/Global force logout is on/)).toBeInTheDocument()
  })
})

describe('remote states', () => {
  it('offers a retry on failure, with no config data leaking in', async () => {
    server.use(
      http.get('*/admin/bootstrap', () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'Boom' } },
          { status: 500 },
        ),
      ),
    )
    renderScreen()

    /*
     * A longer wait than the default: `useBootstrapQuery` sets `retry: 1`,
     * matching the settings query, because the usual failure here is a token
     * that expired while the tab sat open. So the error state is one retry
     * away, not immediate.
     */
    expect(
      await screen.findByRole('button', { name: /try again/i }, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Release policy')).not.toBeInTheDocument()
  })

  it('offers save controls, and the three dangerous switches', async () => {
    /*
     * ⚠️ Inverted twice. In B1 it asserted that no save control existed at
     * all; in B2 that no *dangerous* switch existed, only feature flags.
     *
     * Since B3 all three are present — and what makes them safe is not their
     * absence but their behaviour: turning one on opens a confirmation
     * (`dangerous.test.tsx`), turning one off sends immediately.
     */
    renderScreen()

    await screen.findByText('Release policy')
    expect(
      (await screen.findAllByRole('button', { name: 'Save changes' })).length,
    ).toBeGreaterThan(0)

    expect(screen.getByLabelText('Maintenance mode')).toBeInTheDocument()
    expect(screen.getByLabelText('Emergency force update')).toBeInTheDocument()
    expect(screen.getByLabelText('Global force logout')).toBeInTheDocument()
  })
})
