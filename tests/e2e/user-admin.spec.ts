import { expect, test } from '@playwright/test'

import { ACCOUNTS, signIn } from './fixtures'

/**
 * Export, provisioning and profile/email edits.
 *
 * Every one of these is a sensitive operation on someone else's account — an
 * export carries unmasked contact details, provisioning creates a record that
 * cannot be deleted, and an edit rewrites identity fields. All three therefore
 * go through `ConfirmActionDialog` rather than saving quietly.
 */

test.describe('export', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/users')
    await expect(page.getByText(/Showing 1–25 of 500/)).toBeVisible()
  })

  test('downloads a file and states what is in scope', async ({ page }) => {
    await page.getByRole('button', { name: 'Export CSV' }).click()

    const dialog = page.getByRole('dialog')
    // Exporting the wrong scope is the mistake this wording prevents.
    await expect(dialog.getByText(/All users, unfiltered/)).toBeVisible()
    // The operator is warned about what the file contains before downloading it.
    await expect(dialog.getByText(/unmasked personal data/i)).toBeVisible()

    await dialog.getByLabel(/Reason/).fill('Quarterly account audit for finance')

    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Generate export' }).click()

    const file = await download
    expect(file.suggestedFilename()).toMatch(/\.csv$/)
  })

  test('exports the FILTERED set, not everything', async ({ page }) => {
    await page.goto('/users?status=BANNED')
    await expect(page.getByText('Status:')).toBeVisible()

    await page.getByRole('button', { name: 'Export CSV' }).click()
    const dialog = page.getByRole('dialog')

    /*
     * The confirmation must reflect the active filters — an operator who
     * filtered to banned accounts should not silently download all 500.
     */
    await expect(dialog.getByText(/1 active filter/)).toBeVisible()

    const request = page.waitForRequest((r) => r.url().includes('/admin/users/export'))
    await dialog.getByLabel(/Reason/).fill('Reviewing banned accounts for appeal')
    await dialog.getByRole('button', { name: 'Generate export' }).click()

    const url = (await request).url()
    expect(url).toContain('status=BANNED')
    // Paging is meaningless for an export; it returns the whole filtered set.
    expect(url).not.toContain('page=')
  })

  test('is hidden from a role without export_data', async ({ page }) => {
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await signIn(page, ACCOUNTS.moderator)
    await page.goto('/users')
    await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0)
  })
})

test.describe('provisioning', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/users')
    await expect(page.getByText(/Showing 1–25 of 500/)).toBeVisible()
    await page.getByRole('button', { name: 'Add user' }).click()
  })

  test('warns that the account cannot be deleted afterwards', async ({ page }) => {
    // There is no DELETE endpoint — a mistyped account is permanent.
    await expect(
      page.getByRole('dialog').getByText(/no way to delete it afterwards/i),
    ).toBeVisible()
  })

  test('blocks a malformed phone number, which the server would accept', async ({
    page,
  }) => {
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/Display name/).fill('Test Account')
    await dialog.getByLabel(/^Phone/).fill('notaphone')
    await dialog.getByLabel(/Reason/).fill('Creating a support test account')

    await dialog.getByRole('button', { name: 'Create account' }).click()

    /*
     * The backend does NOT validate this — it accepts any string and creates
     * the account. This client-side guard is the only protection, so it must
     * hold.
     */
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/valid phone number/i)).toBeVisible()
  })

  test('offers no role selector — escalation is a separate action', async ({
    page,
  }) => {
    const dialog = page.getByRole('dialog')
    /*
     * `POST /admin/users` accepts `role: SUPER_ADMIN`. Exposing that here would
     * let one click mint an administrator with no typed confirmation.
     */
    await expect(dialog.getByLabel(/^Role/)).toHaveCount(0)
    await expect(dialog.getByText(/created as a standard user/i)).toBeVisible()
  })

  test('defaults to pending verification, not active', async ({ page }) => {
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel(/Initial status/)).toContainText(
      /Pending verification/i,
    )
  })

  test('creates the account and refreshes the directory', async ({ page }) => {
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/Display name/).fill('Test Account')
    await dialog.getByLabel(/^Phone/).fill('+8801712345678')
    await dialog.getByLabel(/Reason/).fill('Creating a support test account')

    const refetch = page.waitForRequest(
      (r) => r.url().includes('/admin/users?') && r.method() === 'GET',
    )
    await dialog.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByText('Account created.')).toBeVisible()
    await refetch
  })

  test('is hidden from a Moderator', async ({ page }) => {
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await signIn(page, ACCOUNTS.moderator)
    await page.goto('/users')
    await expect(page.getByRole('button', { name: 'Add user' })).toHaveCount(0)
  })
})

test.describe('profile and email edits', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/users/usr_000001')
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
  })

  test('will not submit an unchanged profile', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit profile' }).click()
    const dialog = page.getByRole('dialog')

    await dialog.getByLabel(/Reason/).fill('Correcting the display name spelling')
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    // An unchanged save would write a meaningless audit entry.
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/Change a field to continue/i)).toBeVisible()
  })

  test('sends only the fields that changed', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit profile' }).click()
    const dialog = page.getByRole('dialog')

    await dialog.getByLabel(/Display name/).fill('Corrected Name')
    await dialog.getByLabel(/Reason/).fill('Correcting the display name spelling')

    const request = page.waitForRequest(
      (r) => r.url().includes('/profile') && r.method() === 'PATCH',
    )
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    const body = (await request).postDataJSON() as Record<string, unknown>
    expect(body['displayName']).toBe('Corrected Name')
    expect(body['reason']).toBeTruthy()
    // Untouched fields must not be echoed back as a full-record rewrite.
    expect(body).not.toHaveProperty('bio')
    expect(body).not.toHaveProperty('country')
  })

  test('marking an email verified is opt-in, never the default', async ({ page }) => {
    await page.getByRole('button', { name: 'Change email' }).click()
    const dialog = page.getByRole('dialog')

    // It bypasses the confirmation the user would normally complete.
    await expect(dialog.getByLabel(/Mark this address as verified/)).not.toBeChecked()
  })

  test('rejects a malformed email before it reaches the API', async ({ page }) => {
    await page.getByRole('button', { name: 'Change email' }).click()
    const dialog = page.getByRole('dialog')

    await dialog.getByLabel(/New email address/).fill('not-an-email')
    await expect(dialog.getByText(/valid email address/i)).toBeVisible()
  })

  test('are hidden from a Moderator', async ({ page }) => {
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await signIn(page, ACCOUNTS.moderator)
    await page.goto('/users/usr_000001')
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()

    await expect(page.getByRole('button', { name: 'Edit profile' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Change email' })).toHaveCount(0)
  })
})
