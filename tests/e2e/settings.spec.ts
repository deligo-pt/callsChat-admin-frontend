import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, signIn } from './fixtures'

/**
 * Real files on disk rather than in-memory buffers: `Buffer` is a Node global
 * the app tsconfig deliberately does not expose, and a genuine 1×1 PNG also
 * exercises the `createImageBitmap` decode check the way a real upload would.
 */
const LOGO = 'tests/e2e/files/brand.png'
const NOT_AN_IMAGE = 'tests/e2e/files/notes.txt'

/**
 * Move between settings sections the way an operator does — through the
 * sidebar sub-menu, not a tab row.
 *
 * Below `lg` the sidebar is an off-canvas drawer, so the hamburger has to be
 * opened first. Handled here rather than skipping those viewports: the
 * unsaved-changes guard is exactly as important on a phone, and the drawer is
 * the only way to reach another section there.
 */
async function gotoSection(page: Page, label: string): Promise<void> {
  const nav = await openNav(page)
  const link = nav.getByRole('link', { name: label, exact: true })

  // The parent is a toggle, so a closed group has to be opened first.
  if (!(await link.isVisible())) {
    await nav.getByRole('button', { name: 'System Settings' }).click()
    await expect(link).toBeVisible()
  }

  await link.click()
}

/** The module navigation, opening the mobile drawer first if that is where it lives. */
async function openNav(page: Page) {
  /*
   * Wait for the shell before deciding. Branching on whether the nav is
   * already visible races the app's first paint: at desktop it can read false
   * for a moment and send the helper looking for a hamburger that only exists
   * below `lg`. The top bar renders in both modes, so it is the stable anchor.
   */
  await expect(page.getByRole('banner')).toBeVisible()

  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()

  const nav = page.getByRole('navigation', { name: 'Modules' })
  await expect(nav).toBeVisible()
  return nav
}

/**
 * System Settings — Phase S1 (shell, General, Branding).
 *
 * Most of these assert the **outgoing request body**, not the response. Four
 * of the eight traps in system_settings_plan.md §3 are request-shape bugs: the
 * server answers 200 to a payload that clears the wrong field or omits one it
 * then wipes. A response assertion cannot see any of them.
 */

test.describe('settings shell', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await page.goto('/settings')
    /*
     * Wait for the index redirect to land. Below `lg` the shell closes the
     * navigation drawer whenever the path changes, so opening the drawer while
     * `/settings -> /settings/general` is still in flight makes it slide shut
     * under the click.
     */
    await expect(page).toHaveURL(/\/settings\/general$/)
  })

  test('redirects to General and lists the built sections in the sidebar', async ({
    page,
  }) => {
    await expect(page).toHaveURL(/\/settings\/general$/)

    const nav = await openNav(page)
    for (const name of [
      'General',
      'Branding',
      'Maintenance',
      'Chat & media',
      'Platform',
      'Releases',
      'Database',
    ]) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
    }

    /*
     * An entry that navigates to nothing looks like a broken product rather
     * than an unfinished one. Unbuilt sections stay out of the sidebar until
     * their phase ships — each phase flips its own `shipped` flag.
     */
    await expect(
      nav.getByRole('link', { name: 'SMS gateway', exact: true }),
    ).toHaveCount(0)
  })

  test('each section is its own URL, so it can be linked and bookmarked', async ({
    page,
  }) => {
    await gotoSection(page, 'Branding')
    await expect(page).toHaveURL(/\/settings\/branding$/)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Brand logo' })).toBeVisible()
  })

  test('the breadcrumb names the open section', async ({ page }) => {
    // With no tab row, this is the only on-page cue for which section is open.
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(crumbs).toContainText('System settings')
    await expect(crumbs).toContainText('General')
  })

  test('names the environment being edited, once', async ({ page }) => {
    /*
     * This page can take the product down, so the environment must be on
     * screen — but exactly once. The top bar carries it for every page; a
     * second copy in the page header read as a rendering fault.
     */
    await expect(page.getByRole('banner')).toContainText(
      /development|staging|production|local/i,
    )
    await expect(page.getByRole('main')).not.toContainText(
      /development|staging|production|local/i,
    )
  })

  test('the page never scrolls horizontally', async ({ page }) => {
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  })
})

test.describe('general settings', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await page.goto('/settings/general')
    await expect(page.getByLabel('App name')).toHaveValue('CallsChat')
  })

  test('save is disabled until something actually changes', async ({ page }) => {
    const save = page.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeDisabled()

    await page.getByLabel('App name').fill('CallsChat Pro')
    await expect(save).toBeEnabled()
  })

  test('states the bounds up front rather than on rejection', async ({ page }) => {
    await expect(page.getByText('2–60 characters.')).toBeVisible()
    await expect(page.getByText(/International format/)).toBeVisible()
  })

  test('clears an optional field with "", the sentinel /general honours', async ({
    page,
  }) => {
    const save = page.getByRole('button', { name: 'Save changes' })

    /*
     * Wait for the RESPONSE, not the toast or the button state. The toast
     * fires before the record is re-seeded, and the button is disabled both
     * while saving and when clean — neither is a settle signal.
     */
    const firstSave = page.waitForResponse(
      (r) =>
        r.url().includes('/admin/settings/general') && r.request().method() === 'PATCH',
    )
    await page.getByLabel('Support phone').fill('+12025550199')
    await save.click()
    await firstSave
    await expect(save).toBeDisabled()
    /*
     * Confirmed inside the card, not by a toast. A bottom-right toast covers
     * this very button at 1024px and blocks the next click — found by the
     * full-viewport run, and the reason the confirmation moved here.
     */
    await expect(page.getByText(/Saved\. Clients pick this up/)).toBeVisible()

    const request = page.waitForRequest(
      (r) => r.url().includes('/admin/settings/general') && r.method() === 'PATCH',
    )
    await page.getByLabel('Support phone').fill('')
    await expect(save).toBeEnabled()
    await save.click()

    const body = (await request).postDataJSON() as Record<string, unknown>
    /*
     * `""`, not `null`. `/general` accepts both for this field, but `null` is
     * refused for `supportEmail` on the same endpoint — so `""` is the one
     * sentinel correct for the whole route. `/platform` is the exact inverse.
     */
    expect(body['supportPhone']).toBe('')
    expect(body['supportPhone']).not.toBeNull()
  })

  test('never sends null on this endpoint', async ({ page }) => {
    const request = page.waitForRequest(
      (r) => r.url().includes('/admin/settings/general') && r.method() === 'PATCH',
    )
    await page.getByLabel('App name').fill('CallsChat Pro')
    await page.getByRole('button', { name: 'Save changes' }).click()

    const body = (await request).postDataJSON() as Record<string, unknown>
    expect(Object.values(body)).not.toContain(null)
  })

  test('rejects a bad phone client-side, with no request made', async ({ page }) => {
    let requested = false
    page.on('request', (r) => {
      if (r.url().includes('/admin/settings/general') && r.method() === 'PATCH') {
        requested = true
      }
    })

    await page.getByLabel('Support phone').fill('12345')
    await page.getByRole('button', { name: 'Save changes' }).click()

    // The server would have stored this happily — the guard is entirely ours.
    await expect(page.getByText(/Use international format/)).toBeVisible()
    expect(requested).toBe(false)
  })

  test('keeps what is typed while a save is still in flight', async ({ page }) => {
    /*
     * The form re-seeds from the server's record on success. Without
     * `keepDirtyValues`, that reset lands on top of anything typed in the
     * meantime and the operator's keystrokes vanish with no indication why.
     * Found by instrumenting a flaky run of the test above, not by design.
     */
    const save = page.getByRole('button', { name: 'Save changes' })
    const response = page.waitForResponse(
      (r) =>
        r.url().includes('/admin/settings/general') && r.request().method() === 'PATCH',
    )

    await page.getByLabel('App name').fill('First edit')
    await save.click()
    // Type again before the save comes back.
    await page.getByLabel('Support phone').fill('+12025550199')
    await response

    await expect(page.getByLabel('Support phone')).toHaveValue('+12025550199')
    await expect(page.getByLabel('App name')).toHaveValue('First edit')
    await expect(save).toBeEnabled()
  })

  test('discard restores the values the server last returned', async ({ page }) => {
    await page.getByLabel('App name').fill('Something else')
    await page.getByRole('button', { name: 'Discard' }).click()

    await expect(page.getByLabel('App name')).toHaveValue('CallsChat')
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  test('warns before leaving with unsaved changes, and staying keeps them', async ({
    page,
  }) => {
    await page.getByLabel('App name').fill('Unsaved edit')

    /*
     * The specific handler is registered FIRST so it takes the navigation
     * confirm; the catch-all behind it absorbs anything else — notably the
     * `beforeunload` prompt that fires at teardown while the form is still
     * dirty. An unhandled dialog wedges the page, and the failure then
     * surfaces far from its cause as an empty URL or a closed context.
     */
    let announce: (text: string) => void = () => {}
    const firstPrompt = new Promise<string>((resolve) => {
      announce = resolve
    })
    page.on('dialog', (dialog) => {
      announce(dialog.message())
      void dialog.dismiss()
    })

    await gotoSection(page, 'Branding')

    /*
     * Await the prompt rather than asserting straight after the click: the URL
     * check would pass trivially before the blocker had even run.
     */
    expect(await firstPrompt).toMatch(/unsaved changes/i)

    // Dismissed means stay put, and the edit survives.
    await expect(page).toHaveURL(/\/settings\/general$/)
    await expect(page.getByLabel('App name')).toHaveValue('Unsaved edit')

    // Leave the form clean so teardown never meets an armed beforeunload.
    await page.getByRole('button', { name: 'Discard' }).click()
  })

  test('leaves when the operator confirms', async ({ page }) => {
    /*
     * One handler, not two: every listener runs for the same dialog, so a
     * second one calling `dismiss` after the first called `accept` throws
     * "already handled". Only the navigation confirm is accepted — any later
     * dialog (the `beforeunload` at teardown) is dismissed.
     */
    let seen = 0
    page.on('dialog', (dialog) => {
      seen += 1
      void (seen === 1 ? dialog.accept() : dialog.dismiss())
    })

    await page.getByLabel('App name').fill('Unsaved edit')
    await gotoSection(page, 'Branding')

    await expect(page).toHaveURL(/\/settings\/branding$/)
  })

  test('does not warn when nothing was changed', async ({ page }) => {
    let prompted = false
    page.on('dialog', (dialog) => {
      prompted = true
      void dialog.dismiss()
    })

    await gotoSection(page, 'Branding')

    // Navigating away is proof enough that nothing blocked it.
    await expect(page).toHaveURL(/\/settings\/branding$/)
    expect(prompted).toBe(false)
  })
})

test.describe('branding', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await page.goto('/settings/branding')
  })

  test('says up front that a logo cannot be removed', async ({ page }) => {
    // The API has no delete and no JSON writer — an operator must know before.
    await expect(page.getByText(/cannot be removed once uploaded/i)).toBeVisible()
  })

  test('refuses a non-image before any request leaves the browser', async ({
    page,
  }) => {
    let requested = false
    page.on('request', (r) => {
      if (r.url().includes('/admin/settings/logo')) requested = true
    })

    await page.getByLabel('Choose a logo file').setInputFiles(NOT_AN_IMAGE)

    await expect(page.getByText(/file type is not supported/i)).toBeVisible()
    expect(requested).toBe(false)
  })

  test('previews before committing — choosing is not uploading', async ({ page }) => {
    let requested = false
    page.on('request', (r) => {
      if (r.url().includes('/admin/settings/logo')) requested = true
    })

    await page.getByLabel('Choose a logo file').setInputFiles(LOGO)

    await expect(page.getByText('brand.png')).toBeVisible()
    await expect(page.getByText(/not uploaded yet/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Upload logo' })).toBeVisible()
    expect(requested).toBe(false)
  })

  test('cancel discards the selection without uploading', async ({ page }) => {
    await page.getByLabel('Choose a logo file').setInputFiles(LOGO)
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('button', { name: 'Upload logo' })).toHaveCount(0)
    await expect(page.getByText(/not uploaded yet/)).toHaveCount(0)
  })

  test('uploads as multipart under the documented field name', async ({ page }) => {
    await page.getByLabel('Choose a logo file').setInputFiles(LOGO)

    const request = page.waitForRequest(
      (r) => r.url().includes('/admin/settings/logo') && r.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Upload logo' }).click()

    const sent = await request
    const contentType = sent.headers()['content-type'] ?? ''
    /*
     * The boundary is the point: setting Content-Type by hand produces a
     * header without one and the server rejects the upload outright.
     */
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/)
    /*
     * The body itself is not readable here — the request is served by the MSW
     * service worker, so Playwright sees the outer request without its binary
     * payload. The `file` field name and the bytes are asserted in
     * `src/api/client.test.ts` instead, where the handler can read the form.
     */

    await expect(page.getByText(/Logo updated\./)).toBeVisible()
  })
})

test.describe('settings access', () => {
  test('a Moderator cannot reach the page at all', async ({ page }) => {
    await signIn(page, ACCOUNTS.moderator)
    await page.goto('/settings/general')

    await expect(page.getByText(/do not have access/i)).toBeVisible()
  })

  test('an Admin can edit — the live routes accept ADMIN', async ({ page }) => {
    /*
     * Deliberately diverges from doc/RBAC §52. All six settings-write routes
     * are guarded with `verifyAdmin` (system_settings_plan.md §4.3 / §8 O1);
     * disabling the form here would misreport what the API allows.
     */
    await signIn(page, ACCOUNTS.admin)
    await page.goto('/settings/general')

    await expect(page.getByLabel('App name')).toBeEnabled()
    await page.getByLabel('App name').fill('Admin edit')
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  test('an Admin is not shown the Super Admin sections', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await page.goto('/settings/general')

    const nav = await openNav(page)
    for (const name of ['Database', 'SMS gateway']) {
      await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(0)
    }
  })

  test('System Settings appears in the sidebar for those who can see it', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop-1440',
      'The sidebar is a drawer below lg; covered by shell.spec.ts.',
    )

    await signIn(page)
    await expect(
      page.getByRole('navigation').getByRole('button', { name: 'System Settings' }),
    ).toBeVisible()
  })
})

/**
 * Maintenance mode — the one control here that can take the product down.
 *
 * `PATCH /admin/settings/general` with `maintenanceMode`. The outgoing body is
 * what these assert: the server answers 200 either way, so a switch that never
 * sent the flag would look exactly like one that worked.
 */
test.describe('maintenance mode', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await page.goto('/settings/maintenance')
    await expect(page.getByRole('heading', { name: 'Maintenance mode' })).toBeVisible()
  })

  test('starts off, and says what turning it on does', async ({ page }) => {
    await expect(page.getByText('Off', { exact: true })).toBeVisible()
    await expect(page.getByText('The product is running normally.')).toBeVisible()
  })

  test('cannot be started without typing the word', async ({ page }) => {
    await page.getByRole('button', { name: 'Start maintenance' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/Every user is cut off immediately/)).toBeVisible()
    // The recoverability promise has to be on screen before, not after.
    await expect(dialog.getByText(/admin panel stays reachable/)).toBeVisible()

    const confirm = dialog.getByRole('button', { name: 'Start maintenance' })
    await expect(confirm).toBeDisabled()

    await dialog.getByLabel(/Type MAINTENANCE to confirm/).fill('maintenanc')
    await expect(confirm).toBeDisabled()

    await dialog.getByLabel(/Type MAINTENANCE to confirm/).fill('MAINTENANCE')
    await expect(confirm).toBeEnabled()
  })

  test('cancelling the dialog changes nothing', async ({ page }) => {
    let requested = false
    page.on('request', (r) => {
      if (r.url().includes('/admin/settings/general') && r.method() === 'PATCH') {
        requested = true
      }
    })

    await page.getByRole('button', { name: 'Start maintenance' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(requested).toBe(false)
    await expect(page.getByText('The product is running normally.')).toBeVisible()
  })

  test('sends maintenanceMode as a boolean and raises the global banner', async ({
    page,
  }) => {
    await page
      .getByLabel('Message shown to users')
      .fill('Upgrading the calling service. Back within the hour.')

    await page.getByRole('button', { name: 'Start maintenance' }).click()
    const dialog = page.getByRole('dialog')
    // The operator sees the exact text users will get, before committing.
    await expect(dialog.getByText(/Upgrading the calling service/)).toBeVisible()
    await dialog.getByLabel(/Type MAINTENANCE to confirm/).fill('MAINTENANCE')

    const request = page.waitForRequest(
      (r) => r.url().includes('/admin/settings/general') && r.method() === 'PATCH',
    )
    await dialog.getByRole('button', { name: 'Start maintenance' }).click()

    const body = (await request).postDataJSON() as Record<string, unknown>
    // `true`, not `"true"` — the schema rejects a string with a 400.
    expect(body['maintenanceMode']).toBe(true)
    expect(body['maintenanceMessage']).toBe(
      'Upgrading the calling service. Back within the hour.',
    )

    await expect(
      page.getByRole('status').filter({ hasText: /maintenance mode/i }),
    ).toBeVisible()
  })

  test('the banner follows the operator to every other screen', async ({ page }) => {
    await startMaintenance(page)

    // The switch lives on one tab; its effect is global, so the notice must be.
    await page.goto('/users')
    await expect(
      page.getByRole('status').filter({ hasText: /users are blocked/i }),
    ).toBeVisible()

    await page.goto('/settings/general')
    await expect(
      page.getByRole('status').filter({ hasText: /users are blocked/i }),
    ).toBeVisible()
  })

  test('ending maintenance takes one click and clears the banner', async ({ page }) => {
    await startMaintenance(page)

    const request = page.waitForRequest(
      (r) => r.url().includes('/admin/settings/general') && r.method() === 'PATCH',
    )
    // No dialog, no typed word: restoring service is never gated.
    await page.getByRole('button', { name: 'End maintenance' }).first().click()

    expect((await request).postDataJSON()).toMatchObject({ maintenanceMode: false })
    await expect(page.getByText('The product is running normally.')).toBeVisible()
    await expect(
      page.getByRole('status').filter({ hasText: /users are blocked/i }),
    ).toHaveCount(0)
  })

  test('says plainly that the window schedules nothing', async ({ page }) => {
    // A field that looks like a schedule but is not gets trusted exactly once.
    await expect(page.getByText(/does not switch anything on or off/i)).toBeVisible()
  })

  test('a Moderator cannot reach it', async ({ page, context }) => {
    await context.clearCookies()
    await page.goto('/login')
    await signIn(page, ACCOUNTS.moderator)
    await page.goto('/settings/maintenance')

    await expect(page.getByText(/do not have access/i)).toBeVisible()
  })
})

/** Turn maintenance on from the maintenance tab and wait for it to land. */
async function startMaintenance(page: Page): Promise<void> {
  const response = page.waitForResponse(
    (r) =>
      r.url().includes('/admin/settings/general') && r.request().method() === 'PATCH',
  )
  await page.getByRole('button', { name: 'Start maintenance' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/Type MAINTENANCE to confirm/).fill('MAINTENANCE')
  await dialog.getByRole('button', { name: 'Start maintenance' }).click()
  await response
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

/**
 * The settings sub-menu in the sidebar.
 *
 * These replace the tab-rail tests: the sections moved out of the page and
 * into the main navigation, so the guarantees they carried have to move too.
 */
test.describe('settings sub-menu', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile-360' || testInfo.project.name === 'tablet-768',
      'The sidebar is an off-canvas drawer below lg; the drawer is covered by shell.spec.ts.',
    )
    await signIn(page)
  })

  const nav = (page: Page) => page.getByRole('navigation', { name: 'Modules' })

  test('opens itself when a section is on screen', async ({ page }) => {
    await page.goto('/settings/maintenance')

    // Leaving the group shut would hide the very page being looked at.
    await expect(
      nav(page).getByRole('link', { name: 'Maintenance', exact: true }),
    ).toBeVisible()
    await expect(
      nav(page).getByRole('button', { name: 'System Settings' }),
    ).toBeVisible()
  })

  test('stays shut elsewhere until asked for', async ({ page }) => {
    await page.goto('/users')

    await expect(
      nav(page).getByRole('link', { name: 'Maintenance', exact: true }),
    ).toHaveCount(0)

    await nav(page).getByRole('button', { name: 'System Settings' }).click()
    await expect(
      nav(page).getByRole('link', { name: 'Maintenance', exact: true }),
    ).toBeVisible()
    // Expanding is not navigating.
    await expect(page).toHaveURL(/\/users$/)
  })

  test('can be collapsed even while its section is open', async ({ page }) => {
    /*
     * The regression this guards: deriving "open" from the route alone makes
     * an active group impossible to close — the chevron appears to do nothing.
     */
    await page.goto('/settings/general')
    await nav(page).getByRole('button', { name: 'System Settings' }).click()

    await expect(
      nav(page).getByRole('link', { name: 'Branding', exact: true }),
    ).toHaveCount(0)
    await expect(page).toHaveURL(/\/settings\/general$/)
  })

  test('marks the open section', async ({ page }) => {
    await page.goto('/settings/branding')

    await expect(
      nav(page).getByRole('link', { name: 'Branding', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
  })

  test('the parent toggles and never navigates', async ({ page }) => {
    await page.goto('/users')
    const parent = nav(page).getByRole('button', { name: 'System Settings' })

    await parent.click()
    await expect(parent).toHaveAttribute('aria-expanded', 'true')
    await expect(
      nav(page).getByRole('link', { name: 'General', exact: true }),
    ).toBeVisible()

    await parent.click()
    await expect(parent).toHaveAttribute('aria-expanded', 'false')
    await expect(
      nav(page).getByRole('link', { name: 'General', exact: true }),
    ).toHaveCount(0)

    // Opening and closing a group is not navigation.
    await expect(page).toHaveURL(/\/users$/)
  })
})

/**
 * Chat & media — `PATCH /admin/settings/chat`.
 *
 * The file-type list REPLACES the stored one and the server does not dedupe,
 * so what the chips hold is exactly what gets written.
 */
test.describe('chat and media', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await page.goto('/settings/chat')
    await expect(page.getByLabel('Maximum file size')).toHaveValue('25')
  })

  test('states the size bounds up front', async ({ page }) => {
    await expect(page.getByText(/1–100 MB/)).toBeVisible()
  })

  test('normalises an extension, and shows that before adding it', async ({ page }) => {
    const field = page.getByLabel('Add a file extension')
    await field.fill('.PDF')

    // No need to discover that `.PDF` and `pdf` are the same entry by trying both.
    await expect(page.getByText(/Will be added as/)).toContainText('pdf')
  })

  test('refuses a duplicate inline — the server would have stored it twice', async ({
    page,
  }) => {
    await page.getByLabel('Add a file extension').fill('.JPG')
    await page.getByRole('button', { name: 'Add' }).click()

    await expect(page.getByText('jpg is already allowed.')).toBeVisible()
  })

  test('adds a new type and sends the normalised, deduplicated list', async ({
    page,
  }) => {
    await page.getByLabel('Add a file extension').fill('.HEIC')
    await page.getByRole('button', { name: 'Add' }).click()

    const request = page.waitForRequest(
      (r) => r.url().includes('/admin/settings/chat') && r.method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save changes' }).click()

    const body = (await request).postDataJSON() as { allowedFileTypes: string[] }
    expect(body.allowedFileTypes).toContain('heic')
    expect(body.allowedFileTypes).not.toContain('.HEIC')
    expect(new Set(body.allowedFileTypes).size).toBe(body.allowedFileTypes.length)
  })

  test('rejects a size outside the bounds without a round trip', async ({ page }) => {
    let requested = false
    page.on('request', (r) => {
      if (r.url().includes('/admin/settings/chat') && r.method() === 'PATCH') {
        requested = true
      }
    })

    await page.getByLabel('Maximum file size').fill('500')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText(/Choose between 1 and 100 MB/)).toBeVisible()
    expect(requested).toBe(false)
  })

  test('will not let the last file type be removed', async ({ page }) => {
    // Clearing the list disables every attachment on every client.
    const chips = page.getByRole('button', { name: /^Remove / })
    let count = await chips.count()
    while (count > 1) {
      await chips.first().click()
      count = await chips.count()
    }

    await chips.first().click()
    await expect(
      page.getByText('At least one file extension must be allowed.'),
    ).toBeVisible()
    await expect(chips).toHaveCount(1)
  })
})

/**
 * Platform & localization — `PATCH /admin/settings/platform`.
 *
 * The inverse of `/general`: a cleared field goes out as `null`, because `""`
 * is rejected here as an invalid URL.
 */
test.describe('platform and localization', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await page.goto('/settings/platform')
    await expect(page.getByLabel('Add a language code')).toBeVisible()
  })

  test('offers only supported languages as the default', async ({ page }) => {
    /*
     * The server's cross-field rejection carries no field name at all, so the
     * cheapest fix is to make it unreachable: the default is chosen from the
     * supported list rather than typed.
     */
    await page.getByLabel('Default language').click()
    const options = page.getByRole('option')

    await expect(options).toHaveCount(4)
    for (const code of ['en', 'bn', 'pt', 'de']) {
      await expect(options.filter({ hasText: code }).first()).toBeVisible()
    }
  })

  test('refuses to remove the language that is currently default', async ({ page }) => {
    await page.getByRole('button', { name: 'Remove en' }).click()

    await expect(page.getByText(/en is the default language/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove en' })).toBeVisible()
  })

  test('clears a store URL with null, not an empty string', async ({ page }) => {
    await page.getByLabel('Google Play listing').fill('https://example.com/x')

    const firstSave = page.waitForResponse(
      (r) =>
        r.url().includes('/admin/settings/platform') &&
        r.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save changes' }).click()
    await firstSave

    const request = page.waitForRequest(
      (r) => r.url().includes('/admin/settings/platform') && r.method() === 'PATCH',
    )
    await page.getByLabel('Google Play listing').fill('')
    await page.getByRole('button', { name: 'Save changes' }).click()

    const body = (await request).postDataJSON() as Record<string, unknown>
    // `""` is a 400 on this endpoint — the exact inverse of /general.
    expect(body['playStoreUrl']).toBeNull()
    expect(body['playStoreUrl']).not.toBe('')
  })

  test('rejects a malformed store URL client-side', async ({ page }) => {
    let requested = false
    page.on('request', (r) => {
      if (r.url().includes('/admin/settings/platform') && r.method() === 'PATCH') {
        requested = true
      }
    })

    await page.getByLabel('App Store listing').fill('callschat.com')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText(/Enter a full URL/)).toBeVisible()
    expect(requested).toBe(false)
  })

  test('labels the payment flags as a placeholder', async ({ page }) => {
    // Unlabelled switches beside real settings would read as a live billing control.
    await expect(page.getByText(/not wired to a payment processor/i)).toBeVisible()
    await expect(
      page.getByText(/charges nobody and enables nothing today/i),
    ).toBeVisible()
  })

  test('adds a language and sends it lowercased', async ({ page }) => {
    await page.getByLabel('Add a language code').fill('ES')
    await page.getByRole('button', { name: 'Add' }).click()

    const request = page.waitForRequest(
      (r) => r.url().includes('/admin/settings/platform') && r.method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save changes' }).click()

    const body = (await request).postDataJSON() as { supportedLanguages: string[] }
    expect(body.supportedLanguages).toContain('es')
  })
})

/**
 * Database backups — Super Admin only.
 *
 * The feature is broken on production (`spawn pg_dump ENOENT`), so most of
 * what these assert is that the UI reports that honestly instead of dressing a
 * `202` up as success.
 */
test.describe('database backups', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await page.goto('/settings/database')
    await expect(page.getByRole('heading', { name: 'Manual backup' })).toBeVisible()
  })

  test('starts empty and says where the result will appear', async ({ page }) => {
    await expect(page.getByText('No backups yet')).toBeVisible()
    await expect(page.getByText(/Watch the table below for the result/)).toBeVisible()
  })

  test('reports a started job, never a finished one', async ({ page }) => {
    await page.getByRole('button', { name: 'Start backup' }).click()

    // A 202 means the job was accepted. It is not success and must not read as it.
    await expect(page.getByText(/Backup started/)).toBeVisible()
    await expect(page.getByText(/complete|succeeded/i)).toHaveCount(0)
    await expect(page.getByText('Running', { exact: true }).first()).toBeVisible()
  })

  test('polls a running job through to failure and shows the worker error', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Start backup' }).click()

    // No reload: the list has to reach the outcome on its own.
    await expect(page.getByText('Failed', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    })

    await page
      .getByText(/callschat_db_backup/)
      .first()
      .click()
    /*
     * Verbatim. This is the string an operator forwards to a backend engineer;
     * paraphrasing it into "something went wrong" throws away its only value.
     */
    await expect(
      page.getByText('Failed to spawn pg_dump: spawn pg_dump ENOENT'),
    ).toBeVisible()
  })

  test('offers no download for a job that did not succeed', async ({ page }) => {
    await page.getByRole('button', { name: 'Start backup' }).click()
    await expect(page.getByText('Failed', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    })

    // The endpoint answers 400 for anything but SUCCESS — do not offer the click.
    await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(0)
  })

  test('offers a download once a job succeeds', async ({ page }) => {
    await page.evaluate(() =>
      (
        window as unknown as { __mockBackupOutcome: { set: (v: string) => void } }
      ).__mockBackupOutcome.set('succeed'),
    )
    await page.getByRole('button', { name: 'Start backup' }).click()

    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible()
    await expect(page.getByText(/expire after 5 minutes/)).toBeVisible()
  })

  test('shows the 10-minute cooldown as a notice, not a failure', async ({ page }) => {
    await page.getByRole('button', { name: 'Start backup' }).click()
    await expect(page.getByText(/Backup started/)).toBeVisible()

    await page.getByRole('button', { name: 'Start backup' }).click()

    /*
     * The cooldown answers 400, not 429, so it arrives as an ordinary
     * validation error. The operator did nothing wrong — it must not read red.
     */
    const notice = page.getByText(/wait 10 minutes between manual backup requests/i)
    await expect(notice).toBeVisible()
    await expect(page.getByText(/could not be started/)).toHaveCount(0)
  })

  test('the card list fits the viewport on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-360', 'Card layout only below lg.')

    await page.getByRole('button', { name: 'Start backup' }).click()
    await expect(page.getByText('Failed', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    })

    /*
     * `main` scrolls vertically, so a too-wide card gives it a sideways scroll
     * without the document ever reporting one — the page-level check misses it.
     */
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main')
      return {
        scrollWidth: main?.scrollWidth ?? 0,
        clientWidth: main?.clientWidth ?? 0,
      }
    })
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  })
})

test('database backups are Super Admin only', async ({ page }) => {
  await signIn(page, ACCOUNTS.admin)
  await page.goto('/settings/database')

  await expect(page.getByText(/do not have access/i)).toBeVisible()
})
