import { expect, test } from '@playwright/test'

import {
  expectFocusRingNotClipped,
  expectNoSidewaysScroll,
  seedHostFixtures,
  signIn,
} from './fixtures'

/**
 * Host applications and the live-host roster — phase H7, the first time any of
 * this module has run in a real browser.
 *
 * H1–H6 shipped on jsdom alone, which was the deliberate trade for speed
 * (plan.md §5 H7). What only geometry can answer:
 *
 *   - whether the **six-tile stats strip** scrolls itself or the page, at 360px
 *   - whether a **2 000-character unbroken motivation** keeps the drawer inside
 *     its own width
 *   - whether the **reason field's focus ring** survives the confirm dialog's
 *     scrolling body — the exact defect that shipped in `ConfirmActionDialog`
 *     once already, with five passing focus-ring tests
 *
 * ⚠️ **The fixtures are opt-in.** Production holds zero applications and zero
 * hosts, so `seedHostFixtures` is called explicitly and the two empty-state
 * tests below deliberately do not call it — that is the state an operator is
 * actually in today.
 */

const ALICE = 'Alice Johnson'
const NAMELESS = 'No display name'
const SUSPENDED_REASON = /Repeated copyright infringement/

test.describe('the applications queue', () => {
  test('renders the seeded queue without sideways scroll', async ({ page }) => {
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/host-applications')

    await expect(
      page.getByRole('heading', { name: 'Host applications', level: 1 }),
    ).toBeVisible()
    await expect(page.getByText(ALICE)).toBeVisible()

    /*
     * The hostile fixture has no profile at all, so every column falls back.
     * Its row is the one that breaks a narrow track if the fallbacks are not
     * truncated.
     */
    await expect(page.getByText(NAMELESS)).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('the stats strip scrolls itself rather than the page', async ({ page }) => {
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/host-applications')

    const strip = page.getByRole('region', { name: 'All host applications' })
    await expect(strip).toBeVisible()

    /* Six tiles, four of which filter and two of which navigate (§4.2). */
    await expect(strip.getByRole('button', { name: /Pending review/ })).toBeVisible()
    await expect(strip.getByRole('button', { name: /Active live hosts/ })).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('a queue tile narrows the table and the filter survives a reload', async ({
    page,
  }) => {
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/host-applications')

    const strip = page.getByRole('region', { name: 'All host applications' })
    await strip.getByRole('button', { name: /Rejected/ }).click()

    await expect(page).toHaveURL(/status=REJECTED/)
    /* `exact` — the row also shows `@rafa_sounds`, which a substring matches. */
    await expect(page.getByText('Rafa', { exact: true })).toBeVisible()
    await expect(page.getByText(ALICE)).toHaveCount(0)

    /*
     * The filter lives in the URL, so a reload — or a pasted link — restores
     * the same view. The seed flag is remembered in `sessionStorage`, so the
     * rows come back too; without that this would silently become an
     * empty-state test.
     */
    await page.reload()
    /* `exact` — the row also shows `@rafa_sounds`, which a substring matches. */
    await expect(page.getByText('Rafa', { exact: true })).toBeVisible()
    await expect(page.getByText(ALICE)).toHaveCount(0)
  })

  test('a roster tile leaves the queue instead of pretending to filter it', async ({
    page,
  }) => {
    /*
     * ⚠️ The two right-hand tiles count **hosts**, and the table beside them
     * lists **applications**. If they ever filtered in place they would answer
     * a different question from the one they ask.
     */
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/host-applications')

    await page
      .getByRole('region', { name: 'All host applications' })
      .getByRole('button', { name: /Suspended or banned/ })
      .click()

    await expect(page).toHaveURL(/\/hosts\?status=SUSPENDED/)
    await expect(page.getByRole('heading', { name: 'Live hosts' })).toBeVisible()
  })

  test('says the queue is empty, not that something failed', async ({ page }) => {
    await signIn(page)
    await page.goto('/host-applications')

    await expect(page.getByText('No applications yet')).toBeVisible()
    await expectNoSidewaysScroll(page)
  })
})

test.describe('the application drawer', () => {
  test('a 2 000-character motivation stays inside the drawer', async ({ page }) => {
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/host-applications')

    await page.getByText(NAMELESS).click()
    const drawer = page.getByRole('dialog')
    await expect(
      drawer.getByRole('heading', { name: 'Application', exact: true }),
    ).toBeVisible()

    /*
     * The assertion is on the drawer's own scroll width, not the page's: a
     * runaway paragraph inside a fixed panel overflows the panel long before
     * it reaches `main`.
     */
    const overflow = await drawer.evaluate((node) => {
      const edge = node.getBoundingClientRect().right
      return {
        scrolls: node.scrollWidth > node.clientWidth + 1,
        offenders: [...node.querySelectorAll('*')]
          .filter((el) => el.getBoundingClientRect().right > edge + 1)
          .map((el) => `${el.tagName}.${el.className.toString().slice(0, 70)}`),
      }
    })
    expect(overflow).toEqual({ scrolls: false, offenders: [] })
    await expectNoSidewaysScroll(page)
  })

  test('the intro sample is a button at rest and a player only once asked', async ({
    page,
  }) => {
    /*
     * ⚠️ The drawer used to mount the player on open, so reading an
     * application fetched that applicant's media from a stranger's host
     * whether or not anyone watched it. The resting state must carry no media
     * element and no `src`; a hidden `<video>` behind the button would satisfy
     * a test that only looked for the button.
     */
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/host-applications')

    await page.getByText(ALICE).click()
    const drawer = page.getByRole('dialog')
    await expect(
      drawer.getByRole('heading', { name: 'Application', exact: true }),
    ).toBeVisible()

    await expect(drawer.getByText('Video sample')).toBeVisible()
    expect(await drawer.locator('video, audio').count()).toBe(0)

    await drawer.getByRole('button', { name: /play video/i }).click()

    const video = drawer.locator('video')
    await expect(video).toHaveAttribute(
      'src',
      'https://cdn.callschat.com/samples/intro.mp4',
    )
  })

  test('the questionnaire answers are shown, whatever type they came back as', async ({
    page,
  }) => {
    /* O4, closed by a live record: the field is `qaResponses` (§7). */
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/host-applications')

    await page.getByText(ALICE).click()
    const drawer = page.getByRole('dialog')

    await expect(drawer.getByRole('heading', { name: 'Questionnaire' })).toBeVisible()
    await expect(drawer.getByText('Years experience')).toBeVisible()
    await expect(drawer.getByText(/Condenser mic/)).toBeVisible()
  })

  test('the drawer body, its sections and its footer share one left edge', async ({
    page,
  }) => {
    /*
     * ⚠️ The alignment defect H7 found, now a guard.
     *
     * `SheetContent` carries no padding of its own, so both the scroll body
     * and the footer were laid out against the sheet's own edge — 16px left of
     * the title above them, with the motivation running flush into the window.
     * Nothing in jsdom can see it, and nothing in the content assertions
     * changed when it was wrong.
     */
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/host-applications')

    await page.getByText(ALICE).click()
    const drawer = page.getByRole('dialog')
    await expect(
      drawer.getByRole('heading', { name: 'Application', exact: true }),
    ).toBeVisible()

    const edges = await drawer.evaluate((node) => {
      const left = (el: Element | null | undefined) =>
        el ? Math.round(el.getBoundingClientRect().left) : -1

      /*
       * ⚠️ The footer control by its text, never `querySelector('button')` —
       * the sheet's own Close button is absolutely positioned in the top right
       * and is the first button in the DOM, so it would make this assertion
       * measure a corner against a column.
       */
      const approve = [...node.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Approve',
      )

      return {
        sheet: Math.round(node.getBoundingClientRect().left),
        title: left(node.querySelector('[data-slot="sheet-title"]')),
        section: left(node.querySelector('section')),
        footer: left(approve),
      }
    })

    /* Every edge inside the sheet, and none of them ON it. */
    expect(edges.title).toBeGreaterThan(edges.sheet)
    expect(edges.section).toBe(edges.title)
    expect(edges.footer).toBe(edges.title)
  })

  test('a javascript: intro URL never becomes a source or a link', async ({ page }) => {
    /*
     * ⚠️ The intro sample is the one piece of user-submitted media this panel
     * renders (§8), and the hostile fixture submits
     * `javascript:alert(document.domain)`. jsdom proved the guard returns
     * nothing; only a browser proves nothing in the live DOM carries the
     * scheme.
     */
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/host-applications')

    await page.getByText(NAMELESS).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Intro sample')).toBeVisible()

    const unsafe = await drawer.evaluate((node) =>
      [...node.querySelectorAll('[src], [href]')]
        .map((el) => el.getAttribute('src') ?? el.getAttribute('href') ?? '')
        .filter((value) => /^\s*javascript:/i.test(value)),
    )
    expect(unsafe).toEqual([])
  })

  test('the approve dialog states the consequence and can be backed out of', async ({
    page,
  }) => {
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/host-applications')

    await page.getByText(ALICE).click()
    await page.getByRole('button', { name: 'Approve' }).click()

    const dialog = page.getByRole('dialog', { name: 'Approve this application' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/no way to un-approve/)).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()

    /* Backing out must leave the application exactly where it was. */
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
  })

  test('rejecting demands a reason the applicant can read, and its ring is not clipped', async ({
    page,
  }) => {
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/host-applications')

    await page.getByText(ALICE).click()
    await page.getByRole('button', { name: 'Reject' }).click()

    const dialog = page.getByRole('dialog', { name: 'Reject this application' })
    await expect(dialog.getByText(/write it for them, not for the log/)).toBeVisible()

    /* Nine characters clears the service's five and fails the panel's ten. */
    const reason = dialog.getByLabel(/Reason/)
    await reason.fill('too short')
    await dialog.getByRole('button', { name: 'Reject and notify' }).click()
    await expect(dialog).toBeVisible()

    /*
     * ⚠️ The focus ring sits 4px outside the field, and this dialog's body
     * scrolls — the combination already sliced the bottom off every ring here
     * once.
     */
    await reason.focus()
    await expectFocusRingNotClipped(page, 'textarea')

    await reason.fill('Audio sample is unusable; please resubmit with noise reduction.')
    await dialog.getByRole('button', { name: 'Reject and notify' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('the live-host roster', () => {
  test('renders both hosts and says why the suspended one is off', async ({ page }) => {
    /*
     * ⚠️ This is the browser-level guard for the field-name defect found on
     * 2026-10-15: the service sends `suspendedReason`, the panel read
     * `suspensionReason`, and because the mock agreed with the invention the
     * column rendered "—" while 127 unit tests passed.
     */
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/hosts')

    await expect(
      page.getByRole('heading', { name: 'Live hosts', level: 1 }),
    ).toBeVisible()
    await expect(page.getByText('Alex Rivers')).toBeVisible()
    await expect(page.getByText(SUSPENDED_REASON)).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('every row control names its own host', async ({ page }) => {
    /*
     * On this screen reaching for the wrong row ends the wrong person's
     * broadcast, so a bare "Suspend" is a defect, not a style preference.
     */
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/hosts')

    await expect(
      page.getByRole('button', { name: 'Suspend Alex Rivers' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ban Alex Rivers' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Suspend$/ })).toHaveCount(0)
  })

  test('suspending says the broadcast ends, and refuses without a reason', async ({
    page,
  }) => {
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/hosts')

    await page.getByRole('button', { name: 'Suspend Alex Rivers' }).click()
    const dialog = page.getByRole('dialog', { name: 'Suspend this host' })
    await expect(dialog).toBeVisible()

    /* Clicking with an empty reason must not send the write (§4.4). */
    await dialog.getByRole('button', { name: 'Suspend the host' }).click()
    await expect(dialog).toBeVisible()

    await dialog
      .getByLabel(/Reason/)
      .fill('Streaming copyrighted music after two written warnings.')
    await dialog.getByRole('button', { name: 'Suspend the host' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText(/after two written warnings/)).toBeVisible()
  })

  test('a banned host still needs a reason, which the guide never says', async ({
    page,
  }) => {
    /*
     * ⚠️ Measured, not documented: `PATCH /hosts/:userId/status` rejects a
     * `BANNED` write with a reason under five characters exactly as it rejects
     * `SUSPENDED`. The doc only ever mentions the suspension case.
     */
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/hosts')

    await page.getByRole('button', { name: 'Ban Alex Rivers' }).click()
    const dialog = page.getByRole('dialog', { name: 'Ban this host' })

    await dialog.getByRole('button', { name: 'Ban the host' }).click()
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('says the roster is empty rather than implying a failure', async ({ page }) => {
    await signIn(page)
    await page.goto('/hosts')

    await expect(page.getByText('No live hosts yet')).toBeVisible()
    await expectNoSidewaysScroll(page)
  })
})
