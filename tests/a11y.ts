import axe, { type AxeResults, type RunOptions } from 'axe-core'
import { expect } from 'vitest'

/**
 * Run axe against a rendered container and fail the test on any violation.
 *
 * Used in place of eslint-plugin-jsx-a11y, which has no ESLint 10 build yet
 * (see plan.md §13). Runtime axe catches more real issues than static linting,
 * so component tests are the enforcement point for accessibility.
 */
export async function expectNoA11yViolations(
  container: Element,
  options: RunOptions = {},
): Promise<void> {
  const results: AxeResults = await axe.run(container, {
    /*
     * jsdom has no canvas, so axe cannot compute colour contrast here. Contrast
     * is verified against a real browser in the Phase 11 Playwright pass
     * (plan.md §11A) — disabling it explicitly keeps that gap visible rather
     * than letting the rule fail silently.
     */
    rules: { 'color-contrast': { enabled: false } },
    ...options,
    resultTypes: ['violations'],
  })

  const messages = results.violations.map(
    (violation) =>
      `[${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}\n` +
      violation.nodes.map((node) => `    ${node.html}`).join('\n'),
  )

  expect(messages, `Accessibility violations found:\n${messages.join('\n')}`).toEqual(
    [],
  )
}
