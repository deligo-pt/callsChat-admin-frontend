import { expect, test, type Page } from '@playwright/test'
import axe from 'axe-core'

import { ACCOUNTS, signIn } from './fixtures'

/**
 * Colour contrast, checked in a real browser.
 *
 * The component-level a11y tests disable axe's `color-contrast` rule because
 * jsdom has no canvas and cannot compute it (see `tests/a11y.ts`). That left
 * contrast unverified everywhere — and a `tailwind-merge` misconfiguration
 * then stripped the text colour off every small button, rendering the primary
 * action near-black on a blue fill at roughly 3.3:1. Nothing failed.
 *
 * This closes that gap for the shipped surfaces.
 */

async function contrastViolations(page: Page) {
  // `axe.source` is the library as a string — no filesystem access needed.
  await page.addScriptTag({ content: axe.source })
  return page.evaluate(async () => {
    const results = await (
      window as unknown as {
        axe: {
          run: (
            ctx: Document,
            opts: unknown,
          ) => Promise<{
            violations: Array<{
              id: string
              nodes: Array<{ html: string; target: unknown[] }>
            }>
          }>
        }
      }
    ).axe.run(document, {
      runOnly: { type: 'rule', values: ['color-contrast'] },
      resultTypes: ['violations'],
    })
    return results.violations.flatMap((v) =>
      v.nodes.map((n) => {
        const el = document.querySelector(n.target[0] as string)
        return {
          html: n.html,
          color: el ? getComputedStyle(el).color : 'unknown',
        }
      }),
    )
  })
}

/*
 * `--color-foreground-subtle` (#91949d) resolves to 3.07:1 on white, below the
 * 4.5:1 AA floor for normal text. It is pre-existing design-system debt, not
 * part of the button fix, and changing it repaints every muted label in the
 * app — so it is excluded here BY COMPUTED COLOUR and reported rather than
 * silently corrected. Any violation in a different colour still fails.
 */
const KNOWN_SUBTLE_TOKEN = 'rgb(145, 148, 157)'

test('the user directory has no contrast violations beyond known token debt', async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/users')
  await expect(page.getByRole('button', { name: 'Add user' })).toBeVisible()

  const unexpected = (await contrastViolations(page)).filter(
    (node) => node.color !== KNOWN_SUBTLE_TOKEN,
  )
  expect(unexpected).toEqual([])
})

test('the primary action reads as white on the brand fill', async ({ page }) => {
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/users')

  const button = page.getByRole('button', { name: 'Add user' })
  await button.waitFor()

  /*
   * Asserted as computed colour rather than a class name: the bug was that the
   * class was silently dropped during merging, so only what the browser
   * actually resolved proves anything.
   */
  const style = await button.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { color: cs.color, background: cs.backgroundColor }
  })
  expect(style.color).toBe('rgb(255, 255, 255)')
  expect(style.background).toBe('rgb(37, 99, 235)')
})

test('the staff surfaces have no contrast violations beyond known token debt', async ({
  page,
}) => {
  /*
   * Phase A5. The staff module introduced a status vocabulary of its own —
   * `locked` for a deleted account is a tone no other screen uses — plus a
   * permission grid of small muted prose. Neither was covered by the user
   * directory's pass.
   *
   * `hideDeleted=false`, so the `locked` badge is actually on screen: it is the
   * one tone this check exists for and it is hidden by default.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/staff?hideDeleted=false')
  /*
   * Waits on a ROW, not on the word "Deleted" — that substring-matches the
   * "Hide deleted" checkbox label in the filter bar, which is on screen before
   * the list has loaded, so the check would have run against an empty table.
   */
  await expect(page.getByText('Probe Temp', { exact: true })).toBeVisible()

  const unexpected = (await contrastViolations(page)).filter(
    (node) => node.color !== KNOWN_SUBTLE_TOKEN,
  )
  expect(unexpected).toEqual([])
})

test('the staff record and its permission grid have no contrast violations', async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/staff/stf_sarah')
  await expect(
    page.getByRole('heading', { name: 'Sarah Connor', level: 1 }),
  ).toBeVisible()

  const unexpected = (await contrastViolations(page)).filter(
    (node) => node.color !== KNOWN_SUBTLE_TOKEN,
  )
  expect(unexpected).toEqual([])
})

test('every staff status badge is legible on its own background', async ({ page }) => {
  /*
   * Measured on the badge's own computed colours rather than through axe,
   * because axe reports a violation per node and these four tones are the
   * thing being checked — a regression in one of them should name which.
   *
   * Contrast is computed here rather than asserted against fixed strings: the
   * tokens may legitimately be retuned, and what must not change is that the
   * result stays readable.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/staff?hideDeleted=false')
  /* A row, not the word "Deleted" — see the note above. */
  await expect(page.getByText('Probe Temp', { exact: true })).toBeVisible()

  const measured = await page.evaluate(() => {
    function parse(value: string): [number, number, number] {
      const [r = 0, g = 0, b = 0] = value.match(/\d+(\.\d+)?/g)!.map(Number)
      return [r, g, b]
    }
    function luminance([r, g, b]: [number, number, number]) {
      const channel = (raw: number) => {
        const c = raw / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    /** The nearest ancestor that actually paints, so the ratio is real. */
    function background(element: Element): [number, number, number] {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const value = getComputedStyle(node).backgroundColor
        const alpha = value.match(/[\d.]+/g)?.[3]
        if (value !== 'transparent' && alpha !== '0') return parse(value)
      }
      return [255, 255, 255]
    }

    /*
     * A plain loop over the live NodeList. Spreading it into an array and
     * calling `.find` returned nothing here — the evaluated function is
     * transpiled before it reaches the page, and the spread does not survive
     * that intact.
     */
    function findBadge(label: string): Element | null {
      for (const element of document.querySelectorAll('span, div')) {
        if (element.children.length > 0) continue
        if (element.textContent?.trim() === label) return element
      }
      return null
    }

    const results: Array<{ label: string; ratio: number }> = []
    for (const label of ['Active', 'Suspended', 'Banned', 'Deleted']) {
      const badge = findBadge(label)
      if (!badge) {
        results.push({ label, ratio: -1 })
        continue
      }
      const foreground = luminance(parse(getComputedStyle(badge).color))
      const behind = luminance(background(badge))
      const [lighter, darker] =
        foreground > behind ? [foreground, behind] : [behind, foreground]
      results.push({ label, ratio: (lighter! + 0.05) / (darker! + 0.05) })
    }
    return results
  })

  expect(measured.map((entry) => entry.label)).toEqual([
    'Active',
    'Suspended',
    'Banned',
    'Deleted',
  ])
  for (const { label, ratio } of measured) {
    // AA for normal text. Badge text is small, so the 3:1 large-text floor does not apply.
    expect(ratio, `${label} badge contrast`).toBeGreaterThanOrEqual(4.5)
  }
})
