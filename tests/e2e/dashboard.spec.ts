import { expect, test, type Locator, type Page } from '@playwright/test'
import axe from 'axe-core'

import {
  ACCOUNTS,
  expectFocusRingNotClipped,
  expectNoSidewaysScroll,
  seedDashboardFixtures,
  seedLiveFixtures,
  signIn,
} from './fixtures'

/**
 * The dashboard, phase DB6 (plan.md), in a real browser at every width.
 *
 * Two data sets (src/mocks/handlers/dashboard.ts):
 * - **Quiet** (default): staging's numbers on 2026-11-11 — 33 users, 11
 *   flagged, 3 sessions, no calls.
 * - **Busy** (`seedDashboardFixtures`): 12,450 users, 890 sessions, 34 calls.
 *
 * Failures are forced per source with the mock's `fail()` switch, written to
 * sessionStorage before the app boots so the page fails from its first load.
 *
 * A Moderator holds no `analytics.view`; that the route is barred to them is
 * covered in rbac.spec.ts and not repeated here.
 */

function main(page: Page): Locator {
  return page.getByRole('main')
}

function section(page: Page, name: string): Locator {
  return main(page).getByRole('region', { name })
}

function width(page: Page): number {
  return page.viewportSize()?.width ?? 0
}

type Source = 'snapshot' | 'trends' | 'rates'

async function failFromStart(page: Page, failures: [Source, 403 | 429 | 500][]) {
  await page.addInitScript((value) => {
    sessionStorage.setItem('callschat.mocks.dashboard.failing', value)
  }, JSON.stringify(failures))
}

/** Every section is on the page and the first snapshot has landed. */
async function ready(page: Page): Promise<void> {
  /*
   * A cold first paint fetches six sources and the lazy Recharts chunk; under a
   * full parallel run at five widths that can pass 5s. 15s is a ceiling, not a
   * wait: a healthy page is ready in about one.
   */
  const timeout = 15_000
  await expect(main(page).getByRole('article', { name: 'Total users' })).toContainText(
    /\d/,
    { timeout },
  )
  await expect(section(page, 'All time').getByText('Messages sent')).toBeVisible({
    timeout,
  })
  await expect(section(page, 'Activity').locator('.recharts-surface')).toBeVisible({
    timeout,
  })
}

/** Rows of the screen-reader table: one per chart point. */
function chartRows(page: Page): Locator {
  return section(page, 'Activity').locator('table tbody tr')
}

test.describe('with staging’s quiet numbers', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await ready(page)
  })

  test('shows every section, with the real figures', async ({ page }) => {
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText('Dashboard')
    await expect(
      main(page).getByRole('article', { name: 'Total users' }),
    ).toContainText('33')
    await expect(
      main(page).getByRole('article', { name: 'Flagged accounts' }),
    ).toContainText('Not in good standing')
    for (const name of [
      'Activity',
      'Live now',
      'Users by status',
      'Roles and account types',
      'Needs attention',
      'All time',
      'Economy',
    ]) {
      await expect(section(page, name), name).toBeVisible()
    }
    await expect(section(page, 'Live now').getByRole('img')).toHaveAccessibleName(
      'Sessions by platform: Web 2, Android 1, iOS 0, Desktop 0',
    )
    await expect(section(page, 'All time')).toContainText('62 min')
    /* Every figure says what it counts (users vs sessions, waiting vs verified). */
    await expect(
      main(page).getByRole('article', { name: 'Users online' }),
    ).toBeVisible()
    await expect(
      main(page).getByRole('article', { name: 'New sign-ups today' }),
    ).toBeVisible()
    await expect(
      section(page, 'Needs attention').getByRole('link', {
        name: /Business verification/,
      }),
    ).toContainText('Waiting for review · 0 of 6 verified')
    await expect(section(page, 'Economy')).toContainText('75%')
    await expectNoSidewaysScroll(page)
  })

  test('shows the gap in the status breakdown as its own row, not hidden', async ({
    page,
  }) => {
    /* Staging: 21 + 0 + 1 + 10 = 32 of 33 users. */
    const status = section(page, 'Users by status')
    await expect(
      status.getByRole('meter', { name: 'Banned or not listed', exact: true }),
    ).toHaveAttribute('aria-valuenow', '1')
    await expect(
      status.getByRole('meter', { name: 'Active', exact: true }),
    ).toHaveAttribute('aria-valuemax', '33')
  })

  test('the range switch updates the URL and the chart', async ({ page }) => {
    const activity = section(page, 'Activity')
    await expect(chartRows(page)).toHaveCount(7)

    await activity.getByRole('button', { name: '24h' }).click()
    await expect(page).toHaveURL(/\/dashboard\?range=24h$/)
    await expect(activity.getByRole('button', { name: '24h' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(chartRows(page)).toHaveCount(24)
    await expect(activity).toContainText('Last 24 hours')

    await activity.getByRole('button', { name: '30d' }).click()
    await expect(page).toHaveURL(/\/dashboard\?range=30d$/)
    await expect(chartRows(page)).toHaveCount(30)

    /* The default leaves the URL clean. */
    await activity.getByRole('button', { name: '7d' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(chartRows(page)).toHaveCount(7)
  })

  test('a range in the URL survives a reload; a bad one falls back to 7d', async ({
    page,
  }) => {
    await page.goto('/dashboard?range=30d')
    await expect(chartRows(page)).toHaveCount(30)
    await page.goto('/dashboard?range=90d')
    await expect(
      section(page, 'Activity').getByRole('button', { name: '7d' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(chartRows(page)).toHaveCount(7)
  })

  test('series toggle on and off, and the last one stays on', async ({ page }) => {
    const series = section(page, 'Activity').getByRole('group', {
      name: 'Series shown',
    })
    const areas = section(page, 'Activity').locator('.recharts-area')
    await expect(areas).toHaveCount(3)

    await series.getByRole('button', { name: /Calls/ }).click()
    await expect(series.getByRole('button', { name: /Calls/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(areas).toHaveCount(2)

    await series.getByRole('button', { name: /Active sessions/ }).click()
    await series.getByRole('button', { name: /Sign-ups/ }).click()
    await expect(series.getByRole('button', { name: /Sign-ups/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(areas).toHaveCount(1)
  })

  test('the queue rows open their screens', async ({ page }) => {
    const queue = section(page, 'Needs attention')
    await expect(
      queue.getByRole('link', { name: /Business verification/ }),
    ).toHaveAttribute('href', '/verifications')
    await queue.getByRole('link', { name: /Top-up requests/ }).click()
    await expect(page).toHaveURL(/\/diamonds\/top-ups$/)
    await expect(main(page).getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('an all-zero period says so', async ({ page }) => {
    await page.evaluate(() => {
      ;(
        window as unknown as { __mockScenario: { set: (s: string) => void } }
      ).__mockScenario.set('empty')
    })
    await main(page).getByRole('button', { name: 'Refresh' }).click()
    await expect(
      section(page, 'Activity').getByText('No activity in this period'),
    ).toBeVisible()
    await expect(section(page, 'Needs attention')).toContainText('All clear')
  })

  test('the chart can be read from the keyboard', async ({ page }) => {
    const chart = section(page, 'Activity').locator('.recharts-surface')
    await section(page, 'Activity')
      .getByRole('group', { name: 'Series shown' })
      .getByRole('button')
      .last()
      .focus()
    await page.keyboard.press('Tab')
    await expect(chart).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(
      section(page, 'Activity').locator('.recharts-tooltip-wrapper'),
    ).toContainText('Sign-ups')
  })

  test('links on the cards keep their whole focus ring', async ({ page }) => {
    const openUsers = main(page)
      .getByRole('article', { name: 'Total users' })
      .getByRole('link', { name: 'Open users' })
    await openUsers.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(openUsers).toBeFocused()
    await expectFocusRingNotClipped(page, 'main article[aria-label="Total users"] a')
  })

  test('has no axe violations', async ({ page }) => {
    await page.addScriptTag({ content: axe.source })
    const violations = await page.evaluate(async () => {
      const run = (
        window as unknown as {
          axe: {
            run: (
              context: Element,
              options: unknown,
            ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>
          }
        }
      ).axe.run
      /* Contrast is measured in contrast.spec.ts, against the known token debt. */
      const result = await run(document.querySelector('main') ?? document.body, {
        rules: { 'color-contrast': { enabled: false } },
        resultTypes: ['violations'],
      })
      return result.violations.map((v) => `${v.id} (${v.nodes.length})`)
    })
    expect(violations).toEqual([])
  })
})

test.describe('with a busy platform', () => {
  test.beforeEach(async ({ page }) => {
    await seedDashboardFixtures(page)
    await seedLiveFixtures(page)
    await signIn(page, ACCOUNTS.superAdmin)
    await ready(page)
  })

  test('shows the busy figures and fits the width', async ({ page }) => {
    await expect(
      main(page).getByRole('article', { name: 'Total users' }),
    ).toContainText('12,450')
    await expect(section(page, 'Live now')).toContainText('890')
    await expect(section(page, 'Live now')).toContainText('4,500 diamonds')
    await expect(section(page, 'All time')).toContainText('3,090 h')
    await expect(section(page, 'Needs attention')).toContainText('waiting')
    await expectNoSidewaysScroll(page)
  })

  test('flagged users follow the server’s attention flag', async ({ page }) => {
    /* Busy seed: 3 flagged, `flaggedRequiresAttention: false`. */
    const queue = section(page, 'Needs attention')
    await expect(
      queue.getByRole('listitem').filter({ hasText: 'Flagged accounts' }),
    ).toContainText('Nothing waiting')
  })

  test('flagged users link nowhere until the moderation screen exists', async ({
    page,
  }) => {
    /* `/moderation` has no page yet; a link there would land on "Page not found". */
    await expect(
      main(page).getByRole('article', { name: 'Flagged accounts' }).getByRole('link'),
    ).toHaveCount(0)
    await expect(
      section(page, 'Needs attention').getByRole('link', { name: /Flagged accounts/ }),
    ).toHaveCount(0)
    await expect(main(page).locator('a[href="/moderation"]')).toHaveCount(0)
  })
})

test.describe('as an Admin', () => {
  test('sees the dashboard, without the Super-Admin-only queue', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await ready(page)
    const queue = section(page, 'Needs attention')
    await expect(queue.getByRole('link', { name: /Withdrawals/ }).first()).toBeVisible()
    /* Business verification needs `verifications.review`. */
    await expect(
      queue.getByRole('link', { name: /Business verification/ }),
    ).toHaveCount(0)
    await expect(section(page, 'Economy')).toBeVisible()
  })
})

test.describe('when a source fails', () => {
  test('a failing chart keeps the rest of the page', async ({ page }) => {
    await failFromStart(page, [['trends', 500]])
    await signIn(page, ACCOUNTS.superAdmin)
    /* 500s are retried twice with backoff before the error shows. */
    await expect(section(page, 'Activity').getByRole('alert')).toContainText(
      'Something went wrong',
      { timeout: 15_000 },
    )
    await expect(
      section(page, 'Activity').getByRole('button', { name: 'Retry' }),
    ).toBeVisible()
    await expect(
      main(page).getByRole('article', { name: 'Total users' }),
    ).toContainText('33')
    await expect(section(page, 'Live now')).toContainText('Active sessions')
  })

  test('no access to the rates is a calm note with no Retry', async ({ page }) => {
    await failFromStart(page, [['rates', 403]])
    await signIn(page, ACCOUNTS.superAdmin)
    const economy = section(page, 'Economy')
    await expect(economy.getByRole('status')).toContainText('You don’t have access')
    await expect(economy.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  })

  test('a failed snapshot leaves one Retry and “Not available” cards', async ({
    page,
  }) => {
    await failFromStart(page, [['snapshot', 500]])
    await signIn(page, ACCOUNTS.superAdmin)
    await expect(main(page).getByRole('alert').first()).toContainText(
      'Something went wrong',
      { timeout: 15_000 },
    )
    await expect(
      main(page).getByRole('article', { name: 'Total users' }),
    ).toContainText('Not available right now')
    await expect(section(page, 'Live now')).toContainText('Not available right now')
    /* The chart has its own source and still draws. */
    await expect(chartRows(page)).toHaveCount(7)
  })

  test('a snapshot 403 is the standard no-access screen', async ({ page }) => {
    await failFromStart(page, [['snapshot', 403]])
    await signIn(page, ACCOUNTS.superAdmin)
    await expect(main(page).getByText(/do not have access/i)).toBeVisible()
    await expect(section(page, 'Activity')).toHaveCount(0)
  })

  test('a 429 shows one toast and no Retry', async ({ page }) => {
    await failFromStart(page, [
      ['snapshot', 429],
      ['trends', 429],
    ])
    await signIn(page, ACCOUNTS.superAdmin)
    await expect(page.getByText('The server asked us to slow down')).toHaveCount(1)
    await expect(main(page).getByRole('button', { name: 'Retry' })).toHaveCount(0)
  })
})

test.describe('motion', () => {
  test('under reduced motion nothing animates and numbers show at once', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await seedDashboardFixtures(page)
    await signIn(page, ACCOUNTS.superAdmin)
    const card = main(page).getByRole('article', { name: 'Total users' })
    /* No count-up: the final figure is the first one painted. */
    await expect(card).toContainText('12,450')
    const animations = await main(page)
      .locator('ul > li')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName)
    expect(animations).toBe('none')
  })

  test('with motion, the KPI cards stagger in', async ({ page }) => {
    test.skip(width(page) < 1024, 'One width is enough for timing.')
    await signIn(page, ACCOUNTS.superAdmin)
    const cards = main(page).getByRole('region', { name: 'Key figures' }).locator('li')
    /* `evaluateAll` does not wait; the cards must be there first. */
    await expect(cards).toHaveCount(4)
    const delays = await cards.evaluateAll((items) =>
      items.map((el) => getComputedStyle(el).animationDelay),
    )
    expect(delays).toEqual(['0s', '0.06s', '0.12s', '0.18s'])
  })
})
