import { expect, test, type Page } from '@playwright/test'

import {
  ACCOUNTS,
  expectFocusRingNotClipped,
  expectNoSidewaysScroll,
  signIn,
} from './fixtures'

/**
 * Layout and responsiveness of the verification surfaces — phase V5.
 *
 * ⚠️ **This file exists because the first layout was wrong on a desktop.** V2
 * shipped the application page as a single `max-w-4xl` column, which left about
 * 40% of a 1440 screen empty beside cards holding two fields — and a business
 * application, which carries no documents at all, read as a broken page rather
 * than a sparse one. Nothing caught it: every test asserted on content, and
 * content was all present.
 *
 * So these assert the **shape** of the page, not its text: that the audit rail
 * sits beside the work above `xl` and below it underneath, and that nothing
 * crosses `main`'s right edge at any of the five viewports.
 */

const BUSINESS = '/verifications/cmu04s71l003701oi3wvzvbdp'
const IDENTITY = '/verifications/cmulfjl62000201r33hha40xi'

/**
 * Where the audit card sits relative to the **first** card in the work column.
 *
 * ⚠️ The first card, not the documents card. The rail aligns with the top of the
 * column, and the column opens with the applicant — comparing against Documents
 * measured the applicant card's height instead and failed on a layout that was
 * perfectly correct.
 */
async function railGeometry(page: Page) {
  return page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('main [data-slot="card"]'),
    )
    const history =
      Array.from(document.querySelectorAll('main *'))
        .filter((element) => element.textContent?.trim() === 'History')
        .pop()
        ?.closest('[data-slot="card"]') ?? null

    /* The work column's first card — whichever it is, it is not the rail. */
    const first = cards.find((card) => card !== history) ?? null

    if (!history || !first) return null

    const rail = history.getBoundingClientRect()
    const main = first.getBoundingClientRect()
    return {
      railLeft: rail.left,
      railTop: rail.top,
      mainRight: main.right,
      mainTop: main.top,
    }
  })
}

test.describe('the application page uses the width it is given', () => {
  test('puts the audit trail beside the work, or below it on a narrow screen', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto(IDENTITY)
    await expect(page.getByRole('button', { name: /^View/ })).toBeVisible()

    const geometry = await railGeometry(page)
    expect(geometry).not.toBeNull()
    if (!geometry) return

    const width = page.viewportSize()?.width ?? 0

    if (width >= 1280) {
      /*
       * Two columns: the rail starts to the RIGHT of where the documents card
       * ends, and both start at the same height. A single-column regression
       * fails on the first of these.
       */
      expect(geometry.railLeft).toBeGreaterThanOrEqual(geometry.mainRight)
      expect(Math.abs(geometry.railTop - geometry.mainTop)).toBeLessThan(2)
    } else {
      /*
       * One column, rail last — the order the single-column version had, and
       * the reason no `order-*` override is needed anywhere.
       */
      expect(geometry.railTop).toBeGreaterThan(geometry.mainTop)
    }
  })

  test('fills the available width rather than hugging a narrow column', async ({
    page,
  }) => {
    /*
     * The V2 defect, pinned. `.page-container` caps at 1600px and the shell adds
     * padding, so on a wide screen the content should occupy most of what is
     * left after the sidebar — not a 896px (`max-w-4xl`) ribbon in the middle.
     */
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto(IDENTITY)
    await expect(page.getByRole('button', { name: /^View/ })).toBeVisible()

    const ratio = await page.evaluate(() => {
      const main = document.querySelector('main')
      const card = document.querySelector('main [data-slot="card"]')
      if (!main || !card) return 0
      const available = main.getBoundingClientRect().width
      const used = card.getBoundingClientRect().left - main.getBoundingClientRect().left
      /* How much of the width is wasted as left margin before the first card. */
      return used / available
    })

    /* Centred `max-w-4xl` on a 1440 screen wasted ~14% on the left alone. */
    expect(ratio).toBeLessThan(0.08)
  })
})

test.describe('nothing overflows at any viewport', () => {
  test('the queue', async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/verifications?status=ALL')
    await expect(page.getByText('DeliGo').first()).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('a business application, whose address and ids are free text', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto(BUSINESS)
    await expect(page.getByText('lisbon portugal')).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('an identity application, including its document row', async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto(IDENTITY)
    await expect(page.getByRole('button', { name: /^View/ })).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('the rejected application, whose file name is one long unbroken string', async ({
    page,
  }) => {
    /*
     * ⚠️ `a-very-long-unbroken-filename-that-must-not-widen-the-row-nid_front.png`
     * is in the fixture precisely for this: an upload name is attacker-controlled
     * free text, and a flex item does not shrink below its min-content width
     * unless something lowers it. `wrap-anywhere` is what does, and this is the
     * test that fails if it is ever swapped back to `break-words`.
     */
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/verifications/cmulfjl62000301r33hha40xj')
    await expect(page.getByText(/No explanation was recorded/)).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('the open document viewer, which is full-bleed on a phone', async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto(IDENTITY)
    await page.getByRole('button', { name: /^View/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('the reject dialog, whose select and two textareas stack on a phone', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: /^Reject/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await expectNoSidewaysScroll(page)
  })
})

test.describe('a focused field shows its whole focus ring', () => {
  /*
   * ⚠️ Reported from a screenshot: the focus outline on the reject dialog's
   * fields was sliced off down the left and right. The dialog's scrolling body
   * clips on both axes — `overflow-y: auto` promotes `overflow-x` to `auto` —
   * and the fields sat flush against it, while `globals.css` draws the ring 4px
   * outside the element.
   *
   * ⚠️ **No content assertion can catch this.** The fix is a margin/padding pair
   * that changes no text and no layout width, so only geometry sees it.
   *
   * Asserted on the shared `ConfirmActionDialog`, so it covers every dialog in
   * the panel that carries fields, not only this one.
   */
  test('the reject dialog’s internal note', async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: /^Reject/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByLabel(/Internal note/).focus()

    await expectFocusRingNotClipped(page, '#verification-admin-notes')
  })

  test('the reject dialog’s applicant-facing reason', async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: /^Reject/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const reason = dialog.getByRole('textbox', { name: /^Reason/ })
    await reason.focus()
    const id = await reason.getAttribute('id')

    await expectFocusRingNotClipped(page, `#${String(id)}`)
  })
})
