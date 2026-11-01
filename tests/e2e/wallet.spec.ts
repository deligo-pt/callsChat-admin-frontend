import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  ACCOUNTS,
  expectNoSidewaysScroll,
  seedLedgerHistory,
  seedWalletFixtures,
  signIn,
} from './fixtures'

/**
 * The wallet transaction history, end to end — plan.md T6.
 *
 * Covers T2 (ledger page), T3 (entry page), T4 (Finance tab history, paged),
 * T0 badges and T5 connections, in a real browser at every viewport.
 *
 * ⚠️ The mock backend lives in the page: a `page.goto` or reload restarts it
 * and throws away anything written by clicking. So tests that need data across
 * a reload use the `seedLedgerHistory` fixture (12 credits of 1…12 Diamonds on
 * `usr_000001`, one a day, ending yesterday), and tests that write (adjust,
 * approve) move within the app afterwards instead of reloading.
 */

const LEDGER = '/diamonds/wallet-transactions'
const FIXTURE_USER = 'usr_000001'
const FINANCE = `/users/${FIXTURE_USER}?tab=finance`

/** Tests whose subject is behaviour, not layout: two viewports are enough. */
function behaviourOnly(projectName: string) {
  test.skip(
    !['mobile-360', 'desktop-1440'].includes(projectName),
    'Behaviour check — run at the phone and desktop extremes only.',
  )
}

/**
 * Below `lg` the filters live in a bottom sheet behind a "Filters" button.
 * Returns where the controls are, and how to put them away again.
 */
async function openFilters(
  page: Page,
): Promise<{ panel: Locator; close: () => Promise<void> }> {
  const trigger = page.getByRole('button', { name: /^Filters/ })
  if (await trigger.isVisible()) {
    await trigger.click()
    const sheet = page.getByRole('dialog', { name: 'Filters' })
    await expect(sheet).toBeVisible()
    return {
      panel: sheet,
      close: async () => {
        await sheet.getByRole('button', { name: 'Show results' }).click()
        await expect(sheet).toBeHidden()
      },
    }
  }
  return { panel: page.getByRole('main'), close: async () => {} }
}

/** The entry links in the ledger list — on the table and on cards alike. */
function entryLinks(page: Page): Locator {
  return page.locator(`main a[href^="${LEDGER}/"]`)
}

function historySection(page: Page): Locator {
  return page.getByRole('region', { name: 'Wallet history' })
}

function historyRows(page: Page): Locator {
  return page.getByRole('list', { name: 'Newest wallet entries' }).getByRole('listitem')
}

/** Inside the app, without a reload — keeps the in-page mock's writes. */
async function goWithinApp(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to)
    dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

/* ------------------------------------------------------------------ *
 * Layout — every viewport
 * ------------------------------------------------------------------ */

test.describe('layout', () => {
  test('the ledger fits, long notes and emails included', async ({ page }) => {
    await seedLedgerHistory(page)
    await signIn(page)
    await page.goto(LEDGER)
    await expect(
      page.getByRole('heading', { name: 'Wallet transactions', level: 1 }),
    ).toBeVisible()
    /* The fixture's newest row carries a 90-character unbroken reference. */
    await expect(page.getByText(/Goodwill credit after a long dispute/)).toBeVisible()
    await expectNoSidewaysScroll(page)
  })

  test('an entry fits, with its long note', async ({ page }) => {
    await seedLedgerHistory(page)
    await signIn(page)
    await page.goto(`${LEDGER}/cmvtx_hist_12`)
    await expect(
      page.getByRole('heading', { name: 'Adjustment', level: 1 }),
    ).toBeVisible()
    await expect(page.getByText('+12').first()).toBeVisible()
    await expect(page.getByText(/Goodwill credit after a long dispute/)).toBeVisible()
    await expectNoSidewaysScroll(page)
  })

  test('the Finance tab history and its pager fit', async ({ page }) => {
    await seedLedgerHistory(page)
    await signIn(page)
    await page.goto(FINANCE)
    await expect(historyRows(page)).toHaveCount(5)
    await expect(
      historySection(page).getByRole('navigation', { name: 'Pagination' }),
    ).toBeVisible()
    await expectNoSidewaysScroll(page)
  })
})

/* ------------------------------------------------------------------ *
 * The ledger page (T2) and the entry page (T3)
 * ------------------------------------------------------------------ */

test.describe('the ledger', () => {
  test.beforeEach(() => behaviourOnly(test.info().project.name))

  test('filters round-trip through the URL, a reload and back/forward', async ({
    page,
  }) => {
    await seedLedgerHistory(page)
    await signIn(page)
    await page.goto(LEDGER)
    await expect(entryLinks(page).first()).toBeVisible()

    const filters = await openFilters(page)
    await filters.panel.getByLabel('Type').click()
    await page.getByRole('option', { name: 'Adjustment', exact: true }).click()
    await filters.close()
    await expect(page).toHaveURL(/type=ADMIN_ADJUSTMENT/)

    const search = page.getByRole('searchbox').first()
    await search.fill('Fixture credit')
    await search.press('Enter')
    await expect(page).toHaveURL(/search=Fixture\+credit/)
    await expect(page.getByRole('button', { name: 'Remove Type filter' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Remove Search filter' }),
    ).toBeVisible()

    /* Survives a refresh. */
    await page.reload()
    await expect(page).toHaveURL(/type=ADMIN_ADJUSTMENT/)
    await expect(
      page.getByRole('button', { name: 'Remove Search filter' }),
    ).toBeVisible()
    /* 11 "Fixture credit number N" rows; the 12th has the long note. */
    await expect(page.getByText(/Showing 1–11 of 11/)).toBeVisible()

    /* Into an entry, then browser back and forward. */
    const filteredUrl = page.url()
    await entryLinks(page).first().click()
    await expect(page).toHaveURL(new RegExp(`${LEDGER}/cmvtx_hist_`))
    await page.goBack()
    await expect(page).toHaveURL(filteredUrl)
    await expect(page.getByRole('button', { name: 'Remove Type filter' })).toBeVisible()
    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`${LEDGER}/cmvtx_hist_`))

    /* The entry's own back link restores the same view. */
    await page
      .getByRole('main')
      .getByRole('link', { name: 'Wallet transactions', exact: true })
      .click()
    await expect(page).toHaveURL(filteredUrl)
  })

  test('a date range in Bangladesh time sends the right UTC bounds', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto(LEDGER)
    await expect(entryLinks(page).first()).toBeVisible()

    const filters = await openFilters(page)
    const panel = filters.panel
    const from = page.waitForRequest(
      (request) =>
        request.url().includes('/admin/wallet/transactions?') &&
        request.url().includes('startDate='),
    )
    await panel.getByLabel('From').fill('2026-10-31')
    const fromUrl = new URL((await from).url())
    /* 31 Oct, 00:00 in Dhaka (GMT+6) is 30 Oct, 18:00 UTC. */
    expect(fromUrl.searchParams.get('startDate')).toBe('2026-10-30T18:00:00.000Z')

    const to = page.waitForRequest(
      (request) =>
        request.url().includes('/admin/wallet/transactions?') &&
        request.url().includes('endDate='),
    )
    await panel.getByLabel('To').fill('2026-10-31')
    const toUrl = new URL((await to).url())
    expect(toUrl.searchParams.get('startDate')).toBe('2026-10-30T18:00:00.000Z')
    /* …and the day ends at 23:59:59.999 in Dhaka. */
    expect(toUrl.searchParams.get('endDate')).toBe('2026-10-31T17:59:59.999Z')
    await filters.close()

    await expect(page).toHaveURL(/fromDate=2026-10-31&toDate=2026-10-31/)
  })

  test('an entry names its account and its source, and goes back', async ({ page }) => {
    await seedLedgerHistory(page)
    await signIn(page)
    await page.goto(`${LEDGER}?userId=${FIXTURE_USER}`)
    await expect(entryLinks(page).first()).toHaveAttribute('href', /cmvtx_hist_12$/)
    await entryLinks(page).first().click()

    await expect(
      page.getByRole('heading', { name: 'Adjustment', level: 1 }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
    /* Names, never raw ids, on the face of the page. */
    await expect(page.getByRole('main').getByText(FIXTURE_USER)).toBeHidden()
    await page
      .getByRole('main')
      .getByRole('link', { name: 'Wallet transactions', exact: true })
      .click()
    await expect(page).toHaveURL(new RegExp(`${LEDGER}\\?userId=${FIXTURE_USER}$`))
  })
})

/* ------------------------------------------------------------------ *
 * The Finance tab history (T4, paged)
 * ------------------------------------------------------------------ */

test.describe('the Finance tab history', () => {
  test.beforeEach(() => behaviourOnly(test.info().project.name))

  test('pages 5 at a time, switches to 10, and keeps both in the URL', async ({
    page,
  }) => {
    await seedLedgerHistory(page)
    await signIn(page)
    await page.goto(FINANCE)
    const section = historySection(page)

    /* 5 by default, newest first. */
    await expect(historyRows(page)).toHaveCount(5)
    await expect(historyRows(page).first()).toContainText('+12')
    await expect(section.getByText('Showing 1–5 of 12')).toBeVisible()
    await expect(page).not.toHaveURL(/walletPage|walletSize/)

    await section.getByRole('button', { name: 'Next page' }).click()
    await expect(page).toHaveURL(/walletPage=2/)
    await expect(historyRows(page).first()).toContainText('+7')
    await expect(section.getByText('Showing 6–10 of 12')).toBeVisible()
    await section.getByRole('button', { name: 'Previous page' }).click()
    await expect(page).not.toHaveURL(/walletPage/)
    await expect(section.getByText('Showing 1–5 of 12')).toBeVisible()

    /* 10 per page; a new size starts again at page 1. */
    await section.getByRole('button', { name: 'Next page' }).click()
    await expect(page).toHaveURL(/walletPage=2/)
    await expect(section.getByText('Showing 6–10 of 12')).toBeVisible()
    await section.getByRole('combobox', { name: 'Rows per page' }).click()
    await page.getByRole('option', { name: '10', exact: true }).click()
    await expect(page).toHaveURL(/walletSize=10/)
    await expect(page).not.toHaveURL(/walletPage/)
    await expect(historyRows(page)).toHaveCount(10)
    await expect(section.getByText('Showing 1–10 of 12')).toBeVisible()

    /* Survives a refresh. */
    await section.getByRole('button', { name: 'Next page' }).click()
    await expect(page).toHaveURL(
      /walletPage=2&walletSize=10|walletSize=10&walletPage=2/,
    )
    await page.reload()
    await expect(historyRows(page)).toHaveCount(2)
    await expect(historySection(page).getByText('Showing 11–12 of 12')).toBeVisible()

    /* And back to 5. */
    await historySection(page).getByRole('combobox', { name: 'Rows per page' }).click()
    await page.getByRole('option', { name: '5', exact: true }).click()
    await expect(page).not.toHaveURL(/walletSize|walletPage/)
    await expect(historyRows(page)).toHaveCount(5)
  })

  test('back from an entry on page 2 lands on page 2', async ({ page }) => {
    await seedLedgerHistory(page)
    await signIn(page)
    await page.goto(`${FINANCE}&walletPage=2&walletSize=5`)
    /* An explicit default size is read, then simply not written back. */
    await expect(historySection(page).getByText('Showing 6–10 of 12')).toBeVisible()

    await historyRows(page).first().getByRole('link', { name: 'Adjustment' }).click()
    await expect(page).toHaveURL(new RegExp(`${LEDGER}/cmvtx_hist_07$`))

    const back = page.getByRole('main').getByRole('link').first()
    await expect(back).toHaveAttribute('href', `${FINANCE}&walletPage=2`)
    await back.click()
    await expect(page).toHaveURL(new RegExp(`tab=finance&walletPage=2$`))
    await expect(historySection(page).getByText('Showing 6–10 of 12')).toBeVisible()
  })

  test('a page past the end says so, and offers the first page', async ({ page }) => {
    await seedLedgerHistory(page)
    await signIn(page)
    await page.goto(`${FINANCE}&walletPage=9`)
    await expect(
      historySection(page).getByText('This page is past the end of the history.'),
    ).toBeVisible()
    await historySection(page)
      .getByRole('button', { name: 'Go to the first page' })
      .click()
    await expect(page).not.toHaveURL(/walletPage/)
    await expect(historyRows(page)).toHaveCount(5)
  })

  test('an adjustment appears at once, without a reload', async ({ page }) => {
    await seedLedgerHistory(page)
    await signIn(page)
    await page.goto(FINANCE)
    await expect(historyRows(page).first()).toContainText('+12')

    await page.getByRole('button', { name: /adjust the diamond balance/i }).click()
    const form = page.getByRole('dialog', { name: /adjust diamond balance/i })
    await form.getByLabel(/^Amount/).fill('75')
    await form.getByLabel(/^Note/).fill('Compensation for a dropped call.')
    await form.getByRole('button', { name: /review adjustment/i }).click()
    const confirm = page.getByRole('dialog', { name: /credit this wallet/i })
    await confirm.getByLabel(/type/i).fill('75')
    await confirm.getByRole('button', { name: /credit the wallet/i }).click()

    await expect(historyRows(page).first()).toContainText('+75')
    await expect(historySection(page).getByText('Showing 1–5 of 13')).toBeVisible()
  })
})

/* ------------------------------------------------------------------ *
 * Host / User badges (T0)
 * ------------------------------------------------------------------ */

test.describe('badges', () => {
  test.beforeEach(() => behaviourOnly(test.info().project.name))

  test('hosts and users are badged in the list and on the record', async ({ page }) => {
    /*
     * ⚠️ Not via `?host=host`: that filter reads the Live hosts roster, which
     * the mock leaves empty (plan.md T0 deviation), so locally it lists no one.
     * The seeded directory badges from `isHost`, and page 1 has both kinds.
     */
    await signIn(page)
    await page.goto('/users')
    const main = page.getByRole('main')
    await expect(main.getByText(/^Showing 1–/)).toBeVisible()
    /* The records only — the table's own "User" column header is not a badge. */
    const isTable = await page.getByRole('table').isVisible()
    const records = isTable ? main.locator('tbody tr') : main.locator('ul > li')
    const hostRecord = records
      .filter({ has: page.getByText('Host', { exact: true }) })
      .first()
    await expect(hostRecord).toBeVisible()
    await expect(
      records.filter({ has: page.getByText('User', { exact: true }) }).first(),
    ).toBeVisible()

    /* On the record, the Host badge links to the Live hosts roster. */
    if (isTable) await hostRecord.click()
    else await hostRecord.getByRole('button', { name: /^View / }).click()
    await expect(page).toHaveURL(/\/users\/usr_/)
    await expect(main.getByRole('link', { name: /^Host/ })).toHaveAttribute(
      'href',
      '/hosts',
    )
  })
})

/* ------------------------------------------------------------------ *
 * Connections (T5)
 * ------------------------------------------------------------------ */

test.describe('connections', () => {
  test.beforeEach(() => behaviourOnly(test.info().project.name))

  test('an approved top-up opens its wallet entry, and back returns to the queue', async ({
    page,
  }) => {
    await seedWalletFixtures(page)
    await signIn(page)
    await page.goto('/diamonds/top-ups')

    /* Pending: decisions, and no wallet entry yet. */
    await page.getByText('Rakibul Khan').first().click()
    const drawer = page.getByRole('dialog').filter({ hasText: 'How it was paid' })
    await expect(drawer.getByRole('button', { name: 'Approve' })).toBeVisible()
    await expect(drawer.getByRole('link', { name: /See wallet entry/ })).toHaveCount(0)

    await drawer.getByRole('button', { name: 'Approve' }).click()
    await page
      .getByRole('dialog', { name: /approve this payment/i })
      .getByRole('button', { name: /approve and credit/i })
      .click()
    await expect(
      page.getByRole('dialog', { name: /approve this payment/i }),
    ).toBeHidden()

    /* Reopened from the approved view — within the app, so the write stays. */
    await goWithinApp(page, '/diamonds/top-ups?status=APPROVED')
    await page.getByText('Rakibul Khan').first().click()
    await drawer.getByRole('link', { name: /See wallet entry/ }).click()

    await expect(page).toHaveURL(new RegExp(`${LEDGER}/cmvtx_top_`))
    await expect(page.getByRole('heading', { name: 'Top-up', level: 1 })).toBeVisible()
    await expect(page.getByText('+2,750').first()).toBeVisible()

    await page
      .getByRole('main')
      .getByRole('link', { name: 'Top-up requests', exact: true })
      .click()
    await expect(page).toHaveURL(/\/diamonds\/top-ups\?status=APPROVED$/)
  })

  test('a rejected request, or one with no wallet row, offers no entry', async ({
    page,
  }) => {
    await seedWalletFixtures(page)
    await signIn(page)
    await page.goto('/diamonds/top-ups?status=REJECTED')
    await page.getByText('Imran').first().click()
    const drawer = page.getByRole('dialog').filter({ hasText: 'How it was paid' })
    await expect(drawer.getByText(/already been reviewed/)).toBeVisible()
    await expect(drawer.getByRole('link', { name: /See wallet entry/ })).toHaveCount(0)
    await page.keyboard.press('Escape')

    /* Approved before the mock ledger existed: said plainly, not a dead link. */
    await page.goto('/diamonds/top-ups?status=APPROVED')
    await page.getByText('Nabila').first().click()
    await expect(
      drawer.getByText('No wallet entry was found for this payment.'),
    ).toBeVisible()
  })

  test('a user row opens that person’s wallet history', async ({ page }) => {
    await signIn(page)
    await page.goto('/users')
    const more = page.getByRole('button', { name: /^More for / }).first()
    await expect(more).toBeVisible()

    /* On cards, opening the record stays one tap. */
    if (!(await page.getByRole('table').isVisible())) {
      await expect(page.getByRole('button', { name: /^View / }).first()).toBeVisible()
    }

    await more.click()
    await expect(page.getByRole('menuitem', { name: 'Open record' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Wallet history' }).click()
    await expect(page).toHaveURL(new RegExp(`${LEDGER}\\?userId=usr_`))
    await expect(
      page.getByRole('button', { name: 'Remove Account filter' }),
    ).toBeVisible()
  })

  test('a gift opens the sender’s gift spends that day', async ({ page }) => {
    await signIn(page)
    await page.goto('/diamonds/transactions')
    /*
     * "call chat" also spent gifts on that day in the mock wallet; the first
     * row's sender did not, so its link (correctly) finds nothing. Wait for
     * the list to settle first — clicking mid-render hit the row above.
     */
    await expect(page.getByText('Chocolate Box (as sent)').first()).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page
      .getByRole('link', { name: 'Wallet entries for gifts call chat sent that day' })
      .first()
      .click()

    await expect(page).toHaveURL(
      /userId=[^&]+&type=GIFT_SENT&fromDate=(\d{4}-\d{2}-\d{2})&toDate=\1/,
    )
    await expect(entryLinks(page).first()).toBeVisible()
    /* Only gift spends: every row's type reads "Gift sent". */
    const types = page
      .getByRole('main')
      .getByText(/^(Adjustment|Top-up|Earnings converted)$/)
    await expect(types).toHaveCount(0)
  })
})

/* ------------------------------------------------------------------ *
 * Role matrix
 * ------------------------------------------------------------------ */

test.describe('who sees what', () => {
  test.beforeEach(() => behaviourOnly(test.info().project.name))

  test('an Admin has the ledger, the history and every connection', async ({
    page,
  }) => {
    await seedLedgerHistory(page)
    await seedWalletFixtures(page)
    await signIn(page, ACCOUNTS.admin)

    await page.goto(LEDGER)
    await expect(entryLinks(page).first()).toBeVisible()

    await page.goto(FINANCE)
    await expect(historyRows(page)).toHaveCount(5)

    await page.goto('/users')
    await expect(page.getByRole('button', { name: /^More for / }).first()).toBeVisible()

    await page.goto('/diamonds/transactions')
    await expect(
      page.getByRole('link', { name: /^Wallet entries for gifts/ }).first(),
    ).toBeVisible()

    await page.goto('/diamonds/top-ups?status=APPROVED')
    await page.getByText('Nabila').first().click()
    await expect(
      page
        .getByRole('dialog')
        .filter({ hasText: 'How it was paid' })
        .getByText('No wallet entry was found for this payment.'),
    ).toBeVisible()
  })

  test('a Moderator has none of it, and is never shown a way in', async ({ page }) => {
    await seedLedgerHistory(page)
    await signIn(page, ACCOUNTS.moderator)

    for (const path of [LEDGER, `${LEDGER}/cmvtx_hist_12`, '/diamonds/transactions']) {
      await page.goto(path)
      await expect(page.getByText(/do not have access/i)).toBeVisible()
      await expect(page.getByText(/Goodwill credit/)).toHaveCount(0)
    }

    await page.goto(FINANCE)
    await expect(
      page.getByRole('tab', { name: 'Finance', selected: true }),
    ).toBeVisible()
    await expect(page.getByText('Diamond summary')).toBeVisible()
    await expect(historySection(page)).toHaveCount(0)

    await page.goto('/users')
    await expect(page.getByText(/Showing 1–/)).toBeVisible()
    await expect(page.getByRole('button', { name: /^More for / })).toHaveCount(0)
  })
})
