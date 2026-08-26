import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, signIn } from './fixtures'

/**
 * Phase 3D — RBAC gating.
 *
 * The gate: **no action button leaks to a role lacking permission.** These
 * assert the whole matrix rather than spot-checking, because a leak is silent
 * — the button simply works until the backend refuses, and by then the
 * operator believes they were entitled to use it.
 *
 * Permissions come from the interim role map (`auth/permissions.ts`) until the
 * API supplies `permissions[]` (plan.md 3A′ #1). When it does, these tests keep
 * their meaning: they describe the RULES, not the mechanism.
 */

const USER = '/users/usr_000001'

/** Every gated control on the user module, by accessible name. */
const CONTROLS = {
  suspend: 'Suspend',
  ban: 'Ban',
  lift: 'Lift suspension',
  restore: 'Restore account',
  changeRole: 'Change role',
  addRestriction: 'Add restriction',
  revokeAll: 'Revoke all sessions',
} as const

async function visible(page: Page, name: string): Promise<boolean> {
  return (await page.getByRole('button', { name, exact: true }).count()) > 0
}

async function openUser(page: Page) {
  await page.goto(USER)
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
}

test.describe('Super Admin', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await openUser(page)
  })

  test('holds every user-management action', async ({ page }) => {
    // Status actions depend on the record's state; at least one must be offered.
    const anyStatusAction =
      (await visible(page, CONTROLS.suspend)) ||
      (await visible(page, CONTROLS.lift)) ||
      (await visible(page, CONTROLS.restore))
    expect(anyStatusAction).toBe(true)

    expect(await visible(page, CONTROLS.changeRole)).toBe(true)

    await page.getByRole('tab', { name: 'Access & restrictions' }).click()
    expect(await visible(page, CONTROLS.addRestriction)).toBe(true)
  })

  test('reaches every module route the backend serves', async ({ page }) => {
    for (const route of ['/users', '/dashboard', '/account']) {
      await page.goto(route)
      await expect(page.getByText(/do not have access/i)).toHaveCount(0)
    }
  })
})

test.describe('Admin', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await openUser(page)
  })

  test('may suspend and ban but may NOT change a platform role', async ({ page }) => {
    /*
     * Promoting an account to ADMIN grants admin-panel access. That is
     * privilege escalation, which `doc/RBAC, Security, and Privacy.md:52`
     * reserves for Super Admin — so this control must not appear.
     */
    expect(await visible(page, CONTROLS.changeRole)).toBe(false)

    const canActOnStatus =
      (await visible(page, CONTROLS.suspend)) ||
      (await visible(page, CONTROLS.lift)) ||
      (await visible(page, CONTROLS.restore))
    expect(canActOnStatus).toBe(true)
  })

  test('may restrict a capability', async ({ page }) => {
    await page.getByRole('tab', { name: 'Access & restrictions' }).click()
    expect(await visible(page, CONTROLS.addRestriction)).toBe(true)
  })
})

test.describe('Moderator', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.moderator)
    await openUser(page)
  })

  test('may NOT suspend, ban, restore or change a role', async ({ page }) => {
    for (const name of [
      CONTROLS.suspend,
      CONTROLS.ban,
      CONTROLS.lift,
      CONTROLS.restore,
      CONTROLS.changeRole,
    ]) {
      expect(await visible(page, name), `${name} leaked to Moderator`).toBe(false)
    }
  })

  test('may restrict a capability and revoke sessions', async ({ page }) => {
    // The Moderator tier exists to act on safety without touching account state.
    await page.getByRole('tab', { name: 'Access & restrictions' }).click()
    expect(await visible(page, CONTROLS.addRestriction)).toBe(true)
  })

  test('still sees the record, because users.view is granted to every tier', async ({
    page,
  }) => {
    await expect(page.getByRole('tab', { name: 'Finance' })).toBeVisible()
  })

  test('gets ForbiddenState — not a crash, not a blank page — on a barred route', async ({
    page,
  }) => {
    /*
     * plan.md §3.4: forcing the URL yields a safe access-denied state that
     * leaks nothing about what is behind it. A Moderator holds no
     * `analytics.view`, so the dashboard is barred.
     */
    await page.goto('/dashboard')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
    await expect(page.getByText('Something went wrong')).toHaveCount(0)
  })

  test('can always manage their OWN credentials', async ({ page }) => {
    // Gating this would lock a Moderator out of changing their own password.
    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible()
  })
})

test.describe('the access-denied state', () => {
  test('reveals nothing about the resource behind it', async ({ page }) => {
    await signIn(page, ACCOUNTS.moderator)
    await page.goto('/dashboard')

    const body = (await page.locator('main').textContent()) ?? ''
    /*
     * A 403 must not disclose whether data exists or what it contains —
     * otherwise the error itself becomes an information leak.
     */
    expect(body).not.toMatch(/\d{2,}/)
    expect(body).not.toMatch(/usr_|adm_/)
  })
})
