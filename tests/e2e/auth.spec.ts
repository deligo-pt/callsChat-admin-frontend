import { expect, test } from '@playwright/test'

import { ACCOUNTS, signIn } from './fixtures'

/**
 * Phase 2 acceptance criteria (plan.md §2).
 *
 * These run against the MSW mock backend, exercising the real session flow,
 * real pagination and the real RBAC filtering.
 */

test('an unauthenticated visitor is redirected to login', async ({ page }) => {
  await page.goto('/users')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('signing in lands on the dashboard and shows the admin name', async ({ page }) => {
  await signIn(page, ACCOUNTS.superAdmin)
  await page.getByRole('button', { name: 'Account menu' }).click()
  await expect(page.getByText('Nadia Chowdhury')).toBeVisible()
  await expect(page.getByText('Super Admin')).toBeVisible()
})

test('login rejects an unknown account without leaking which part was wrong', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('nobody@callchat.app')
  await page.getByLabel('Password').fill('whatever')
  await page.getByRole('button', { name: 'Sign in' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('Email or password is incorrect')
})

test('the attempted route is restored after signing in', async ({ page }) => {
  await page.goto('/withdrawals')
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel('Email').fill(ACCOUNTS.superAdmin)
  await page.getByLabel('Password').fill('any-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/withdrawals$/)
})

test('a Moderator sees only permitted navigation and is blocked elsewhere', async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.moderator)

  const nav = page.getByRole('navigation', { name: 'Modules' })
  const isDesktop = await nav.isVisible()
  if (isDesktop) {
    // plan.md §8: a Moderator has no finance or administration access.
    await expect(nav.getByRole('link', { name: 'Users', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Moderation' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Withdrawals' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Audit Logs' })).toHaveCount(0)
  }

  // Forcing the URL must show a safe access-denied state, not the page.
  await page.goto('/withdrawals')
  await expect(page.getByText(/do not have access/i)).toBeVisible()
})

test('a Super Admin sees the finance modules', async ({ page }) => {
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/withdrawals')
  await expect(page.getByText(/do not have access/i)).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Withdrawals', level: 1 }),
  ).toBeVisible()
})

test('global search returns grouped results and navigates', async ({ page }) => {
  await signIn(page, ACCOUNTS.superAdmin)

  const search = page.getByRole('combobox', { name: 'Global search' })
  await search.fill('usr_000001')

  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible()
  await expect(listbox.getByText('Users')).toBeVisible()

  await listbox.getByRole('option').first().click()
  await expect(page).toHaveURL(/\/users\/usr_000001$/)
})

test('global search is keyboard navigable', async ({ page }) => {
  await signIn(page, ACCOUNTS.superAdmin)

  const search = page.getByRole('combobox', { name: 'Global search' })
  await search.fill('WD-100')

  // Wait for real results, not just the container — pressing Enter while the
  // request is still in flight correctly does nothing.
  const options = page.getByRole('listbox').getByRole('option')
  await expect(options.first()).toBeVisible()

  await search.press('ArrowDown')
  await search.press('Enter')
  await expect(page).toHaveURL(/\/withdrawals\/wdr_/)
})

test('signing out clears the session', async ({ page }) => {
  await signIn(page, ACCOUNTS.superAdmin)

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()

  await page.goto('/users')
  await expect(page).toHaveURL(/\/login$/)
})
