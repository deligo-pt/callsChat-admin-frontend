import { expect, test, type Page } from '@playwright/test'

import { signIn } from './fixtures'

/**
 * Phase 3B — the six read-only detail tabs.
 *
 * Runs against the mock backend, whose detail payload mirrors the verified
 * live shape (plan.md §10.3).
 */

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await page.goto('/users')
  await expect(page.getByText(/Showing 1–25 of 500/)).toBeVisible()
})

/** Open the first record the way an operator would — by activating it. */
async function openFirstUser(page: Page) {
  const table = page.getByRole('table')
  if (await table.isVisible()) {
    await table.locator('tbody tr').first().click()
  } else {
    /*
     * On cards the whole tile is NOT a button — nesting the copy-ID control
     * inside a button role is an a11y violation. The accessible target is the
     * trailing "View <name>" control instead.
     */
    await page
      .getByRole('button', { name: /^View / })
      .first()
      .click()
  }
  await expect(page).toHaveURL(/\/users\/usr_/)
}

test('a row in the directory opens its detail page', async ({ page }) => {
  // This is the regression: /users/:id had no route and fell through to 404.
  await openFirstUser(page)
  await expect(page.getByText('Page not found')).toHaveCount(0)
  // The record's own tabs prove the detail screen rendered, not a fallback.
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
})

test('all six tabs are present and render', async ({ page }) => {
  await page.goto('/users/usr_000001')

  for (const label of [
    'Overview',
    'Access & restrictions',
    'Sessions & devices',
    'Safety',
    'Finance',
    'Audit history',
  ]) {
    const tab = page.getByRole('tab', { name: label })
    await expect(tab).toBeVisible()
    await tab.click()
    // Each panel must render something, not an empty shell.
    await expect(page.getByRole('tabpanel')).not.toBeEmpty()
  }
})

test('status and capability restrictions stay structurally separate', async ({
  page,
}) => {
  await page.goto('/users/usr_000001')
  await page.getByRole('tab', { name: 'Access & restrictions' }).click()

  /*
   * plan.md Phase 3 "Rules enforced": an account status and a capability
   * restriction are different things and live in different panels. A gifting
   * block must never be presented as an account state.
   */
  await expect(page.getByRole('heading', { name: 'Account status' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Active capability restrictions' }),
  ).toBeVisible()
})

test('finance is read-only and never combines available with locked', async ({
  page,
}) => {
  await page.goto('/users/usr_000001')
  await page.getByRole('tab', { name: 'Finance' }).click()

  const panel = page.getByRole('tabpanel')
  await expect(panel.getByText('Available', { exact: true })).toBeVisible()
  await expect(panel.getByText('Locked', { exact: true })).toBeVisible()

  // plan.md §3.2: there is no wallet mutation anywhere in this module.
  await expect(
    panel.getByRole('button', { name: /adjust|edit|add|remove/i }),
  ).toHaveCount(0)
  await expect(panel.getByRole('textbox')).toHaveCount(0)
})

test('an unknown user id shows not-found, not a crash', async ({ page }) => {
  await page.goto('/users/usr_does_not_exist')
  await expect(page.getByText('User not found')).toBeVisible()
  await expect(page.getByText('Something went wrong')).toHaveCount(0)
})

test('the page never scrolls horizontally', async ({ page }) => {
  await page.goto('/users/usr_000001')
  await page.getByRole('tab', { name: 'Sessions & devices' }).click()

  const scrolled = await page.evaluate(() => {
    window.scrollTo(500, 0)
    const x = window.scrollX
    window.scrollTo(0, 0)
    return x
  })
  expect(scrolled).toBe(0)
})

test('no message, call or media content is exposed', async ({ page }) => {
  await page.goto('/users/usr_000001')

  /*
   * plan.md Principle #1 — the privacy red line. Activity is reported as
   * volumes only; there is no surface here that could render a conversation.
   */
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).not.toMatch(/message body|transcript|recording|listen/i)
  await expect(page.locator('audio')).toHaveCount(0)
  await expect(page.locator('video')).toHaveCount(0)
})

test('names the account once, not twice', async ({ page }) => {
  await openFirstUser(page)
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()

  const name = await page.getByRole('heading', { level: 1 }).first().textContent()
  expect(name?.trim()).toBeTruthy()

  /*
   * The PageHeader used to print the display name as an `h1` directly above
   * the record card, which shows it again — the same name twice in a row. The
   * card is the one that keeps it, because it carries the status badge and the
   * action cluster with it.
   */
  await expect(
    page.getByRole('heading', { name: name!.trim(), exact: true }),
  ).toHaveCount(1)

  // Removing the h1 must not leave the page without a top-level heading.
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

  // The breadcrumb still names the record — that is navigation, not a repeat.
  await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toContainText(
    name!.trim(),
  )
})
