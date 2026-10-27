import { expect, test } from '@playwright/test'

import {
  expectFocusRingNotClipped,
  expectNoSidewaysScroll,
  seedWalletFixtures,
  signIn,
} from './fixtures'

/**
 * The Diamond Wallet module in a real browser — phase W8.
 *
 * W1–W7 shipped on jsdom alone. What only geometry and a real engine can
 * answer:
 *
 *   - whether a **420-character transaction id** keeps the queue inside its
 *     own width at 360px;
 *   - whether the receipt is genuinely **unfetched** until asked — jsdom
 *     proves no `<img>` is mounted, a browser proves no request is made;
 *   - whether the money figures survive `Intl` in a real locale;
 *   - whether the confirm dialogs' **focus rings** survive their scrolling
 *     bodies, the defect that shipped twice before it was found.
 *
 * ⚠️ **The fixtures are opt-in.** Production holds zero requests and zero
 * packages, so the empty-state tests deliberately do not seed.
 */

const RAKIBUL = 'Rakibul Khan'
const NAMELESS = 'No account details'

test.describe('the top-up queue', () => {
  test('renders the seeded queue without sideways scroll', async ({ page }) => {
    await seedWalletFixtures(page)
    await signIn(page)
    await page.goto('/diamonds/top-ups')

    await expect(
      page.getByRole('heading', { name: 'Top-up requests', level: 1 }),
    ).toBeVisible()
    await expect(page.getByText(RAKIBUL)).toBeVisible()

    /*
     * The hostile row carries a 420-character unbroken transaction id and no
     * profile at all. It is the one that breaks a narrow track.
     */
    await expect(page.getByText(NAMELESS)).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('separates what a human verifies from what a gateway settled', async ({
    page,
  }) => {
    /*
     * ⚠️ The guide frames this queue as manual mobile-money review; the
     * server's enum carries STRIPE, GOOGLE_PLAY and APPLE_IAP (plan.md O7).
     * An operator who cannot tell them apart goes looking for a bank
     * statement entry that never existed.
     */
    await seedWalletFixtures(page)
    await signIn(page)
    await page.goto('/diamonds/top-ups')

    await expect(page.getByText('Settled by gateway')).toBeVisible()
    await expect(page.getByText('APPLE IAP')).toBeVisible()
  })

  test('a filter survives a reload, and a bad date never reaches the request', async ({
    page,
  }) => {
    /*
     * ⚠️ `?startDate=hello` answers 200 on the live backend and filters on it
     * (plan.md O6), so a typo in a pasted URL returns a quietly wrong set. The
     * guard is client-side, which means a real URL is the honest test of it.
     */
    const asked: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.endsWith('/admin/wallet/requests')) {
        asked.push(url.searchParams.get('startDate') ?? '')
      }
    })

    await seedWalletFixtures(page)
    await signIn(page)
    await page.goto('/diamonds/top-ups?status=PENDING&startDate=hello')

    await expect(page.getByText(RAKIBUL)).toBeVisible()
    await expect(page).toHaveURL(/status=PENDING/)
    expect(asked.every((value) => value === '')).toBe(true)

    await page.reload()
    await expect(page.getByText(RAKIBUL)).toBeVisible()
  })

  test('says the queue is empty, not that something failed', async ({ page }) => {
    await signIn(page)
    await page.goto('/diamonds/top-ups')

    await expect(page.getByText('No top-up requests yet')).toBeVisible()
    await expectNoSidewaysScroll(page)
  })
})

test.describe('the payment drawer', () => {
  test('a 420-character reference stays inside the drawer', async ({ page }) => {
    await seedWalletFixtures(page)
    await signIn(page)
    await page.goto('/diamonds/top-ups')

    await page.getByText(NAMELESS).click()
    const drawer = page.getByRole('dialog')
    await expect(
      drawer.getByRole('heading', { name: 'Payment', exact: true }),
    ).toBeVisible()

    const overflow = await drawer.evaluate((node) => {
      const edge = node.getBoundingClientRect().right
      return {
        scrolls: node.scrollWidth > node.clientWidth + 1,
        offenders: [...node.querySelectorAll('*')]
          .filter((el) => el.getBoundingClientRect().right > edge + 1)
          .map((el) => `${el.tagName}.${el.className.toString().slice(0, 70)}`),
      }
    })
    expect(overflow).toEqual({ scrolls: false, offenders: [] })
  })

  test('the body, its sections and its footer share one left edge', async ({
    page,
  }) => {
    /*
     * ⚠️ The alignment defect H7 found on the host drawer, guarded here too:
     * `SheetContent` carries no padding, so a body or footer that does not
     * bring its own sits flush against the window.
     */
    await seedWalletFixtures(page)
    await signIn(page)
    await page.goto('/diamonds/top-ups')

    await page.getByText(RAKIBUL).click()
    const drawer = page.getByRole('dialog')
    await expect(
      drawer.getByRole('heading', { name: 'Payment', exact: true }),
    ).toBeVisible()

    const edges = await drawer.evaluate((node) => {
      const left = (el: Element | null | undefined) =>
        el ? Math.round(el.getBoundingClientRect().left) : -1

      /* By text, never `querySelector('button')` — the sheet's own Close
       * button is absolutely positioned in the top right and comes first. */
      const approve = [...node.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Approve',
      )

      return {
        sheet: Math.round(node.getBoundingClientRect().left),
        title: left(node.querySelector('[data-slot="sheet-title"]')),
        section: left(node.querySelector('section')),
        footer: left(approve),
      }
    })

    expect(edges.title).toBeGreaterThan(edges.sheet)
    expect(edges.section).toBe(edges.title)
    expect(edges.footer).toBe(edges.title)
  })

  test('the receipt makes no request until the operator asks', async ({ page }) => {
    /*
     * ⚠️ **jsdom could only prove no `<img>` was mounted; this proves no
     * request leaves the browser.** Opening a payment must not fetch an image
     * from a stranger's host out of an admin session — `receiptImageUrl`
     * points at a CDN that can log who looked, and when.
     */
    const receiptHits: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/receipts/')) receiptHits.push(request.url())
    })

    await seedWalletFixtures(page)
    await signIn(page)
    await page.goto('/diamonds/top-ups')

    await page.getByText(RAKIBUL).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Receipt image')).toBeVisible()
    expect(receiptHits).toEqual([])

    await drawer.getByRole('button', { name: /view the receipt/i }).click()
    await expect(drawer.locator('img')).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  test('a javascript: receipt never becomes a source or a link', async ({ page }) => {
    await seedWalletFixtures(page)
    await signIn(page)
    await page.goto('/diamonds/top-ups')

    await page.getByText(NAMELESS).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText(/treat the payment as unevidenced/i)).toBeVisible()

    const unsafe = await drawer.evaluate((node) =>
      [...node.querySelectorAll('[src], [href]')]
        .map((el) => el.getAttribute('src') ?? el.getAttribute('href') ?? '')
        .filter((value) => /^\s*javascript:/i.test(value)),
    )
    expect(unsafe).toEqual([])
  })

  test('rejecting demands a reason, and its focus ring is not clipped', async ({
    page,
  }) => {
    await seedWalletFixtures(page)
    await signIn(page)
    await page.goto('/diamonds/top-ups')

    await page.getByText(RAKIBUL).click()
    await page.getByRole('button', { name: 'Reject' }).click()

    const dialog = page.getByRole('dialog', { name: /reject this payment/i })
    await expect(dialog.getByText(/write it for them, not for the log/)).toBeVisible()

    const reason = dialog.getByLabel(/Reason/)
    await reason.fill('too short')
    await dialog.getByRole('button', { name: 'Reject and notify' }).click()
    await expect(dialog).toBeVisible()

    /*
     * ⚠️ The ring sits 4px outside the field and this dialog's body scrolls —
     * the combination sliced the bottom off every ring here once before.
     */
    await reason.focus()
    await expectFocusRingNotClipped(page, 'textarea')

    await reason.fill(
      'No matching entry in the bKash merchant statement for 25 October.',
    )
    await dialog.getByRole('button', { name: 'Reject and notify' }).click()
    await expect(dialog).toBeHidden()
  })

  test('approving states that it cannot be undone', async ({ page }) => {
    await seedWalletFixtures(page)
    await signIn(page)
    await page.goto('/diamonds/top-ups')

    await page.getByText(RAKIBUL).click()
    await page.getByRole('button', { name: 'Approve' }).click()

    const dialog = page.getByRole('dialog', { name: /approve this payment/i })
    await expect(dialog.getByText(/no way to un-approve/)).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    /* Backing out leaves the payment exactly where it was. */
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
  })
})

test.describe('the diamond price list', () => {
  test('shows hidden tiers and keeps a fractional price', async ({ page }) => {
    await seedWalletFixtures(page)
    await signIn(page)
    await page.goto('/diamonds/packages')

    await expect(page.getByText('Starter Pack')).toBeVisible()
    /* ⚠️ The admin list is not the storefront — a withdrawn tier must not
     * look deleted, or nobody can switch it back on. */
    await expect(page.getByText('Retired Tier')).toBeVisible()
    await expect(page.getByText('Hidden')).toBeVisible()
    await expect(page.getByText('$25.50')).toBeVisible()

    await expectNoSidewaysScroll(page)
  })

  test('creating refuses the server’s three required fields', async ({ page }) => {
    await signIn(page)
    await page.goto('/diamonds/packages')

    await page.getByRole('button', { name: 'New package' }).click()
    const dialog = page.getByRole('dialog', { name: /new package/i })
    await dialog.getByRole('button', { name: /create package/i }).click()

    await expect(dialog.getByText('Title is required')).toBeVisible()
    await expect(dialog.getByText('Base diamonds must be positive')).toBeVisible()
    await expect(dialog.getByText('BDT price must be positive')).toBeVisible()
  })

  test('deleting names the package and offers the safer alternative', async ({
    page,
  }) => {
    /*
     * ⚠️ Verified against the live backend on 2026-10-27: deleting a package
     * sets `packageId: null` on every purchase that referenced it (plan.md
     * O16). Switching it off keeps the link.
     */
    await seedWalletFixtures(page)
    await signIn(page)
    await page.goto('/diamonds/packages')

    await page.getByRole('button', { name: 'Delete Retired Tier' }).click()
    const dialog = page.getByRole('dialog', { name: /delete this package/i })

    await expect(dialog.getByText(/Retired Tier/)).toBeVisible()
    await expect(dialog.getByText(/switch it off instead/i)).toBeVisible()
  })
})

test.describe('adjusting a balance', () => {
  test('lives on the user record, not in the Diamonds menu', async ({ page }) => {
    /*
     * ⚠️ The W5 revision. A page of its own could not show whose account an
     * opaque `userId` was; the user record already does.
     */
    await signIn(page)
    await page.goto('/dashboard')

    const nav = page.getByRole('navigation', { name: 'Modules' })
    if (await nav.isVisible()) {
      await expect(nav.getByRole('link', { name: 'Adjust a wallet' })).toHaveCount(0)
      await expect(
        nav.getByRole('link', { name: 'Top-up requests', exact: true }),
      ).toBeVisible()
    }
  })
})

test.describe('the economy settings tab', () => {
  test('saves nothing when nothing changed', async ({ page }) => {
    /*
     * ⚠️ `PATCH /admin/settings/economy` answers 200 to an empty body
     * (plan.md O8), so the Save control is the only thing between an operator
     * and a write that reports success and changes nothing.
     */
    const writes: string[] = []
    page.on('request', (request) => {
      if (
        request.method() === 'PATCH' &&
        request.url().includes('/admin/settings/economy')
      ) {
        writes.push(request.url())
      }
    })

    await signIn(page)
    await page.goto('/settings/economy')

    const bonus = page.getByLabel(/Signup bonus/)
    await expect(bonus).toBeEnabled()
    await expect(page.getByRole('button', { name: /^Save/ })).toBeDisabled()
    expect(writes).toEqual([])

    await bonus.fill('25')
    await expect(page.getByRole('button', { name: /^Save/ })).toBeEnabled()
  })

  test('says where the revenue split actually lives', async ({ page }) => {
    await signIn(page)
    await page.goto('/settings/economy')

    await expect(
      page.getByText(/revenue split is set per host, not globally/i),
    ).toBeVisible()
    await expectNoSidewaysScroll(page)
  })
})
