import { expect, test, type Locator, type Page } from '@playwright/test'

import { ACCOUNTS, expectNoSidewaysScroll, seedHostFixtures, signIn } from './fixtures'

/**
 * Host withdrawals, phase W6 (plan.md), in a real browser at every width.
 *
 * ⚠️ Mock state lives in the page: `page.goto` reloads the app and resets the
 * seed, so each action test opens its request once and stays in the app.
 *
 * The seed (src/mocks/handlers/withdrawals.ts):
 * - Rakibul Haque: PENDING 1,000 💎 (bKash), plus paid/rejected/cancelled history
 * - Nusrat Jahan: PENDING 25,000 💎 (Nagad), and one PAID
 * - DJ Tanvir: APPROVED 12,000 💎 to a bank account held by "Shahriar Kabir",
 *   renamed since — the name-mismatch and changed-account warnings
 */

const RAKIB_PENDING = '/withdrawals/cmw0nfxln003m01n65dvdyydw'
const NUSRAT_PENDING = '/withdrawals/cmwnusratpending00000000001'
const TANVIR_APPROVED = '/withdrawals/cmwtanvirapproved000000001'

function main(page: Page): Locator {
  return page.getByRole('main')
}

function region(page: Page, name: string): Locator {
  return main(page).getByRole('region', { name, exact: true })
}

async function open(page: Page, path: string, account: string = ACCOUNTS.superAdmin) {
  await signIn(page, account)
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Withdrawal/)
}

/* ------------------------------------------------------------------ */

test.describe('list', () => {
  test('opens on Pending, fits at this width, and every tab loads', async ({
    page,
  }) => {
    await open(page, '/withdrawals')
    await expect(main(page).getByText('2 pending requests found.')).toBeAttached()
    await expect(
      main(page).getByRole('link', { name: 'Nusrat Jahan' }).first(),
    ).toBeVisible()
    await expect(
      main(page).getByRole('link', { name: 'Rakibul Haque' }).first(),
    ).toBeVisible()
    await expectNoSidewaysScroll(page)

    await main(page).getByRole('tab', { name: /^Paid/ }).click()
    await expect(page).toHaveURL(/status=PAID/)
    await expect(main(page).getByText('2 paid requests found.')).toBeAttached()
    await expectNoSidewaysScroll(page)

    await main(page).getByRole('tab', { name: /^All/ }).click()
    await expect(main(page).getByText('7 requests found.')).toBeAttached()
  })

  test('a counter opens its tab', async ({ page }) => {
    await open(page, '/withdrawals?status=ALL')
    await main(page)
      .getByRole('button', { name: /^Approved, not paid yet/ })
      .click()
    await expect(page).toHaveURL(/status=APPROVED/)
    await expect(main(page).getByText('1 approved requests found.')).toBeAttached()
  })

  test('search and an unknown status in the URL', async ({ page }) => {
    await open(page, '/withdrawals?status=ALL&search=BKASH_TRX')
    await expect(main(page).getByText('1 requests found.')).toBeAttached()
    await page.goto('/withdrawals?status=bogus')
    // An unknown status falls back to Pending instead of failing the page.
    await expect(main(page).getByText('2 pending requests found.')).toBeAttached()
  })

  test('a row opens the request and Back returns to the same view', async ({
    page,
  }) => {
    await open(page, '/withdrawals?status=ALL&sortBy=amount')
    await main(page).getByRole('link', { name: 'DJ Tanvir' }).first().click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Withdrawal by DJ Tanvir',
    )
    await main(page).getByRole('link', { name: 'Withdrawals' }).first().click()
    await expect(page).toHaveURL(/status=ALL&sortBy=amount/)
  })
})

/* ------------------------------------------------------------------ */

test.describe('detail', () => {
  test('the account to pay, with both warnings, fits at this width', async ({
    page,
  }) => {
    await open(page, TANVIR_APPROVED)
    const payTo = region(page, 'Pay to')
    await expect(payTo).toContainText('Bank transfer')
    await expect(payTo).toContainText('1052101004589')
    await expect(payTo).toContainText('Dutch-Bangla Bank PLC')
    await expect(payTo).toContainText('does not look like the host’s name')
    await expect(payTo).toContainText('has since changed this saved account')
    await expect(region(page, 'Withdrawal')).toContainText('৳120.00')
    await expectNoSidewaysScroll(page)
  })

  test('an unknown id says so', async ({ page }) => {
    await open(page, '/withdrawals/does-not-exist')
    await expect(main(page).getByText('Withdrawal not found')).toBeVisible()
  })
})

/* ------------------------------------------------------------------ */

test.describe('actions', () => {
  test('approve, then mark as paid with a TrxID', async ({ page }) => {
    await open(page, RAKIB_PENDING)
    await main(page).getByRole('button', { name: 'Approve' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('01711111111')
    await dialog.getByRole('button', { name: 'Approve' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(region(page, 'Withdrawal')).toContainText('Approved. Send ৳10.00')

    await main(page).getByRole('button', { name: 'Mark as paid' }).click()
    // Too short: the dialog stays open.
    await dialog.getByRole('textbox', { name: /Transaction ID/ }).fill('AB')
    await dialog.getByRole('button', { name: 'Mark as paid' }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox', { name: /Transaction ID/ }).fill('BK9X2L7P1Q')
    await dialog.getByRole('button', { name: 'Mark as paid' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(region(page, 'Withdrawal')).toContainText('Paid. Nothing more to do.')
    await expect(region(page, 'Timeline')).toContainText('BK9X2L7P1Q')
    await expect(
      main(page).getByRole('group', { name: 'Withdrawal actions' }),
    ).toHaveCount(0)
  })

  test('reject with a reason refunds the host', async ({ page }) => {
    await open(page, NUSRAT_PENDING)
    await expect(region(page, 'Host')).toContainText('48,200')
    await main(page).getByRole('button', { name: 'Reject' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Reject and refund' }).click()
    await expect(dialog).toBeVisible()
    await dialog
      .getByRole('textbox', { name: /Reason the host sees/ })
      .fill('Please add a payout account in your own name.')
    await dialog.getByRole('button', { name: 'Reject and refund' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(region(page, 'Withdrawal')).toContainText(
      'Reason given to the host: Please add a payout account in your own name.',
    )
    // 48,200 + 25,000 back.
    await expect(region(page, 'Host')).toContainText('73,200')
  })
})

/* ------------------------------------------------------------------ */

test.describe('settings', () => {
  test('a change is confirmed old → new and saved', async ({ page }) => {
    await open(page, '/withdrawals/settings')
    const min = main(page).getByRole('textbox', { name: 'Minimum withdrawal' })
    await expect(min).toHaveValue('500')
    await expect(main(page).getByText(/gets ৳10\.00/)).toBeVisible()

    await min.fill('2000')
    await main(page).getByRole('textbox', { name: 'Maximum withdrawal' }).fill('1000')
    await main(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(
      main(page).getByText('The maximum must be at least the minimum.'),
    ).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await main(page).getByRole('textbox', { name: 'Maximum withdrawal' }).fill('150000')
    await main(page).getByRole('button', { name: 'Save changes' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Minimum withdrawal:')
    await expect(dialog).toContainText('2,000 diamonds')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(min).toHaveValue('2000')
    await expectNoSidewaysScroll(page)
  })

  test('turning withdrawals off asks louder', async ({ page }) => {
    await open(page, '/withdrawals/settings')
    await main(page).getByRole('switch').click()
    await main(page).getByRole('button', { name: 'Save changes' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('No host will be able to request a withdrawal')
    await dialog.getByRole('button', { name: 'Turn withdrawals off' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(main(page).getByText('Withdrawals are off')).toBeVisible()
  })
})

/* ------------------------------------------------------------------ */

test.describe('roles', () => {
  test('Admin: reads everything, acts on nothing', async ({ page }) => {
    await open(page, RAKIB_PENDING, ACCOUNTS.admin)
    await expect(region(page, 'Pay to')).toBeVisible()
    await expect(
      main(page).getByRole('group', { name: 'Withdrawal actions' }),
    ).toHaveCount(0)
    await page.goto('/withdrawals/settings')
    await expect(
      main(page).getByText('Only a Super Admin can change these settings.'),
    ).toBeVisible()
    await expect(main(page).getByRole('button', { name: 'Save changes' })).toHaveCount(
      0,
    )
  })

  test('Moderator: the route is barred, not blank', async ({ page }) => {
    await signIn(page, ACCOUNTS.moderator)
    await page.goto('/withdrawals')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
  })
})

/* ------------------------------------------------------------------ */

test.describe('cross-links and export (W5)', () => {
  test('Export CSV downloads every request in the view, account cut to 4 digits', async ({
    page,
  }) => {
    await open(page, '/withdrawals?status=ALL')
    await main(page).getByRole('button', { name: 'Export CSV' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('not recorded in the audit log')
    await expect(dialog).toContainText('Tab: All')
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Generate export' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^withdrawals-all-\d{4}-\d{2}-\d{2}\.csv$/)
    const chunks = (await (await file.createReadStream()).toArray()) as Uint8Array[]
    const decoder = new TextDecoder('utf-8')
    const csv =
      chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') +
      decoder.decode()
    const lines = csv.trim().split(/\r\n/)
    expect(lines).toHaveLength(1 + 7)
    expect(lines[0]).toContain('Net payout BDT')
    // DJ Tanvir's bank account 1052101004589: only 4589 leaves the panel.
    expect(csv).toContain('4589')
    expect(csv).not.toContain('1052101004589')
  })

  test('the dashboard card counts the queue and opens it', async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    const card = main(page).getByRole('link', { name: /Waiting for review/ })
    await expect(card).toContainText('2')
    await card.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Withdrawals')
    await expect(main(page).getByText('2 pending requests found.')).toBeAttached()
  })

  test('a host on the roster links to their withdrawals', async ({ page }) => {
    await seedHostFixtures(page)
    await signIn(page, ACCOUNTS.superAdmin)
    await page.goto('/hosts')
    await main(page)
      .getByRole('link', { name: 'Withdrawals', exact: true })
      .first()
      .click()
    await expect(page).toHaveURL(/\/withdrawals\?status=ALL&userId=/)
  })

  test('closing a dialog returns focus to its button; after approve, to the next action', async ({
    page,
  }) => {
    await open(page, RAKIB_PENDING)
    const approve = main(page).getByRole('button', { name: 'Approve' })
    await approve.click()
    await page.keyboard.press('Escape')
    await expect(approve).toBeFocused()

    await approve.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click()
    await expect(main(page).getByRole('button', { name: 'Mark as paid' })).toBeFocused()
  })
})
