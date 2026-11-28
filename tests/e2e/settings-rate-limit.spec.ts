import { expect, test, type Page, type Request } from '@playwright/test'
import axe from 'axe-core'

import { ACCOUNTS, expectNoSidewaysScroll, signIn } from './fixtures'

/**
 * Rate limiting & OTP security (plan.md RL1), against the MSW mock.
 *
 * Asserts the **outgoing body**: `{}` answers 200 and changes nothing, so a
 * save that sent the wrong keys would still report success.
 */

const PATH = '/settings/rate-limiting'

function captureWrites(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request: Request) => {
    if (
      request.method() === 'PATCH' &&
      request.url().includes('/admin/settings/rate-limiting')
    ) {
      bodies.push(request.postDataJSON() as Record<string, unknown>)
    }
  })
  return bodies
}

async function open(page: Page, account: string = ACCOUNTS.superAdmin) {
  await signIn(page, account)
  await page.goto(PATH)
  await expect(
    page.getByRole('heading', { name: 'OTP & SMS protection' }),
  ).toBeVisible()
}

function card(page: Page, name: string) {
  return page.locator('form').filter({ has: page.getByRole('heading', { name }) })
}

test('shows the eight values the record holds, with units and ranges', async ({
  page,
}) => {
  await open(page)

  await expect(page.getByLabel('Resend cooldown')).toHaveValue('60')
  await expect(page.getByLabel('Max wrong attempts')).toHaveValue('5')
  await expect(page.getByLabel('Codes per phone')).toHaveValue('3')
  await expect(page.getByLabel('Quota window')).toHaveValue('15')
  await expect(page.getByLabel('General API limit')).toHaveValue('120')
  await expect(page.getByLabel('General limit window')).toHaveValue('60')
  await expect(page.getByLabel('Sign-in limit', { exact: true })).toHaveValue('10')
  await expect(page.getByLabel('Sign-in limit window')).toHaveValue('60')

  await expect(page.getByText('5–600 seconds.')).toBeVisible()
  await expect(page.getByText(/Google Play reviewer numbers/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Save changes' }).first(),
  ).toBeDisabled()
  await expectNoSidewaysScroll(page)
})

test('names itself in the page heading', async ({ page }) => {
  await open(page)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Rate limiting & OTP' }),
  ).toBeVisible()
})

test('sends only the changed field, as a number, and confirms', async ({ page }) => {
  const writes = captureWrites(page)
  await open(page)

  const otp = card(page, 'OTP & SMS protection')
  await page.getByLabel('Resend cooldown').fill('45')
  await otp.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByText(/rate limiting settings updated/i)).toBeVisible()
  expect(writes).toEqual([{ otpCooldownSeconds: 45 }])
  await expect(otp.getByRole('button', { name: 'Save changes' })).toBeDisabled()

  await page.reload()
  await expect(page.getByLabel('Resend cooldown')).toHaveValue('45')
})

test('an out-of-range or non-whole value is refused before sending', async ({
  page,
}) => {
  const writes = captureWrites(page)
  await open(page)

  const otp = card(page, 'OTP & SMS protection')
  const cooldown = page.getByLabel('Resend cooldown')

  await cooldown.fill('4')
  await cooldown.blur()
  await expect(otp.getByText('The lowest allowed is 5.')).toBeVisible()
  await expect(cooldown).toHaveAttribute('aria-invalid', 'true')
  await expect(otp.getByRole('button', { name: 'Save changes' })).toBeDisabled()

  await cooldown.fill('9.5')
  await expect(otp.getByText('Enter a whole number.')).toBeVisible()

  await cooldown.fill('601')
  await expect(otp.getByText('The highest allowed is 600.')).toBeVisible()

  await otp.getByRole('button', { name: 'Discard' }).click()
  await expect(cooldown).toHaveValue('60')
  expect(writes).toEqual([])
})

test('a server rejection lands on the field it names', async ({ page }) => {
  await open(page)

  /*
   * The client refuses every value the server would, so the server's own
   * messages are forced through the mock's one-shot switch.
   */
  await page.evaluate(() => {
    globalThis.__mockRateLimit?.rejectNext(
      'body/globalRateLimitMax Minimum global rate limit is 10, body/authRateLimitMax Minimum auth rate limit is 3',
    )
  })

  const traffic = card(page, 'API traffic limits')
  await page.getByLabel('General API limit').fill('100')
  await page.getByLabel('Sign-in limit', { exact: true }).fill('8')
  await traffic.getByRole('button', { name: 'Save changes' }).click()

  await expect(traffic.getByText('Minimum global rate limit is 10')).toBeVisible()
  await expect(traffic.getByText('Minimum auth rate limit is 3')).toBeVisible()
  /* Field-mapped, so not repeated as a card-level alert. */
  await expect(
    traffic.getByRole('alert').filter({ hasText: /could not be saved/ }),
  ).toHaveCount(0)
})

test('saving one card keeps unsaved edits in the other', async ({ page }) => {
  await open(page)

  await page.getByLabel('Codes per phone').fill('4')
  await page.getByLabel('General API limit').fill('200')
  await card(page, 'API traffic limits')
    .getByRole('button', { name: 'Save changes' })
    .click()

  await expect(page.getByText(/rate limiting settings updated/i)).toBeVisible()
  await expect(page.getByLabel('General API limit')).toHaveValue('200')
  await expect(page.getByLabel('Codes per phone')).toHaveValue('4')
  await expect(
    card(page, 'OTP & SMS protection').getByRole('button', { name: 'Save changes' }),
  ).toBeEnabled()
})

test('an Admin without the edit grant sees the values read-only', async ({ page }) => {
  await open(page, ACCOUNTS.admin)

  await expect(page.getByText(/You can view these limits/)).toBeVisible()
  await expect(page.getByLabel('Resend cooldown')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
})

test('a Moderator is refused', async ({ page }) => {
  await signIn(page, ACCOUNTS.moderator)
  await page.goto(PATH)
  await expect(page.getByText(/do not have access/i)).toBeVisible()
  await expect(page.getByLabel('Resend cooldown')).toHaveCount(0)
})

test('on a laptop or larger, the cards sit side by side; from 1440, Save is on screen', async ({
  page,
  viewport,
}) => {
  test.skip((viewport?.width ?? 0) < 1024, 'The cards stack below lg.')
  await open(page)

  const otp = card(page, 'OTP & SMS protection')
  const traffic = card(page, 'API traffic limits')
  const [a, b] = [await otp.boundingBox(), await traffic.boundingBox()]
  /* Side by side: same top, different columns. */
  expect(Math.abs((a?.y ?? 0) - (b?.y ?? 1))).toBeLessThan(2)
  expect(b?.x ?? 0).toBeGreaterThan((a?.x ?? 0) + (a?.width ?? 0) - 1)

  /*
   * Both Save buttons fully visible without scrolling — from 1440×900. At
   * 1024×768 the summaries added in RL2 push the OTP footer just below the
   * fold; the cards are still side by side there.
   */
  if ((viewport?.width ?? 0) < 1440) return
  for (const save of await page.getByRole('button', { name: 'Save changes' }).all()) {
    await expect(save).toBeInViewport({ ratio: 1 })
  }
})

/* ------------------------------------------------------------------ *
 * RL2 — summaries, warnings, lockout confirm, recommended defaults
 * ------------------------------------------------------------------ */

test('the summaries say what the numbers mean, and follow typing', async ({ page }) => {
  await open(page)

  const otp = page.getByTestId('rl-summary-otp')
  await expect(otp).toHaveText(
    'Each phone can get 3 codes every 15 minutes, at least 1 minute apart. 5 wrong tries and a code stops working.',
  )
  await expect(page.getByTestId('rl-summary-traffic')).toContainText(
    'Each IP address can make 120 requests every 1 minute (about 120 a minute)',
  )

  await page.getByLabel('Resend cooldown').fill('90')
  await expect(otp).toContainText('at least 1 minute 30 seconds apart')

  /* An invalid value leaves the last valid summary in place. */
  await page.getByLabel('Resend cooldown').fill('2')
  await expect(otp).toContainText('at least 1 minute apart')
})

test('an unreachable quota and loose limits are flagged, without blocking', async ({
  page,
}) => {
  await open(page)
  const otp = card(page, 'OTP & SMS protection')

  /* 3 codes, 10 minutes apart, in 15 minutes: only 2 can ever be sent. */
  await page.getByLabel('Resend cooldown').fill('600')
  await expect(otp.getByText(/the quota of 3 can never be reached/)).toBeVisible()
  await expect(otp.getByText(/only get 2 codes in 15 minutes/)).toBeVisible()
  await expect(otp.getByRole('button', { name: 'Save changes' })).toBeEnabled()

  await page.getByLabel('Resend cooldown').fill('10')
  await expect(otp.getByText(/raises SMS cost exposure/)).toBeVisible()
  await expect(otp.getByText(/can never be reached/)).toHaveCount(0)
})

test('tightening traffic below a safe rate asks first; Cancel sends nothing', async ({
  page,
}) => {
  const writes = captureWrites(page)
  await open(page)
  const traffic = card(page, 'API traffic limits')

  await page.getByLabel('General API limit').fill('30')
  await expect(traffic.getByText(/includes this admin panel/)).toBeVisible()
  await traffic.getByRole('button', { name: 'Save changes' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Tighten API traffic limits')).toBeVisible()
  await expect(dialog.getByText(/120\s*→\s*30\s*requests/)).toBeVisible()

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  expect(writes).toEqual([])

  await traffic.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Apply limits' }).click()
  await expect(page.getByText(/rate limiting settings updated/i)).toBeVisible()
  expect(writes).toEqual([{ globalRateLimitMax: 30 }])
})

test('loosening, or a change that stays safe, saves without asking', async ({
  page,
}) => {
  const writes = captureWrites(page)
  await open(page)
  const traffic = card(page, 'API traffic limits')

  await page.getByLabel('Sign-in limit', { exact: true }).fill('20')
  await traffic.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText(/rate limiting settings updated/i)).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(writes).toEqual([{ authRateLimitMax: 20 }])
})

test('"Use recommended" fills the defaults without saving', async ({ page }) => {
  const writes = captureWrites(page)
  await open(page)
  const otp = card(page, 'OTP & SMS protection')
  const recommended = otp.getByRole('button', { name: 'Use recommended' })

  /* The mock is seeded with the defaults. */
  await expect(recommended).toBeDisabled()

  await page.getByLabel('Resend cooldown').fill('9')
  await page.getByLabel('Codes per phone').fill('7')
  await expect(recommended).toBeEnabled()
  await recommended.click()

  await expect(page.getByLabel('Resend cooldown')).toHaveValue('60')
  await expect(page.getByLabel('Codes per phone')).toHaveValue('3')
  await expect(recommended).toBeDisabled()
  expect(writes).toEqual([])
})

/* ------------------------------------------------------------------ *
 * RL3 — accessibility
 * ------------------------------------------------------------------ */

/** axe over `main` (or the given root); contrast is measured in contrast.spec. */
async function axeViolations(page: Page, root = 'main'): Promise<string[]> {
  await page.addScriptTag({ content: axe.source })
  return page.evaluate(async (selector) => {
    const run = (
      window as unknown as {
        axe: {
          run: (
            context: Element,
            options: unknown,
          ) => Promise<{ violations: Array<{ id: string; nodes: unknown[] }> }>
        }
      }
    ).axe.run
    const result = await run(document.querySelector(selector) ?? document.body, {
      rules: { 'color-contrast': { enabled: false } },
      resultTypes: ['violations'],
    })
    return result.violations.map((v) => `${v.id} (${v.nodes.length})`)
  }, root)
}

test('axe finds nothing at rest, with errors and warnings shown, or in the dialog', async ({
  page,
}) => {
  await open(page)
  expect(await axeViolations(page)).toEqual([])

  const cooldown = page.getByLabel('Resend cooldown')
  await cooldown.fill('4')
  await cooldown.blur()
  await page.getByLabel('Codes per phone').fill('11')
  await page.getByLabel('General API limit').fill('30')
  await expect(page.getByText('The lowest allowed is 5.')).toBeVisible()
  await expect(page.getByText(/includes this admin panel/)).toBeVisible()
  expect(await axeViolations(page)).toEqual([])

  /* Field described by its error, so a screen reader hears it. */
  await expect(cooldown).toHaveAttribute(
    'aria-describedby',
    /rl-otpCooldownSeconds-error/,
  )

  await card(page, 'API traffic limits')
    .getByRole('button', { name: 'Save changes' })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await axeViolations(page, '[role="dialog"]')).toEqual([])
})

test('the read-only view has no axe violations', async ({ page }) => {
  await open(page, ACCOUNTS.admin)
  expect(await axeViolations(page)).toEqual([])
})
