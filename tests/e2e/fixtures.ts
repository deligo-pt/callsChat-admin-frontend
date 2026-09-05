import { expect, type Page } from '@playwright/test'

/**
 * Mock-backend admin accounts (src/mocks/handlers/auth.ts).
 * Any non-empty password is accepted; password policy is a backend concern.
 */
export const ACCOUNTS = {
  superAdmin: 'nadia@callschat.app',
  admin: 'tomas@callschat.app',
  moderator: 'elena@callschat.app',
} as const

/** Sign in and wait for the authenticated shell. */
export async function signIn(
  page: Page,
  identifier: string = ACCOUNTS.superAdmin,
): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email or phone').fill(identifier)
  await page.getByLabel('Password', { exact: true }).fill('any-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

/**
 * Nothing in `main` may cross its right edge, and `main` itself may not scroll
 * sideways.
 *
 * Assert on the SCROLL CONTAINER, not the document. A `main` that scrolls
 * sideways leaves `document.scrollingElement` perfectly clean — which is
 * exactly how the S5 overflow shipped.
 *
 * The measurement is "does anything stick out past `main`", not "is any box
 * wider than its own content area". The looser-sounding rule is the accurate
 * one: a card's chevron carries `-m-1` to widen its touch target, so it
 * overhangs its parent by 4px BY DESIGN and the card's own padding absorbs it.
 * Flagging that says nothing about whether the page scrolls. A 388px card in a
 * 328px track, by contrast, crosses `main`'s edge and is caught here.
 */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) return { scrolls: true, offenders: ['no main element'] }

    const edge = main.getBoundingClientRect().right
    const offenders: string[] = []

    for (const element of main.querySelectorAll('*')) {
      if (element.getBoundingClientRect().right <= edge + 1) continue

      /* Content inside its own `overflow-x: auto` box may exceed the edge. */
      let scrollable = false
      for (let node = element.parentElement; node; node = node.parentElement) {
        const overflowX = getComputedStyle(node).overflowX
        if (overflowX === 'auto' || overflowX === 'scroll') {
          scrollable = true
          break
        }
      }
      if (scrollable) continue

      offenders.push(`${element.tagName}.${element.className.toString().slice(0, 60)}`)
    }

    return { scrolls: main.scrollWidth > main.clientWidth + 1, offenders }
  })

  expect(overflow.offenders).toEqual([])
  expect(overflow.scrolls).toBe(false)
}
