import { expect, test } from '@playwright/test'

import { signIn } from './fixtures'

/**
 * Phase 1 acceptance criteria (plan.md §1F).
 *
 * These run across the five responsive projects configured in
 * playwright.config.ts — 360 / 768 / 1024 / 1440 / 1920.
 */

// Every shell route requires an authenticated session (plan.md §2.5).
test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test('design gallery renders without horizontal page scroll', async ({ page }) => {
  await page.goto('/_design')
  await expect(
    page.getByRole('heading', { name: 'Design System', level: 1 }),
  ).toBeVisible()

  // plan.md §6.3: the page body must never scroll horizontally.
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth }
  })
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
})

test('list surface swaps between table and cards at lg', async ({ page }, testInfo) => {
  await page.goto('/_design')
  const width = testInfo.project.use.viewport?.width ?? 0

  const table = page.getByRole('table')
  if (width >= 1024) {
    await expect(table).toBeVisible()
  } else {
    await expect(table).toHaveCount(0)
    await expect(page.getByText('Ayesha Rahman').first()).toBeVisible()
  }
})

test('sidebar is a drawer below lg and fixed at lg and above', async ({
  page,
}, testInfo) => {
  await page.goto('/dashboard')
  const width = testInfo.project.use.viewport?.width ?? 0
  const menuButton = page.getByRole('button', { name: 'Open navigation' })

  if (width >= 1024) {
    await expect(menuButton).toBeHidden()
    await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible()
    return
  }

  await expect(menuButton).toBeVisible()
  await menuButton.click()

  const drawerNav = page.getByRole('navigation', { name: 'Modules' })
  await expect(drawerNav).toBeVisible()

  // Escape must close the drawer.
  await page.keyboard.press('Escape')
  await expect(drawerNav).toBeHidden()
})

test('drawer closes on navigation', async ({ page }, testInfo) => {
  const width = testInfo.project.use.viewport?.width ?? 0
  test.skip(width >= 1024, 'Drawer only exists below lg')

  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Open navigation' }).click()

  const drawerNav = page.getByRole('navigation', { name: 'Modules' })
  await expect(drawerNav).toBeVisible()

  await drawerNav.getByRole('link', { name: 'Users', exact: true }).click()

  await expect(page).toHaveURL(/\/users$/)
  await expect(drawerNav).toBeHidden()
})

test('confirm dialog blocks an empty reason', async ({ page }) => {
  await page.goto('/_design')

  await page.getByRole('button', { name: /Approve withdrawal \(warning\)/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Approve' }).click()
  await expect(dialog.getByRole('alert')).toContainText(/reason of at least/i)
  await expect(dialog).toBeVisible()
})
