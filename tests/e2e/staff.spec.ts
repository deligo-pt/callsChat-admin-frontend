import { expect, test } from '@playwright/test'

import { ACCOUNTS, expectNoSidewaysScroll, signIn } from './fixtures'

/**
 * Staff directory — the checks jsdom cannot make.
 *
 * The component suite already covers labels, filters and the deleted-row
 * rules. What only a real browser can answer is whether the page **overflows
 * sideways** — the S5 defect was a 388px card in a 328px track, and the
 * document-level assertion missed it because the scroll lived on `main`.
 */

test.describe('staff directory', () => {
  test('renders without sideways scroll and shows the deleted notice', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto('/staff')

    await expect(page.getByRole('heading', { name: 'Staff', level: 1 })).toBeVisible()
    await expect(page.getByText('Sarah Connor')).toBeVisible()

    /* Hidden by default, and the page says how many it hid. */
    await expect(page.getByText('Probe Temp')).toHaveCount(0)
    await expect(page.getByText(/1 deleted account is hidden/i)).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('reveals deleted accounts when the toggle is cleared', async ({ page }) => {
    await signIn(page)
    await page.goto('/staff?hideDeleted=false')

    await expect(page.getByText('Probe Temp')).toBeVisible()
    // "Deleted", never "Inactive" — the relabel is the whole point of §5.2.
    await expect(page.getByText('Deleted').first()).toBeVisible()
  })

  test('is refused to an Admin, by nav and by URL', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)

    /* The section is not merely disabled — it is absent. */
    await expect(page.getByRole('link', { name: 'Staff', exact: true })).toHaveCount(0)

    await page.goto('/staff')
    await expect(page.getByText('You do not have access to this')).toBeVisible()
    /* And no record data leaks into the forbidden state. */
    await expect(page.getByText('Sarah Connor')).toHaveCount(0)
  })

  test('provisioning is reachable, denied by default, and opens the new record', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto('/staff')

    await page.getByRole('link', { name: 'Add staff' }).click()
    await expect(
      page.getByRole('heading', { name: 'Add staff member', level: 1 }),
    ).toBeVisible()

    /* Denied by default — the grid opens with nothing ticked (plan.md §8). */
    for (const box of await page.getByRole('checkbox').all()) {
      await expect(box).not.toBeChecked()
    }

    await page.getByLabel('Email address').fill('e2e.hire@callschat.com')
    await page.getByLabel('Display name').fill('E2E Hire')
    await page.getByLabel(/^Password/).fill('Str0ngPassword')
    await page.getByLabel('User directory').check()

    await page.getByRole('button', { name: 'Create account' }).click()

    /*
     * On the new record — and crucially with NO "leave without saving?" prompt
     * in between. The form is at its dirtiest exactly when it succeeds;
     * Playwright auto-dismisses dialogs, so the assertion that matters is that
     * the navigation completed at all.
     */
    await expect(
      page.getByRole('heading', { name: 'E2E Hire', level: 1 }),
    ).toBeVisible()
    /*
     * A toast, not an in-place confirmation: the page navigated away, so there
     * is no surface left to confirm on. It names the person, because "Created"
     * alone does not tell an operator which create it is reporting.
     */
    await expect(page.getByText('E2E Hire can now sign in.')).toBeVisible()
    /* And the grid shows what the SERVER recorded, read back fresh. */
    await expect(page.getByLabel('User directory')).toBeChecked()
  })

  test('the provisioning form fits the viewport', async ({ page }) => {
    /*
     * Its identity card is a two-column grid above `md` and the permission
     * grid is eight bordered rows of prose — both collapse to one column at
     * 360, and this is the assertion that they actually do.
     */
    await signIn(page)
    await page.goto('/staff/new')

    await expect(
      page.getByRole('heading', { name: 'Add staff member', level: 1 }),
    ).toBeVisible()
    await expectNoSidewaysScroll(page)
  })

  test('a duplicate email is reported on the field that caused it', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto('/staff/new')

    await page.getByLabel('Email address').fill('sarah.connor@callschat.com')
    await page.getByLabel('Display name').fill('Impostor')
    await page.getByLabel(/^Password/).fill('Str0ngPassword')
    await page.getByRole('button', { name: 'Create account' }).click()

    const message = page.locator('#email-error')
    await expect(message).toBeVisible()
    await expect(message).toContainText(/already exists/i)
  })

  test('provisioning is refused to an Admin by URL', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await page.goto('/staff/new')

    await expect(page.getByText('You do not have access to this')).toBeVisible()
    await expect(page.getByLabel('Email address')).toHaveCount(0)
  })

  test('a row opens its record, and its permissions can be changed', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto('/staff')

    await page.getByText('Sarah Connor', { exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Sarah Connor', level: 1 }),
    ).toBeVisible()

    const releases = page.getByLabel('App releases')
    await expect(releases).not.toBeChecked()
    await releases.check()

    await page.getByRole('button', { name: 'Save permissions' }).click()
    await expect(page.getByText(/Saved\./)).toBeVisible()

    /*
     * Re-read from the server rather than trusting the response: this module
     * never seeds a cache from a mutation (§3.7), and the point of the save is
     * what the backend now holds.
     */
    await page.reload()
    await expect(page.getByLabel('App releases')).toBeChecked()

    await expectNoSidewaysScroll(page)
  })

  test('a deleted record is readable but offers no controls', async ({ page }) => {
    await signIn(page)
    await page.goto('/staff/stf_deleted')

    await expect(page.getByText(/This account is deleted/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save permissions' })).toHaveCount(0)
  })

  test('a suspension reports the session count the server holds afterwards', async ({
    page,
  }) => {
    /*
     * §3.7 in a real browser. The status response echoes the session count
     * from BEFORE the revocation, so a page that trusted it would show live
     * sessions on an account it had just signed out everywhere.
     */
    await signIn(page)
    await page.goto('/staff/stf_sarah')

    const sessions = page.locator('dt', { hasText: 'Active sessions' }).locator('..')
    await expect(sessions).toContainText('2')

    await page.getByRole('button', { name: 'Suspend' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/Reason/).fill('Leaving the team at the end of the month.')
    await dialog.getByRole('button', { name: 'Suspend' }).click()

    await expect(page.getByText('Suspended')).toBeVisible()
    await expect(sessions).toContainText('0')
    await expectNoSidewaysScroll(page)
  })

  test('a reset reveals the password once and then loses it', async ({ page }) => {
    await signIn(page)
    await page.goto('/staff/stf_marcus')

    await page.getByRole('button', { name: 'Reset password' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Reset password' }).click()

    await expect(dialog.getByText(/only time this password is shown/i)).toBeVisible()
    await dialog.getByRole('button', { name: 'I have saved it' }).click()

    /* Reopening starts a fresh reset rather than recovering the old value. */
    await page.getByRole('button', { name: 'Reset password' }).click()
    await expect(
      page.getByRole('dialog').getByText(/only time this password is shown/i),
    ).toHaveCount(0)
  })

  test('deleting returns to the directory with the row still there', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto('/staff/stf_banned')

    await page.getByRole('button', { name: 'Delete account' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/stays in this list, marked Deleted/i)).toBeVisible()
    await dialog.getByLabel(/to confirm/i).fill('Dana Okonkwo')
    await dialog.getByRole('button', { name: 'Delete account' }).click()

    await expect(page.getByRole('heading', { name: 'Staff', level: 1 })).toBeVisible()
    /* Hidden by default, but the page accounts for it rather than losing it. */
    await expect(page.getByText(/deleted accounts? (is|are) hidden/i)).toBeVisible()
  })
})
