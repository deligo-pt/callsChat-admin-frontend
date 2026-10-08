import { expect, test } from '@playwright/test'

import { ACCOUNTS, expectNoSidewaysScroll, signIn } from './fixtures'

/**
 * Bootstrap configuration — the checks jsdom cannot make.
 *
 * The component suite already covers the platform switch, the flagged tag and
 * the preview. What only a real browser can answer is whether the page
 * overflows sideways with a long store URL in a 328px track, and whether a
 * `javascript:` value produces anything the browser would actually navigate
 * to.
 *
 * ⚠️ Written for B1, when the screen was read-only, and revised in B2 when
 * four cards became forms and the section joined the sidebar. Nothing here
 * writes: the assertions are about what is rendered and what is reachable.
 */

test.describe('bootstrap configuration', () => {
  test('renders the poisoned Android record without scrolling sideways', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto('/settings/bootstrap')

    await expect(page.getByText('Release policy')).toBeVisible()

    /*
     * ⚠️ REVISED IN B2. The seeded store URL is
     * `javascript:alert(document.domain)` — a value the live API accepted and
     * served publicly. It was rendered as text in B1; it is now the value of
     * an input, with a warning that the **saved** record is dangerous right
     * now, not merely that the field is invalid.
     */
    await expect(page.getByLabel('Store link')).toHaveValue(
      'javascript:alert(document.domain)',
    )
    await expect(
      page.getByText(/The saved value is not a secure web address/),
    ).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('produces no navigable javascript: link anywhere on the page', async ({
    page,
  }) => {
    /*
     * ⚠️ The security assertion, in a real browser: not that the link is
     * disabled or points somewhere harmless, but that the DOM contains no
     * `href` carrying that value at all.
     */
    await signIn(page)
    await page.goto('/settings/bootstrap')
    await expect(page.getByText('Release policy')).toBeVisible()

    const hrefs = await page
      .locator('a[href]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))

    expect(hrefs.some((href) => href.startsWith('javascript:'))).toBe(false)
    expect(hrefs.some((href) => href.startsWith('data:'))).toBe(false)
  })

  test('the platform switch round-trips through the URL and a reload', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto('/settings/bootstrap')

    await page.getByRole('button', { name: 'iOS' }).click()
    await expect(page).toHaveURL(/platform=IOS/)
    /* The iOS record carries the App Store link, not the Play Store one. */
    await expect(page.getByLabel('Store link')).toHaveValue(
      'https://apps.apple.com/app/callschat',
    )

    await page.reload()
    await expect(page.getByRole('button', { name: 'iOS' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expectNoSidewaysScroll(page)
  })

  test('the app switch round-trips through the URL and a reload', async ({ page }) => {
    /*
     * The mirror of the platform test above, and the more consequential of the
     * two: `ANDROID/PERSONAL` is the only one of the four records that is live
     * in production (plan.md §2.1), so a switcher that silently fell back to it
     * would put an operator on real users' config while they believed they were
     * editing Business.
     *
     * Asserted on the **store link**, not on the pressed state alone — the
     * button could highlight while the screen still showed the old record.
     */
    await signIn(page)
    await page.goto('/settings/bootstrap')

    await page.getByRole('button', { name: 'Business' }).click()
    await expect(page).toHaveURL(/appType=BUSINESS/)
    await expect(page.getByLabel('Store link')).toHaveValue(
      'https://play.google.com/store/apps/details?id=com.codextechit.callchat.business',
    )

    await page.reload()
    await expect(page.getByRole('button', { name: 'Business' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expectNoSidewaysScroll(page)
  })

  test('the two keys are independent, because all four pairs are real rows', async ({
    page,
  }) => {
    /*
     * ⚠️ All four `(platform, appType)` combinations are live records. A
     * switcher that reset one key when the other moved would be correct for two
     * of the four and silently wrong for the rest — and the operator would have
     * no way to tell, because both controls would look right.
     */
    await signIn(page)
    await page.goto('/settings/bootstrap?platform=IOS')

    await page.getByRole('button', { name: 'Business' }).click()
    await expect(page).toHaveURL(/platform=IOS/)
    await expect(page).toHaveURL(/appType=BUSINESS/)
    await expect(page.getByLabel('Store link')).toHaveValue(
      'https://apps.apple.com/app/callschat-business',
    )
  })

  test('the status line names the record the numbers belong to', async ({ page }) => {
    /*
     * "Revision 21" means nothing with four records behind one screen. This is
     * read from the fetched record rather than the switcher, so a URL the panel
     * did not recognise reports where it actually landed instead of confirming
     * the operator's typo back to them.
     */
    await signIn(page)
    await page.goto('/settings/bootstrap?appType=ENTERPRISE')

    await expect(page.getByText('Personal Android')).toBeVisible()
  })

  test('is offered in the sidebar now that it can be edited', async ({
    page,
  }, testInfo) => {
    /*
     * ⚠️ INVERTED IN B2. It asserted the entry was ABSENT, which was right
     * while the screen was read-only: an entry leading to a page an operator
     * expects to edit, and cannot, reads as broken rather than unfinished.
     *
     * Four cards now save, so the section is `shipped: true` and the sidebar
     * offers it.
     */
    await signIn(page)
    await page.goto('/settings/general')

    const width = testInfo.project.use.viewport?.width ?? 0
    if (width < 1024) {
      await page.getByRole('button', { name: 'Open navigation' }).click()
    }

    const nav = page.getByRole('navigation', { name: 'Modules' })
    await expect(nav.getByRole('link', { name: 'Mobile bootstrap' })).toBeVisible()
    await nav.getByRole('link', { name: 'Mobile bootstrap' }).click()
    await expect(page).toHaveURL(/\/settings\/bootstrap/)
  })

  test('is refused to a Moderator, who cannot see settings at all', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.moderator)
    await page.goto('/settings/bootstrap')

    await expect(page.getByText(/do not have access/i)).toBeVisible()
    await expect(page.getByText('Release policy')).toHaveCount(0)
  })
})
