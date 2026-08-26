import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, signIn } from './fixtures'

/**
 * Phase 3C — actions through `ConfirmActionDialog`.
 *
 * Runs against the mock backend, which reproduces the live validation rules
 * exactly (including the two endpoints that accept an empty body).
 */

const USER = '/users/usr_000001'

/**
 * The status badge currently shown in the record header.
 *
 * Anchored to the display-name heading rather than a bare `h2`: the record card
 * carries the page's `h1` on this screen, since the `PageHeader` above it no
 * longer repeats the name.
 */
async function currentStatus(page: Page): Promise<string> {
  const header = page.getByRole('heading', { level: 1 }).first().locator('..')
  return (await header.textContent()) ?? ''
}

test.describe('as a Super Admin', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto(USER)
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
  })

  test('offers only the transitions legal from the current status', async ({
    page,
  }) => {
    const status = await currentStatus(page)
    const ban = page.getByRole('button', { name: 'Ban', exact: true })
    const suspend = page.getByRole('button', { name: 'Suspend', exact: true })
    const lift = page.getByRole('button', { name: 'Lift suspension' })
    const restore = page.getByRole('button', { name: 'Restore account' })

    if (/Banned/i.test(status)) {
      // A banned account can only be restored — never suspended or re-banned.
      await expect(restore).toBeVisible()
      await expect(suspend).toHaveCount(0)
      await expect(ban).toHaveCount(0)
    } else if (/Suspended/i.test(status)) {
      await expect(lift).toBeVisible()
      await expect(suspend).toHaveCount(0)
    } else {
      await expect(suspend).toBeVisible()
      await expect(ban).toBeVisible()
      await expect(restore).toHaveCount(0)
    }
  })

  test('every action demands a reason before it can be confirmed', async ({ page }) => {
    await page.getByRole('button', { name: 'Change role' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Reason is empty, so confirming must not fire the mutation.
    await dialog.getByRole('button', { name: 'Change role' }).click()
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByText(/at least .* characters|reason/i).first(),
    ).toBeVisible()
  })

  test('the confirm dialog names the exact record being acted on', async ({ page }) => {
    const suspend = page.getByRole('button', { name: 'Suspend', exact: true })
    test.skip((await suspend.count()) === 0, 'this seeded user is not suspendable')

    await suspend.click()
    const dialog = page.getByRole('dialog')
    // Acting on the wrong row is the failure this guards against.
    await expect(dialog.getByText('usr_000001')).toBeVisible()
  })

  test('suspend collects a category, an optional expiry and session revocation', async ({
    page,
  }) => {
    const suspend = page.getByRole('button', { name: 'Suspend', exact: true })
    test.skip((await suspend.count()) === 0, 'this seeded user is not suspendable')

    await suspend.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel(/Category/)).toBeVisible()
    await expect(dialog.getByLabel(/Ends at/)).toBeVisible()
    // plan.md Phase 3: suspend offers an optional session revocation.
    await expect(dialog.getByLabel(/Sign the user out/)).toBeVisible()
  })

  test('a ban requires typing the user id, not just a reason', async ({ page }) => {
    const ban = page.getByRole('button', { name: 'Ban', exact: true })
    test.skip((await ban.count()) === 0, 'this seeded user is not bannable')

    await ban.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/Reason/).fill('Confirmed policy violation on appeal')

    const confirm = dialog.getByRole('button', { name: 'Ban user' })
    await confirm.click()
    // Still open: the typed confirmation has not been provided.
    await expect(dialog).toBeVisible()
  })

  test('a restriction can be added from its own panel, not the status cluster', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'Access & restrictions' }).click()

    /*
     * plan.md Phase 3 "Rules enforced": restrictions are structurally separate
     * from account status, so the control belongs to the restrictions panel.
     */
    await page.getByRole('button', { name: 'Add restriction' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel(/Capability/)).toBeVisible()
    await expect(dialog.getByLabel(/Ends at/)).toBeVisible()
    await expect(dialog.getByText(/account status is not changed/i)).toBeVisible()
  })

  test('revoke-all demands a reason even though the API does not', async ({ page }) => {
    await page.getByRole('tab', { name: 'Sessions & devices' }).click()
    const revokeAll = page.getByRole('button', { name: 'Revoke all sessions' })
    test.skip((await revokeAll.count()) === 0, 'no active sessions')

    await revokeAll.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Revoke all' }).click()
    // Blocked: an unattributable mass sign-out is exactly what auditing exists for.
    await expect(dialog).toBeVisible()
  })

  test('a completed action reports success and refreshes the record', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'Access & restrictions' }).click()
    await page.getByRole('button', { name: 'Add restriction' }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/Reason/).fill('Repeated unsolicited gifting reports')

    const refetch = page.waitForRequest(
      (r) => r.url().includes('/admin/users/usr_000001') && r.method() === 'GET',
    )
    await dialog.getByRole('button', { name: 'Apply restriction' }).click()

    await expect(page.getByText('Restriction applied.')).toBeVisible()
    // The record must be re-read: no mutation endpoint returns the new state.
    await refetch
  })
})

test.describe('permission gating', () => {
  test('a Moderator may restrict but may not suspend, ban or change role', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.moderator)
    await page.goto(USER)
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()

    await expect(
      page.getByRole('button', { name: 'Suspend', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ban', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Change role' })).toHaveCount(0)

    await page.getByRole('tab', { name: 'Access & restrictions' }).click()
    await expect(page.getByRole('button', { name: 'Add restriction' })).toBeVisible()
  })

  test('only a Super Admin can change a platform role', async ({ page }) => {
    /*
     * Promoting to ADMIN grants admin-panel access, so `users.change_role` is
     * withheld from the Admin tier — see auth/permissions.ts.
     */
    await signIn(page, ACCOUNTS.admin)
    await page.goto(USER)
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()

    await expect(page.getByRole('button', { name: 'Change role' })).toHaveCount(0)
  })
})

/**
 * Regression — both of these DELETEs require a JSON body.
 *
 * The client originally sent them bodyless, which reads as the natural way to
 * write a DELETE whose target is fully identified by the path. The live API
 * rejects that with `body/ Expected object, received null`, so the buttons
 * failed for every operator while the suite stayed green: the mocks accepted
 * anything. Asserting on the outgoing request is the only way to catch it,
 * because a mock that answers 200 regardless proves nothing about the wire.
 */
test.describe('DELETE actions send a body', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto(USER)
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
  })

  test('removing a restriction sends the operator reason', async ({ page }) => {
    /*
     * usr_000001 carries no restriction in the seed, and a skipped regression
     * test guards nothing — so this one navigates to a user the deterministic
     * seed always gives an active restriction.
     */
    await page.goto('/users/usr_000005')
    await page.getByRole('tab', { name: 'Access & restrictions' }).click()

    const remove = page.getByRole('button', { name: 'Remove', exact: true }).first()
    await remove.click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/Reason/).fill('Appeal upheld after manual review')

    const request = page.waitForRequest(
      (r) => r.url().includes('/restrictions/') && r.method() === 'DELETE',
    )
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click()

    const body = (await request).postDataJSON() as Record<string, unknown>
    // A null body is what the server rejects; an object is what it requires.
    expect(body).toBeTruthy()
    expect(body['reason']).toBe('Appeal upheld after manual review')
    await expect(page.getByText('Restriction removed.')).toBeVisible()
  })

  test('revoking a single session sends the operator reason', async ({ page }) => {
    await page.getByRole('tab', { name: 'Sessions & devices' }).click()

    const revoke = page.getByRole('button', { name: 'Revoke', exact: true }).first()
    test.skip((await revoke.count()) === 0, 'no active session to revoke')
    await revoke.click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/Reason/).fill('Device reported lost by the account owner')

    const request = page.waitForRequest(
      (r) => r.url().includes('/sessions/') && r.method() === 'DELETE',
    )
    await dialog.getByRole('button', { name: 'Revoke session' }).click()

    const body = (await request).postDataJSON() as Record<string, unknown>
    expect(body).toBeTruthy()
    expect(body['reason']).toBe('Device reported lost by the account owner')
    await expect(page.getByText('Session revoked.')).toBeVisible()
  })
})
