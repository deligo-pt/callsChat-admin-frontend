import { expect, test, type Page } from '@playwright/test'

import {
  ACCOUNTS,
  expectFocusRingNotClipped,
  expectNoSidewaysScroll,
  signIn,
} from './fixtures'

/**
 * Layout of the Releases screen — added when it was reported as "too long".
 *
 * ⚠️ **None of this is visible to a content assertion.** The page rendered every
 * field correctly before the change; what was wrong was that Android and iOS sat
 * stacked inside a 46rem column, so the page ran several screens deep while a
 * third of a 1440 display stayed empty. These tests assert shape.
 */

const RELEASES = '/settings/releases'

/** Where the iOS card sits relative to the Android one. */
async function policyGeometry(page: Page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('main [data-slot="card"]'))
    const find = (heading: string) =>
      cards.find((card) =>
        card.querySelector('[data-slot="card-title"]')?.textContent?.includes(heading),
      ) ?? null

    const android = find('Android release policy')
    const ios = find('iOS release policy')
    if (!android || !ios) return null

    const a = android.getBoundingClientRect()
    const b = ios.getBoundingClientRect()
    return { aRight: a.right, aTop: a.top, bLeft: b.left, bTop: b.top, aWidth: a.width }
  })
}

test('the two platform policies sit side by side on a desktop', async ({ page }) => {
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto(RELEASES)
  await expect(page.getByText('Android release policy')).toBeVisible()

  const geometry = await policyGeometry(page)
  expect(geometry).not.toBeNull()
  if (!geometry) return

  const width = page.viewportSize()?.width ?? 0

  if (width >= 1280) {
    /* Two columns, sharing a top edge. A stacked regression fails here. */
    expect(geometry.bLeft).toBeGreaterThanOrEqual(geometry.aRight)
    expect(Math.abs(geometry.bTop - geometry.aTop)).toBeLessThan(2)
  } else {
    /* One column, iOS below Android, in source order. */
    expect(geometry.bTop).toBeGreaterThan(geometry.aTop)
  }
})

test('the page is not capped to the narrow form column', async ({ page }) => {
  /*
   * ⚠️ The defect that made the two-column layout pointless at first. Inside
   * `form-column` the section is capped at 46rem, so both cards had to share
   * 736px — about 355px each. `wide: true` on the section is what lifts it.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto(RELEASES)
  await expect(page.getByText('Android release policy')).toBeVisible()

  const width = page.viewportSize()?.width ?? 0
  test.skip(width < 1280, 'only meaningful where two columns are offered')

  const geometry = await policyGeometry(page)
  expect(geometry).not.toBeNull()
  if (!geometry) return

  /* Half of 46rem is 368px; a card wider than that proves the cap is gone. */
  expect(geometry.aWidth).toBeGreaterThan(420)
})

test('the "reaches somewhere else" notice appears once, not once per platform', async ({
  page,
}) => {
  /*
   * ⚠️ It used to render inside `VersionPolicyForm`. Stacked that was merely
   * repetitive; side by side it put the same paragraph next to itself.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto(RELEASES)
  await expect(page.getByText('Android release policy')).toBeVisible()

  await expect(
    page.getByText(/read their update policy from Mobile bootstrap/),
  ).toHaveCount(1)
})

test('nothing overflows, and a focused field keeps its whole ring', async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto(RELEASES)
  await expect(page.getByText('Android release policy')).toBeVisible()

  await expectNoSidewaysScroll(page)

  await page.locator('#ANDROID-latestVersion').focus()
  await expectFocusRingNotClipped(page, '#ANDROID-latestVersion')
})
