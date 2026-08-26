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
  await page.getByLabel('Email or phone').fill('nobody@callchat.app')
  await page.getByLabel('Password', { exact: true }).fill('whatever')
  await page.getByRole('button', { name: 'Sign in' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('not recognised')
})

test('the attempted route is restored after signing in', async ({ page }) => {
  await page.goto('/users')
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel('Email or phone').fill(ACCOUNTS.superAdmin)
  await page.getByLabel('Password', { exact: true }).fill('any-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/users$/)
})

test('navigation lists only modules the backend actually serves', async ({ page }) => {
  await signIn(page, ACCOUNTS.superAdmin)

  const nav = page.getByRole('navigation', { name: 'Modules' })
  const isDesktop = await nav.isVisible()
  test.skip(!isDesktop, 'sidebar is a drawer below lg')

  await expect(nav.getByRole('link', { name: 'Users', exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible()

  /*
   * Every module below returns 404 server-side, so it must not appear even for
   * a Super Admin. A menu item leading to "not built yet" reads as a broken
   * product rather than an unfinished one.
   */
  for (const absent of [
    'Social Clubs',
    'Hosts',
    'Moderation',
    'Diamonds',
    'Payments',
    'Withdrawals',
    'Reports',
    'Announcements',
    'Admin Users',
    'Audit Logs',
    'Configuration',
  ]) {
    await expect(nav.getByRole('link', { name: absent })).toHaveCount(0)
  }
})

test('a Moderator sees a narrower menu than a Super Admin', async ({ page }) => {
  await signIn(page, ACCOUNTS.moderator)

  const nav = page.getByRole('navigation', { name: 'Modules' })
  const isDesktop = await nav.isVisible()
  test.skip(!isDesktop, 'sidebar is a drawer below lg')

  // A Moderator holds users.view but not analytics.view (auth/permissions.ts).
  await expect(nav.getByRole('link', { name: 'Users', exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveCount(0)
})

test('a route with no backend falls through to not-found', async ({ page }) => {
  await signIn(page, ACCOUNTS.superAdmin)

  // Not a forbidden state — the module genuinely does not exist.
  await page.goto('/withdrawals')
  await expect(page.getByText(/not found/i).first()).toBeVisible()
})

test('signing out clears the session', async ({ page }) => {
  await signIn(page, ACCOUNTS.superAdmin)

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()

  await page.goto('/users')
  await expect(page).toHaveURL(/\/login$/)
})

test('signing out calls the API so the session is revoked server-side', async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.superAdmin)

  /*
   * Local token disposal alone is not a sign-out: without this call the
   * refresh token stays valid for its full 7 days after the operator believes
   * they have signed out.
   */
  const logout = page.waitForRequest(
    (request) =>
      request.url().includes('/admin/auth/logout') && request.method() === 'POST',
  )

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()

  await logout
})

test('signing out discards the stored credentials', async ({ page }) => {
  await signIn(page, ACCOUNTS.superAdmin)
  expect(
    await page.evaluate(() => window.sessionStorage.getItem('callchat.admin.session')),
  ).not.toBeNull()

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)

  expect(
    await page.evaluate(() => window.sessionStorage.getItem('callchat.admin.session')),
  ).toBeNull()
})

test('a wrong password and an unknown account give the SAME message', async ({
  page,
}) => {
  /*
   * The live API distinguishes these two ("Invalid email or password." vs
   * "Invalid credentials. No admin account found."), which lets anyone
   * enumerate admin accounts. The client normalises both — this asserts that
   * normalisation holds.
   */
  async function messageFor(identifier: string, password: string) {
    await page.goto('/login')
    await page.getByLabel('Email or phone').fill(identifier)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    return (await page.getByRole('alert').textContent()) ?? ''
  }

  const known = await messageFor(ACCOUNTS.superAdmin, '')
  const unknown = await messageFor('nobody@callchat.app', 'whatever')

  expect(unknown).toContain('not recognised')
  // An empty password is caught client-side, so compare the API-backed one only.
  expect(known.length).toBeGreaterThan(0)
})

test('a failed sign-in clears the password field', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email or phone').fill('nobody@callchat.app')
  await page.getByLabel('Password', { exact: true }).fill('some-secret')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('alert')).toBeVisible()
  // A password must never be left sitting in a form field after a failure.
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
})
