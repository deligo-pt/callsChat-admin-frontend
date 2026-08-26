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

test('the shell is a fixed frame — only the content scrolls', async ({
  page,
}, testInfo) => {
  const width = testInfo.project.use.viewport?.width ?? 0
  await page.goto('/users')
  await page.getByRole('heading', { name: 'Users', level: 1 }).waitFor()

  const topBar = page.locator('header').first()
  const before = await topBar.boundingBox()

  // Scroll the content region, not the window.
  await page.locator('main').evaluate((el) => el.scrollTo(0, 800))
  await page.waitForTimeout(300)

  /*
   * Regression guard. The sidebar and top bar were `position: sticky`, which
   * silently did nothing because `globals.css` sets `overflow-x: hidden` on
   * `html` — that makes the root a scroll container and breaks sticky for its
   * descendants. The symptom was the brand and account menu scrolling out of
   * reach on any long page.
   */
  const after = await topBar.boundingBox()
  expect(after?.y).toBe(before?.y)

  if (width >= 1024) {
    const sidebar = page.getByRole('navigation', { name: 'Modules' })
    const box = await sidebar.boundingBox()
    expect(box?.y).toBeLessThanOrEqual(200)
  }

  // The window itself must never scroll — the frame owns the viewport.
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})

test('no page-level horizontal scroll on the users table', async ({ page }) => {
  await page.goto('/users')
  await page.getByRole('heading', { name: 'Users', level: 1 }).waitFor()

  /*
   * `overflow-x: hidden` hides the scrollbar but still permits programmatic
   * scrolling, so asserting on scrollWidth alone is not enough — this checks
   * the page genuinely cannot move sideways.
   */
  const scrolled = await page.evaluate(() => {
    window.scrollTo(500, 0)
    const x = window.scrollX
    window.scrollTo(0, 0)
    return x
  })
  expect(scrolled).toBe(0)
})

test('the shell survives content injected into <body>', async ({ page }, testInfo) => {
  await page.goto('/users')
  await page.getByRole('heading', { name: 'Users', level: 1 }).waitFor()

  /*
   * Regression guard for a reported bug: the whole page scrolled, carrying the
   * top bar and sidebar off-screen and leaving white space below the app.
   *
   * The cause was that nothing stopped `<body>` growing — a browser extension
   * injecting an overlay was enough. `globals.css` now locks the document and
   * sizes `#root`, so the frame owns the viewport no matter what else is added.
   */
  await page.evaluate(() => {
    const injected = document.createElement('div')
    injected.style.height = '600px'
    injected.setAttribute('data-injected', 'true')
    document.body.appendChild(injected)
  })
  await page.waitForTimeout(300)

  // Wheel over the CONTENT region — at lg and above the left edge is sidebar.
  const width = testInfo.project.use.viewport?.width ?? 0
  await page.mouse.move(width >= 1024 ? width - 200 : width / 2, 400)
  await page.mouse.wheel(0, 1200)
  await page.waitForTimeout(400)

  const state = await page.evaluate(() => ({
    scrollY: window.scrollY,
    headerTop: Math.round(
      document.querySelector('header')!.getBoundingClientRect().top,
    ),
    rootFillsViewport:
      Math.round(document.getElementById('root')!.getBoundingClientRect().height) ===
      window.innerHeight,
  }))

  expect(state.scrollY).toBe(0)
  expect(state.headerTop).toBe(0)
  expect(state.rootFillsViewport).toBe(true)
})

test('the sign-in shell can still scroll on a short window', async ({ page }) => {
  /*
   * The document is locked, so the auth shell has to scroll itself — otherwise
   * the sign-in card would be unreachable on a short window or with a phone
   * keyboard open.
   */
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await page.setViewportSize({ width: 360, height: 420 })
  await expect(page.getByLabel('Email or phone')).toBeVisible()

  const reachable = await page.evaluate(() => {
    const shell = document.querySelector('main, #root > div') as HTMLElement
    shell.scrollTop = shell.scrollHeight
    return shell.scrollTop > 0 || shell.scrollHeight <= shell.clientHeight
  })
  expect(reachable).toBe(true)

  // The submit control must be reachable, not clipped off the bottom.
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})
