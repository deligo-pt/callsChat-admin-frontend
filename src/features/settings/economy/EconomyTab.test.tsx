import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { SETTINGS_SECTIONS } from '@/app/settingsSections'
import { AuthProvider } from '@/auth/AuthProvider'
import { setSession } from '@/auth/tokenStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInMockAdmin } from '@/mocks/handlers/auth'
import { server } from '@/mocks/server'
import { render, screen, setViewport, waitFor } from '@tests/render'

import { EconomyTab } from './EconomyTab'

/**
 * Diamond economy rules — phase W7.
 *
 * ⚠️ **The route answers `200` for an empty body** (plan.md O8), so the
 * server cannot tell this tab whether a save changed anything. Every guard
 * here exists because of that: dirty state is computed client-side, and the
 * Save control is the only thing between an operator and a meaningless write.
 */

/** Every `PATCH /admin/settings/economy` body the tab sent. */
let sent: Array<Record<string, unknown>> = []

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/settings/economy', element: <EconomyTab /> }],
    { initialEntries: ['/settings/economy'] },
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
 * The field, once it is actually editable.
 *
 * ⚠️ **Every control on a settings tab is disabled until `AuthProvider`
 * resolves `GET /admin/auth/me`** — `canEdit` is false before that, and the
 * whole fieldset is disabled. Reaching for a field as soon as it renders gets
 * `clear() is only supported on editable elements`, and a *negative*
 * assertion made at that moment is worse: "the save button is disabled" is
 * true for an operator who may not edit AND for one who simply has not been
 * authorised yet. Waiting for `toBeEnabled` is the only signal on this screen
 * that tells those apart.
 */
async function editableField(label: RegExp) {
  const field = await screen.findByLabelText(label)
  await waitFor(() => expect(field).toBeEnabled())
  return field
}

beforeEach(() => {
  signInMockAdmin('SUPER_ADMIN')
  setViewport(1440)
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })

  sent = []
  server.events.removeAllListeners('request:start')
  server.events.on('request:start', async ({ request }) => {
    if (
      request.method === 'PATCH' &&
      new URL(request.url).pathname.endsWith('/admin/settings/economy')
    ) {
      sent.push((await request.clone().json()) as Record<string, unknown>)
    }
  })
})

describe('the two fields that exist', () => {
  it('seeds both fields from the settings record', async () => {
    /*
     * ⚠️ Asserts that the fields carry the record's numbers, not which
     * numbers: the settings mock persists across tests, so pinning values
     * here would make this pass or fail on test order.
     */
    mount()
    const bonus = await editableField(/Signup bonus/)
    const limit = screen.getByLabelText(/Minimum creator transfer/)

    expect((bonus as HTMLInputElement).value).toMatch(/^\d+$/)
    expect((limit as HTMLInputElement).value).toMatch(/^\d+$/)
  })

  it('says where the revenue split actually lives', async () => {
    /*
     * ⚠️ The guide documents `defaultHostRevenueSharePercent` as the third
     * economy parameter and it is **not in the record** — all 25 keys were
     * read on 2026-10-27. An operator who read the guide will come looking
     * for it, so the absence is explained rather than left as a gap.
     */
    mount()
    expect(
      await screen.findByText(/revenue split is set per host, not globally/i),
    ).toBeInTheDocument()
  })

  it('offers no field for the revenue split', async () => {
    mount()
    await screen.findByLabelText(/Signup bonus/)
    expect(screen.queryByLabelText(/revenue/i)).toBeNull()
  })
})

describe('saving', () => {
  it('sends both fields, including the unchanged one', async () => {
    /*
     * ⚠️ `PATCH` is partial, so a diff would be smaller — but there is no
     * concurrency token on this record and no way to re-read it first, so the
     * complete picture is the safest thing the client can state.
     */
    const user = mount()
    const bonus = await editableField(/Signup bonus/)

    await user.clear(bonus)
    await user.type(bonus, '50')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ newUserDiamondBonus: 50 })
    /* The untouched field is sent too, whatever the record currently holds. */
    expect(Object.keys(sent[0]!).sort()).toEqual([
      'minCreatorTransferLimit',
      'newUserDiamondBonus',
    ])
  })

  it('cannot be saved when nothing changed', async () => {
    /*
     * ⚠️ **The guard O8 exists for.** The server answers `200` to an empty
     * body and to a no-op write alike, so if the Save control were always
     * enabled an operator could "save" repeatedly, see success every time,
     * and never learn that nothing happened.
     */
    const user = mount()
    await editableField(/Signup bonus/)

    const save = screen.getByRole('button', { name: /save/i })
    expect(save).toBeDisabled()

    await user.click(save)
    expect(sent).toHaveLength(0)
  })

  it('refuses a negative value in the server’s own wording', async () => {
    const user = mount()
    const bonus = await editableField(/Signup bonus/)

    await user.clear(bonus)
    await user.type(bonus, '-1')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText(/cannot be negative/i)).toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })

  it('catches a slipped digit before it reaches every new registration', async () => {
    /*
     * ⚠️ No upper bound is enforced server-side, and the bonus is granted
     * automatically to **every** new account. 50 becoming 500000 is a
     * plausible typo and an expensive one.
     */
    const user = mount()
    const bonus = await editableField(/Signup bonus/)

    await user.clear(bonus)
    await user.type(bonus, '500000')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText(/slipped digit/i)).toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })

  it('refuses a fractional value, because diamonds are whole units', async () => {
    const user = mount()
    const limit = await editableField(/Minimum creator transfer/)

    await user.clear(limit)
    await user.type(limit, '2.5')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText(/whole number of diamonds/i)).toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })

  it('discards back to the saved record', async () => {
    const user = mount()
    const bonus = await editableField(/Signup bonus/)

    /*
     * ⚠️ Captured rather than hardcoded. The settings mock persists its record
     * to a file across tests, so an earlier save in this suite changes what
     * "the saved value" is — a test asserting `'0'` then passes or fails on
     * test order rather than on whether discard works.
     */
    const saved = (bonus as HTMLInputElement).value

    await user.clear(bonus)
    await user.type(bonus, '25')
    expect(bonus).toHaveValue('25')

    await user.click(screen.getByRole('button', { name: /discard/i }))

    await waitFor(() => expect(bonus).toHaveValue(saved))
    expect(sent).toHaveLength(0)
  })
})

describe('the one-way bridge is stated', () => {
  it('says a creator transfer cannot be reversed', async () => {
    /*
     * ⚠️ The dual-balance rule in one sentence: earnings convert into
     * spending diamonds and never back, so promotional diamonds cannot be
     * laundered into a cash-out. An operator setting the floor should know
     * which direction it governs.
     */
    mount()
    expect(
      await screen.findByText(/one-way and cannot be reversed/i),
    ).toBeInTheDocument()
  })
})

describe('the section is registered', () => {
  it('appears in the settings sub-menu, between Platform and Mobile bootstrap', () => {
    const values = SETTINGS_SECTIONS.map((section) => section.value)
    expect(values).toContain('economy')
    expect(values.indexOf('economy')).toBeGreaterThan(values.indexOf('platform'))
    expect(values.indexOf('economy')).toBeLessThan(values.indexOf('bootstrap'))
  })

  it('ships as built, because it saves on arrival', () => {
    /*
     * ⚠️ The registry's own rule: an entry that navigates to a read-only page
     * looks like a broken product rather than an unfinished one. These two
     * fields save from the first commit, so there is no read-only stage.
     */
    const section = SETTINGS_SECTIONS.find((s) => s.value === 'economy')
    expect(section?.shipped).toBe(true)
    expect(section?.to).toBe('/settings/economy')
  })
})
