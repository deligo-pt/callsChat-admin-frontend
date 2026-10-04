import { expect, test } from '@playwright/test'

import {
  ACCOUNTS,
  expectFocusRingNotClipped,
  expectNoSidewaysScroll,
  signIn,
} from './fixtures'

/**
 * Layout and responsiveness of the announcements surfaces — phase B5.
 *
 * Driven against the **hostile fixture**, not a tidy record:
 * `cmutnyeq9000501mkrnqsid3q` carries a 255-character unbroken headline (the
 * server's exact maximum), a body of several thousand characters (the service
 * imposes no maximum at all), a long unbroken `actionUrl` (the service does not
 * URL-validate it), and `mediaType: VIDEO` with neither a duration nor a size.
 * Every one of those is a legal value an operator can produce.
 *
 * ⚠️ **No content assertion can catch what this file catches.** The headline
 * either wraps or widens the table past `main`'s edge, and in both cases the
 * text is present and correct — only geometry can tell them apart.
 */

const HOSTILE_HEADLINE = /^Operational-notice-concerning/
const DRAFT_ROW = 'Business tools are coming to your workspace'

test.describe('nothing overflows at any viewport', () => {
  test('the queue, with a 255-character unbroken headline on screen', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements')
    await expect(page.getByText(HOSTILE_HEADLINE)).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('the 255-character headline neither crushes nor stretches its row', async ({
    page,
  }) => {
    /*
     * ⚠️ **This test exists because the overflow check above could not see the
     * real defect, and mutation-testing proved it.** Swapping `wrap-anywhere`
     * for `break-words` — or deleting the wrapping class entirely — left
     * `expectNoSidewaysScroll` passing, because `DataTable` sits in its own
     * `overflow-x: auto` box and the helper rightly allows content to exceed
     * the page edge inside one.
     *
     * What was actually wrong was worse than a scrollbar. `wrap-anywhere` drops
     * the headline's min-content width to a single character, so the table's
     * auto layout crushed the cell to **105px wide and 420px tall** — a 21-line
     * row — while every content assertion passed, because the text was all
     * there.
     *
     * So this measures the geometry: a floor on the width, and a ceiling on the
     * height. `min-w-[11rem]` holds the first; `line-clamp-2` holds the second.
     */
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements')

    const headline = page.getByText(HOSTILE_HEADLINE)
    await expect(headline).toBeVisible()

    const box = await headline.evaluate((node) => {
      const element = node as HTMLElement
      const rect = element.getBoundingClientRect()
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight || '20')
      return { width: rect.width, lines: Math.round(rect.height / lineHeight) }
    })

    /* Crushed to 105px before the fix. */
    expect(box.width).toBeGreaterThan(140)
    /* 21 lines before the fix; clamped to 2, with 1 of slack for rounding. */
    expect(box.lines).toBeLessThanOrEqual(3)
  })

  test('the queue as a stack of cards, where the headline has least room', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements')
    await expect(page.getByText(HOSTILE_HEADLINE)).toBeVisible()

    /*
     * The stats strip scrolls horizontally by design below `md`. That is the
     * strip scrolling, not the page — `expectNoSidewaysScroll` walks for an
     * `overflow-x` ancestor and allows exactly this, which is why the
     * assertion is meaningful rather than vacuous here.
     */
    await expectNoSidewaysScroll(page)
  })

  test('the queue filtered to nothing, so the empty state is measured too', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements?status=ARCHIVED&priority=URGENT')
    await expect(page.getByText(/no announcements match this view/i)).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('the editor, loaded with the hostile record', async ({ page }) => {
    /*
     * Both worst values at once: the 255-character headline in a single-line
     * input, and the several-thousand-character body in a textarea. The dialog
     * must scroll its own body rather than grow past the viewport.
     */
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements')
    await page.getByText(HOSTILE_HEADLINE).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('the editor, composing, where the two select rows sit side by side', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements')
    await page.getByRole('button', { name: /new announcement/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('the editor in its publish confirmation, which replaces the footer', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements')
    await page.getByRole('button', { name: /new announcement/i }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/headline/i).fill('A perfectly ordinary headline')
    await dialog.getByLabel(/^body/i).fill('Ordinary body copy.')
    await dialog.getByRole('button', { name: /publish now/i }).click()
    await expect(dialog.getByText(/publish to every matching user now/i)).toBeVisible()

    /*
     * The confirm row carries a sentence plus two buttons where the footer had
     * three buttons — at 360 it has to stack rather than push the confirm
     * control off the side.
     */
    await expectNoSidewaysScroll(page)
  })

  test('the delete dialog, whose target is the 255-character headline', async ({
    page,
  }) => {
    /*
     * ⚠️ The worst case in the module. `ConfirmActionDialog` renders the target
     * verbatim in a bordered box, AND the typed-confirmation label repeats it
     * inside a `<code>` element — so the unbroken headline is rendered twice,
     * once in a context with no wrapping of its own.
     */
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements')
    await expect(page.getByText(HOSTILE_HEADLINE)).toBeVisible()

    await page
      .getByRole('button', { name: /^More actions for Operational-notice/ })
      .click()
    await page.getByRole('menuitem', { name: /delete/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('the archive dialog', async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements')
    await expect(page.getByText('Important Security Update')).toBeVisible()

    await page
      .getByRole('button', { name: 'More actions for Important Security Update' })
      .click()
    await page.getByRole('menuitem', { name: /archive/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await expectNoSidewaysScroll(page)
  })
})

test.describe('a focused field shows its whole focus ring', () => {
  /*
   * ⚠️ Reported from a screenshot during the verification work: the focus
   * outline on a dialog's fields was sliced off down the left and right. The
   * dialog's scrolling body clips on both axes — `overflow-y: auto` promotes
   * `overflow-x` to `auto` per spec — and `globals.css` draws the ring 4px
   * outside the element, so a field flush against that box loses it.
   *
   * ⚠️ **No content assertion can catch this.** The fix is a margin/padding
   * pair that changes no text and no layout width, so only geometry sees it.
   * The editor is a second dialog with its own scrolling body, so it needs its
   * own clearance and its own proof.
   */

  test('the headline input', async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements')
    await page.getByRole('button', { name: /new announcement/i }).click()

    const dialog = page.getByRole('dialog')
    const field = dialog.getByLabel(/headline/i)
    await field.focus()
    const id = await field.getAttribute('id')

    await expectFocusRingNotClipped(page, `#${String(id)}`)
  })

  test('the body textarea', async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements')
    await page.getByRole('button', { name: /new announcement/i }).click()

    const dialog = page.getByRole('dialog')
    const field = dialog.getByLabel(/^body/i)
    await field.focus()
    const id = await field.getAttribute('id')

    await expectFocusRingNotClipped(page, `#${String(id)}`)
  })

  test('the audience select, which is the widest control in the row', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements')
    await page.getByRole('button', { name: /new announcement/i }).click()

    const dialog = page.getByRole('dialog')
    await dialog.locator('#announcement-audience').focus()

    await expectFocusRingNotClipped(page, '#announcement-audience')
  })

  test('the button-link input, which sits flush against the right edge', async ({
    page,
  }) => {
    /*
     * The second column of the CTA grid — the field closest to the scrolling
     * body's right edge, and therefore the one whose ring is clipped first.
     */
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements')
    await page.getByRole('button', { name: /new announcement/i }).click()

    const dialog = page.getByRole('dialog')
    const field = dialog.getByLabel(/button link/i)
    await field.focus()
    const id = await field.getAttribute('id')

    await expectFocusRingNotClipped(page, `#${String(id)}`)
  })

  test('the delete dialog’s typed confirmation', async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/announcements')
    await expect(page.getByText(DRAFT_ROW)).toBeVisible()

    await page.getByRole('button', { name: `More actions for ${DRAFT_ROW}` }).click()
    await page.getByRole('menuitem', { name: /delete/i }).click()

    const dialog = page.getByRole('dialog')
    const field = dialog.getByLabel(/to confirm/i)
    await field.focus()
    const id = await field.getAttribute('id')

    await expectFocusRingNotClipped(page, `#${String(id)}`)
  })
})
