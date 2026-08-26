import { expect, test } from '@playwright/test'

import { ACCOUNTS, signIn } from './fixtures'

/**
 * Phase 3A acceptance criteria (plan.md Phase 3 → sub-phases).
 *
 * Runs across all five responsive projects — 360 / 768 / 1024 / 1440 / 1920.
 * Every data operation asserted here is server-driven: the mock backend does
 * real filtering, sorting and pagination, so these exercise the same code path
 * the live API will.
 */

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await page.goto('/users')
})

test('renders the directory with server-driven pagination', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible()

  // 500 seeded users at 25 per page.
  await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible()
  await expect(page.getByText(/Showing 1–25 of 500/)).toBeVisible()
})

test('swaps between table and cards at lg from one column definition', async ({
  page,
}, testInfo) => {
  const width = testInfo.project.use.viewport?.width ?? 0
  const table = page.getByRole('table')

  if (width >= 1024) {
    await expect(table).toBeVisible()
    // `exact` matters: a loose match also hits the "User ID" header.
    await expect(
      table.getByRole('columnheader', { name: 'User', exact: true }),
    ).toBeVisible()
  } else {
    await expect(table).toHaveCount(0)
    // The same rows are still present, rendered as cards.
    await expect(page.getByText(/Showing 1–25 of 500/)).toBeVisible()
  }
})

test('the page never scrolls horizontally', async ({ page }) => {
  // plan.md §6.3: a wide table scrolls inside its own container, never the body.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
})

test('filters are applied server-side and survive a reload', async ({ page }) => {
  // Wait for the first page to settle; clicking mid-load is a flake, not a test.
  await expect(page.getByText(/Showing 1–25 of 500/)).toBeVisible()

  // Below lg the controls live in a bottom sheet (plan.md §6.2).
  const filterButton = page.getByRole('button', { name: /^Filters/ })
  if (await filterButton.isVisible()) {
    await filterButton.click()
    // Assert the sheet actually opened, so a failure points at the sheet
    // rather than at a mysteriously missing Status control inside it.
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible()
  }

  await page.getByLabel('Status').click()
  await page.getByRole('option', { name: 'Suspended' }).click()

  // The filter is state, and state lives in the URL.
  await expect(page).toHaveURL(/status=SUSPENDED/)

  /*
   * The list keeps the previous page visible while the next one loads
   * (`keepPreviousData`), so the old total is on screen for a moment after the
   * URL changes. Waiting for it to go is the assertion that the filter really
   * reached the server, rather than a race that would pass either way.
   */
  const total = page.getByText(/of \d+/).first()
  await expect(total).not.toHaveText(/of 500/)
  const totalBefore = await total.textContent()

  // A shared or bookmarked URL reproduces the same view.
  await page.reload()
  await expect(page).toHaveURL(/status=SUSPENDED/)
  await expect(page.getByText(/of \d+/).first()).toHaveText(totalBefore ?? '')
})

test('a filter chip clears its own filter', async ({ page }) => {
  await page.goto('/users?status=BANNED')
  await expect(page.getByText('Status:')).toBeVisible()

  await page.getByRole('button', { name: 'Remove Status filter' }).click()
  await expect(page).not.toHaveURL(/status=/)
  await expect(page.getByText(/of 500/)).toBeVisible()
})

test('changing a filter returns to page 1', async ({ page }) => {
  await page.goto('/users?page=5')
  await expect(page.getByText(/Showing 101–125/)).toBeVisible()

  await page.goto('/users?page=5&status=ACTIVE')
  // Landing on page 5 of a shorter result set is the classic filter bug.
  await expect(page.getByText(/Showing 101–125/)).toHaveCount(0)
})

test('an unmatched filter set shows an empty state, not a blank table', async ({
  page,
}) => {
  await page.goto('/users?search=zzzz-no-such-user-zzzz')
  await expect(page.getByText('No users match these filters')).toBeVisible()
})

test('sorting is server-driven and reflected in the URL', async ({
  page,
}, testInfo) => {
  const width = testInfo.project.use.viewport?.width ?? 0
  // Sort controls live in the table header, which only exists at lg and above.
  test.skip(width < 1024, 'no table header below lg')

  await page.getByRole('button', { name: /^User/ }).click()
  await expect(page).toHaveURL(/sortBy=displayName/)
})

test('a Moderator can view the directory', async ({ page }) => {
  // plan.md §8: users.view is granted to every admin role.

  /*
   * Sign out through the UI rather than clearing storage from under a running
   * app. Wiping `sessionStorage` mid-flight leaves React holding a session the
   * store no longer has, and the re-auth that follows raced intermittently.
   * Signing out properly leaves the app in a known state.
   */
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await signIn(page, ACCOUNTS.moderator)
  await page.goto('/users')

  await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible()
})
