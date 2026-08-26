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
