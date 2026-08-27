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

/**
 * Global sign-out — `POST /admin/auth/logout` with `{ allDevices: true }`.
 *
 * The body is what these assert. The route answers 200 to a plain `{}` too,
 * so a missing or mistyped flag would look like a success and revoke nothing
 * but this browser — the exact outcome the feature exists to prevent.
 */
test.describe('sign out everywhere', () => {
  test('warns that the current session ends too, before doing anything', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Sign out of all devices' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/including this one/i)).toBeVisible()

    // Cancelling is not a sign-out.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(/\/account/)
  })

  test('sends allDevices as a boolean and returns to sign-in', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out of all devices' }).click()

    const request = page.waitForRequest(
      (r) => r.url().includes('/admin/auth/logout') && r.method() === 'POST',
    )
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Sign out everywhere' })
      .click()

    const body = (await request).postDataJSON() as Record<string, unknown>
    // `true`, not `"true"` — the schema rejects a string with a 400.
    expect(body['allDevices']).toBe(true)

    await expect(page).toHaveURL(/\/login/)
  })

  test('the revoked session cannot be resumed by reloading', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out of all devices' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Sign out everywhere' })
      .click()
    await expect(page).toHaveURL(/\/login/)

    /*
     * The credentials must be gone from storage, not merely unrendered. A
     * surviving refresh token would let the next visit walk straight back in.
     */
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login/)
  })
})

test('the page never scrolls horizontally', async ({ page }) => {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
})
