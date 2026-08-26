import { expect, test } from '@playwright/test'

import { signIn } from './fixtures'

/**
 * Self-service credential management — `PATCH /admin/auth/password` and
 * `PATCH /admin/auth/email`, both linked live.
 */

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await page.goto('/account')
})

test('is reachable from the account menu at every viewport', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Account & security' }).click()

  await expect(
    page.getByRole('heading', { name: 'Account & security', level: 1 }),
  ).toBeVisible()
})

test('every admin role can reach their own account page', async ({ page }) => {
  // Gating this would lock a Moderator out of changing their own password.
  await expect(page.getByText(/do not have access/i)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible()
})

test('the password policy is shown up front, not discovered by rejection', async ({
  page,
}) => {
  await expect(page.getByText('At least 8 characters')).toBeVisible()
  await expect(page.getByText('An uppercase letter')).toBeVisible()
  await expect(page.getByText('A lowercase letter')).toBeVisible()
  await expect(page.getByText('A number')).toBeVisible()
})

test('a weak new password is rejected client-side with a specific reason', async ({
  page,
}) => {
  await page.getByLabel('Current password', { exact: true }).fill('any-password')
  await page.getByLabel('New password', { exact: true }).fill('short')
  await page.getByLabel('Confirm new password').fill('short')
  await page.getByRole('button', { name: 'Change password' }).click()

  await expect(page.getByText('Use at least 8 characters.')).toBeVisible()
})

test('a mismatched confirmation is caught before hitting the API', async ({ page }) => {
  await page.getByLabel('Current password', { exact: true }).fill('any-password')
  await page.getByLabel('New password', { exact: true }).fill('ValidPass123')
  await page.getByLabel('Confirm new password').fill('DifferentPass123')
  await page.getByRole('button', { name: 'Change password' }).click()

  await expect(page.getByText('The passwords do not match.')).toBeVisible()
})

test('an invalid email is rejected before hitting the API', async ({ page }) => {
  await page.getByLabel('New email address').fill('not-an-email')
  await page.getByLabel('Confirm with your password').fill('any-password')
  await page.getByRole('button', { name: 'Update email' }).click()

  await expect(page.getByText('Enter a valid email address.')).toBeVisible()
})

test('the page never scrolls horizontally', async ({ page }) => {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
})
