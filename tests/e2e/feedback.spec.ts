import { expect, test } from '@playwright/test'

import { ACCOUNTS, expectNoSidewaysScroll, signIn } from './fixtures'

/**
 * The feedback queue — the checks jsdom cannot make.
 *
 * The component suite already covers filters, sorting and the empty states.
 * What only a real browser can answer is whether the page **overflows
 * sideways**, and this module has the worst content in the panel for that: a
 * seeded ticket whose description is a 420-character unbroken token, and a
 * reporter with no display name whose masked email is one unbroken run of
 * bullets in a 328px card track (§6).
 */

test.describe('feedback queue', () => {
  test('renders without sideways scroll, hostile content included', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto('/feedback')

    await expect(
      page.getByRole('heading', { name: 'Feedback', level: 1 }),
    ).toBeVisible()
    await expect(page.getByText('Audio cuts out during group call')).toBeVisible()

    /*
     * The hostile ticket's subject contains `<script>alert(1)</script>`. It is
     * rendered as text — React escapes it — and the assertion here is that it
     * is *visible as characters*, which also proves no element was injected.
     */
    await expect(
      page.getByText('Payment failed <script>alert(1)</script>'),
    ).toBeVisible()

    /* The 360px case is the one the min-content rule was written for. */
    await expectNoSidewaysScroll(page)
  })

  test('the stats strip scrolls itself rather than the page', async ({ page }) => {
    await signIn(page)
    await page.goto('/feedback')

    const strip = page.getByRole('region', { name: 'All tickets' })
    await expect(strip).toBeVisible()
    /* Six counts, and the total stated as spanning every filter (§5.1). */
    await expect(page.getByText(/across every filter/)).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('a status count filters the queue and survives a reload', async ({ page }) => {
    await signIn(page)
    await page.goto('/feedback')

    const strip = page.getByRole('region', { name: 'All tickets' })
    await strip.getByRole('button', { name: /Closed/ }).click()

    await expect(page).toHaveURL(/status=CLOSED/)
    await expect(page.getByText('Profile photo upload fails on 4G')).toBeVisible()
    await expect(page.getByText('Audio cuts out during group call')).toHaveCount(0)

    /* URL-owned state: a reload restores the view, and so would a paste. */
    await page.reload()
    await expect(page.getByText('Profile photo upload fails on 4G')).toBeVisible()
  })

  test('a mistyped date in the URL never reaches the request', async ({ page }) => {
    /*
     * ⚠️ §3.7 in a real browser. The API answers 200 to `fromDate=yesterday`
     * with the filter silently dropped, so the failure mode is an unfiltered
     * queue that looks filtered. The parameter is stripped, and the queue
     * renders rather than erroring.
     */
    const requests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/admin/feedbacks?')) requests.push(request.url())
    })

    await signIn(page)
    await page.goto('/feedback?fromDate=yesterday')

    await expect(page.getByText('Audio cuts out during group call')).toBeVisible()
    expect(requests.some((url) => url.includes('fromDate'))).toBe(false)
  })

  test('opens a ticket from the queue', async ({ page }) => {
    await signIn(page)
    await page.goto('/feedback')

    await page.getByText('Audio cuts out during group call').click()
    await expect(page).toHaveURL(/\/feedback\/fb_pending$/)
  })

  test('is refused to an Admin, by nav and by URL', async ({ page }, testInfo) => {
    await signIn(page, ACCOUNTS.admin)

    /*
     * Below `lg` the rail is a drawer, so the nav has to be opened before
     * anything in it can be asserted on — a bare `toHaveCount(0)` at 360
     * would pass because the whole navigation is hidden, not because the
     * entry is absent.
     */
    const width = testInfo.project.use.viewport?.width ?? 0
    if (width < 1024) {
      await page.getByRole('button', { name: 'Open navigation' }).click()
    }

    /* The entry is absent, not merely disabled — Users stays, Feedback goes. */
    const nav = page.getByRole('navigation', { name: 'Modules' })
    await expect(nav.getByRole('link', { name: 'Users', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Feedback', exact: true })).toHaveCount(
      0,
    )

    await page.goto('/feedback')
    await expect(page.getByText('You do not have access to this')).toBeVisible()
    /* And no ticket data leaks into the forbidden state. */
    await expect(page.getByText('Audio cuts out during group call')).toHaveCount(0)
  })
})

/**
 * The ticket — phase F2.
 *
 * Two of these are checks jsdom structurally cannot make: whether a
 * 420-character unbroken token in a bug report scrolls `main` at 360px, and
 * whether a `javascript:` attachment produces something the browser would
 * actually navigate to.
 */
test.describe('feedback ticket', () => {
  test('renders a hostile ticket without scrolling sideways', async ({ page }) => {
    await signIn(page)
    await page.goto('/feedback/fb_hostile')

    await expect(
      page.getByRole('heading', { level: 1, name: /Payment failed/ }),
    ).toBeVisible()

    /*
     * ⚠️ The §6 case this module adds: a pasted stack trace has no spaces. A
     * 420-character unbroken token sets a min-content width that `break-words`
     * cannot lower — only `overflow-wrap: anywhere` can — and at 360px that is
     * the difference between a readable report and a page that scrolls.
     */
    await expect(page.getByText(/Crash log follows/)).toBeVisible()
    await expectNoSidewaysScroll(page)
  })

  test('a javascript: attachment produces no navigable link', async ({ page }) => {
    /*
     * ⚠️ The security finding (§3.9), asserted in a real browser: not that the
     * anchor is disabled or points somewhere harmless, but that the DOM
     * contains no `href` carrying that URL at all.
     */
    await signIn(page)
    await page.goto('/feedback/fb_hostile')

    await expect(page.getByText('<img src=x onerror=alert(1)>.png')).toBeVisible()
    await expect(page.getByText(/Unsafe link — not opened/).first()).toBeVisible()

    const hrefs = await page
      .locator('a[href]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    expect(hrefs.some((href) => href.startsWith('javascript:'))).toBe(false)
    expect(hrefs.some((href) => href.startsWith('data:'))).toBe(false)
    /* The relative one would have resolved against the panel's own origin. */
    expect(hrefs).not.toContain('/admin/settings')
  })

  test('an https attachment opens in a new tab', async ({ page }) => {
    await signIn(page)
    await page.goto('/feedback/fb_pending')

    const link = page.getByRole('link', { name: /screenshot-1\.png/ })
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('fifteen history rows collapse to five behind a disclosure', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto('/feedback/fb_churned')

    const disclosure = page.getByRole('button', { name: 'Show all 15 changes' })
    await expect(disclosure).toBeVisible()
    await disclosure.click()
    await expect(page.getByRole('button', { name: 'Show fewer changes' })).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('the reporter links through to their account', async ({ page }) => {
    // The one cross-module link, and the reason Feedback lives in Community.
    await signIn(page)
    await page.goto('/feedback/fb_pending')

    await page.getByRole('link', { name: 'Jamie Okafor' }).click()
    await expect(page).toHaveURL(/\/users\/usr_sarah_reporter$/)
  })

  test('a stale ticket link lands on not-found, not a crash', async ({ page }) => {
    await signIn(page)
    await page.goto('/feedback/fb_gone')

    await expect(page.getByText('Ticket not found')).toBeVisible()
    /* The server's doubled "not found. not found" is never surfaced. */
    await expect(page.getByText(/not found\. not found/i)).toHaveCount(0)
  })
})

/**
 * Triage — phase F3.
 *
 * The component suite already drives all three controls. What is checked in a
 * real browser is the part jsdom cannot judge: that the card's three rows and
 * their menu triggers fit a 360px screen, and that the whole round trip —
 * menu, dialog, request, refetch — lands on a page that still reads correctly.
 */
test.describe('feedback triage', () => {
  test('moves a ticket through a status change and records the note', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto('/feedback/fb_pending')

    await page.getByRole('button', { name: /Move to…/ }).click()
    await page.getByRole('menuitem', { name: 'Reviewing' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    /* No validation error before anything has been typed. */
    await expect(
      dialog.getByText(/A reason of at least 10 characters is required\./),
    ).toHaveCount(0)

    await dialog.getByLabel(/reason/i).fill('Reproduced on a test device.')
    await dialog.getByRole('button', { name: /Move to Reviewing/ }).click()

    /* The note is readable afterwards — that is what makes it worth demanding. */
    await expect(page.getByText('Reproduced on a test device.')).toBeVisible()
    await expectNoSidewaysScroll(page)
  })

  test('assigns and then unassigns, and the card keeps up', async ({ page }) => {
    await signIn(page)
    await page.goto('/feedback/fb_pending')

    await page.getByRole('button', { name: 'Assign this ticket' }).click()
    await page.getByRole('option', { name: /Sarah Connor/ }).click()

    const card = page.locator('div[data-slot="card"]', { hasText: 'Triage' })
    await expect(card.getByText('Sarah Connor')).toBeVisible()

    await page.getByRole('button', { name: 'Assign this ticket' }).click()
    await page.getByRole('option', { name: /Unassign/ }).click()
    await expect(card.getByText('Unassigned')).toBeVisible()
  })

  test('the triage card fits a phone', async ({ page }) => {
    await signIn(page)
    await page.goto('/feedback/fb_churned')

    await expect(page.getByText('Triage')).toBeVisible()
    await expectNoSidewaysScroll(page)
  })
})

/**
 * The reply composer — phase F4.
 *
 * ⚠️ Written in F4 but **not executed there**: the suites were deferred to F5
 * at the user's request. Treat every assertion below as unverified until F5
 * runs the full matrix.
 */
test.describe('feedback reply', () => {
  test('sends a reply and shows it in the stream', async ({ page }) => {
    await signIn(page)
    await page.goto('/feedback/fb_pending')

    /* The consequence is stated before the button, every time. */
    await expect(page.getByText(/It cannot be edited or withdrawn\./)).toBeVisible()

    const send = page.getByRole('button', { name: 'Send reply' })
    await expect(send).toBeDisabled()

    await page.getByLabel(/Reply to Jamie Okafor/).fill('Fix shipping in 2.3.2.')
    await expect(send).toBeEnabled()
    await send.click()

    await expect(page.getByText('Fix shipping in 2.3.2.')).toBeVisible()
    await expect(page.getByText(/The reporter has not heard back/)).toHaveCount(0)
    await expectNoSidewaysScroll(page)
  })

  test('a reply replaces the out-of-band admin response (§3.3)', async ({ page }) => {
    await signIn(page)
    await page.goto('/feedback/fb_in_progress')

    await expect(page.getByText('Set outside the reply stream')).toBeVisible()

    await page.getByLabel(/Reply to Dana Mercer/).fill('Shipping in the next release.')
    await page.getByRole('button', { name: 'Send reply' }).click()

    /* The server overwrote it, so the stale note must not survive on screen. */
    await expect(page.getByText(/tracked internally as MOB-412/)).toHaveCount(0)
    await expect(page.getByText('Set outside the reply stream')).toHaveCount(0)
  })

  test('a draft blocks navigation away', async ({ page }) => {
    await signIn(page)
    await page.goto('/feedback/fb_pending')

    await page.getByLabel(/Reply to Jamie Okafor/).fill('Half-written thought')

    /* Dismiss the confirm, so the operator stays put and keeps the draft. */
    page.once('dialog', (dialog) => void dialog.dismiss())
    await page.getByRole('link', { name: 'Feedback' }).first().click()

    await expect(page).toHaveURL(/\/feedback\/fb_pending$/)
    await expect(page.getByLabel(/Reply to Jamie Okafor/)).toHaveValue(
      'Half-written thought',
    )
  })
})
