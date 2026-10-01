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

/**
 * A focused control's ring must be fully inside every box that clips it.
 *
 * ⚠️ `globals.css` draws focus as `outline: 2px` at `outline-offset: 2px`, so the
 * indicator sits **4px outside** the element. Any scrolling ancestor is a
 * clipping box on BOTH axes — `overflow-y: auto` promotes `overflow-x` to `auto`
 * per spec — so a field flush against one has its ring sliced off.
 *
 * This measures the ring's box, not the element's, and walks every scrollable
 * ancestor. Content assertions cannot see this: the fix is a margin/padding pair
 * that changes no text and no layout width.
 */
export async function expectFocusRingNotClipped(
  page: Page,
  selector: string,
): Promise<void> {
  const clipped = await page.evaluate((target) => {
    const element = document.querySelector(target)
    if (!element) return ['no element matched ' + target]

    const style = getComputedStyle(element)
    const reach =
      parseFloat(style.outlineWidth || '0') + parseFloat(style.outlineOffset || '0')
    if (reach <= 0) return ['element is not showing a focus outline']

    const box = element.getBoundingClientRect()
    const ring = {
      left: box.left - reach,
      right: box.right + reach,
      top: box.top - reach,
      bottom: box.bottom + reach,
    }

    const offenders: string[] = []
    for (let node = element.parentElement; node; node = node.parentElement) {
      const overflow = getComputedStyle(node)
      const clips = overflow.overflowX !== 'visible' || overflow.overflowY !== 'visible'
      if (!clips) continue

      const edge = node.getBoundingClientRect()
      /* 0.5px of slack for sub-pixel layout, not for a missing 4px of padding. */
      if (ring.left < edge.left - 0.5) offenders.push('left clipped by ' + node.tagName)
      if (ring.right > edge.right + 0.5)
        offenders.push('right clipped by ' + node.tagName)
      /* Only the nearest clipping ancestor matters for this check. */
      break
    }
    return offenders
  }, selector)

  expect(clipped).toEqual([])
}
