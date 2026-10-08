import { expect, test, type Locator, type Page } from '@playwright/test'
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

/**
 * Colour-contrast violations, optionally scoped to one subtree.
 *
 * ⚠️ **Pass a `selector` whenever the subject is a dialog.** Without one axe
 * scans the whole document, which for an open dialog means scanning the page
 * *behind* it as well — and that page is full of the known `foreground-subtle`
 * debt below. The `KNOWN_*` filters exist to tolerate that, but they match on a
 * colour resolved from `target[0]`, and for some nodes that resolves to the
 * wrong element, so the exclusion leaks and the dialog gets blamed for prose it
 * does not own. B5 hit exactly that: the announcement editor failed at
 * wide-1920 and nowhere else, on three nodes that turned out to be queue rows
 * showing through.
 *
 * Scoping is also simply more honest — a test named for the editor should fail
 * only for the editor.
 */
async function contrastViolations(page: Page, selector?: string) {
  // `axe.source` is the library as a string — no filesystem access needed.
  await page.addScriptTag({ content: axe.source })
  return page.evaluate(async (scope) => {
    const results = await (
      window as unknown as {
        axe: {
          run: (
            ctx: Document | Element,
            opts: unknown,
          ) => Promise<{
            violations: Array<{
              id: string
              nodes: Array<{ html: string; target: unknown[] }>
            }>
          }>
        }
      }
    ).axe.run((scope ? document.querySelector(scope) : document) ?? document, {
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
  }, selector)
}

/*
 * `--color-foreground-subtle` (#91949d) resolves to 3.07:1 on white, below the
 * 4.5:1 AA floor for normal text. It is pre-existing design-system debt, not
 * part of the button fix, and changing it repaints every muted label in the
 * app — so it is excluded here BY COMPUTED COLOUR and reported rather than
 * silently corrected. Any violation in a different colour still fails.
 */
const KNOWN_SUBTLE_TOKEN = 'rgb(145, 148, 157)'

/*
 * `--color-danger` (red-500, #fe4b18) used as TEXT resolves to 3.35:1 on the
 * page ground — below the 4.5:1 AA floor. Found by the V5 pass, on the shared
 * `ConfirmActionDialog`'s validation message: *"A reason of at least 10
 * characters is required."*
 *
 * ⚠️ **Pre-existing, app-wide, and not this module's to fix.** The same
 * `text-danger` prose appears on the login form's two field errors, the account
 * security page, four settings editors, the user create/edit forms and every
 * required-field asterisk in the panel — roughly fifteen surfaces. `tokens.css`
 * already documents red-500 as unfit behind white text and deliberately keeps
 * `--color-danger` for dots, borders and icons, which is why B5 introduced
 * `--color-danger-strong` for button fills rather than darkening the base. Prose
 * needs the same treatment with `--color-danger-foreground` (red-800, 6.07:1),
 * and doing it repaints every validation message in the product.
 *
 * So it is excluded here BY COMPUTED COLOUR and reported (plan.md O16), exactly
 * as the subtle token above is. Any violation in a different colour still fails.
 */
const KNOWN_DANGER_TEXT_TOKEN = 'rgb(254, 75, 24)'

test('the user directory has no contrast violations beyond known token debt', async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/users')
  await expect(page.getByRole('button', { name: 'Add user' })).toBeVisible()

  await settled(page)
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

  await settled(page)
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

  await settled(page)
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

test('the feedback surfaces have no contrast violations beyond known token debt', async ({
  page,
}) => {
  /*
   * Phase F5. This module adds **two** badge domains no other screen uses —
   * `feedback` (six tones, including `primary` for IN_PROGRESS and `danger`
   * for REOPENED) and `feedbackPriority` (four) — plus the stats strip's
   * numbers on a `primary-soft` fill when pressed, and the attachment rows'
   * `text-danger` warning on `surface-muted`. None of that was covered by the
   * user or staff passes.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/feedback')
  await expect(page.getByText('Audio cuts out during group call')).toBeVisible()

  await settled(page)
  const unexpected = (await contrastViolations(page)).filter(
    (node) => node.color !== KNOWN_SUBTLE_TOKEN,
  )
  expect(unexpected).toEqual([])
})

test('the hostile ticket has no contrast violations', async ({ page }) => {
  /*
   * `fb_hostile` is the worst content the module renders, and the only place
   * `text-danger` prose appears — the "unsafe link, not opened" line on three
   * attachment rows.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/feedback/fb_hostile')
  await expect(
    page.getByRole('heading', { level: 1, name: /Payment failed/ }),
  ).toBeVisible()

  await settled(page)
  const unexpected = (await contrastViolations(page)).filter(
    (node) => node.color !== KNOWN_SUBTLE_TOKEN,
  )
  expect(unexpected).toEqual([])
})

test('every feedback status and priority badge is legible on its own background', async ({
  page,
}) => {
  /*
   * Measured per badge rather than through axe, because these ten tones are
   * the thing being checked — a regression in one of them should name which,
   * not report "a violation on the page".
   *
   * All six statuses are on screen at once via the stats strip; the four
   * priorities need the queue's rows, which carry a spread of them.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/feedback')
  await expect(page.getByText('Audio cuts out during group call')).toBeVisible()

  const ratios = await page.evaluate(() => {
    function luminance(rgb: string): number {
      const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map(Number) as [
        number,
        number,
        number,
      ]
      const channel = (value: number) => {
        const c = value / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }

    /* Walk up for the nearest ancestor that actually paints a background. */
    function painted(el: Element): string {
      let node: Element | null = el
      while (node) {
        const bg = getComputedStyle(node).backgroundColor
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg
        node = node.parentElement
      }
      return 'rgb(255, 255, 255)'
    }

    /*
     * A badge is an uppercase overline that paints **its own** background.
     * Selecting on the typography alone also matched the date picker's "Filed
     * (UTC)" label — muted text on the page ground, which is the known
     * `foreground-subtle` token debt and not a badge at all.
     */
    const badges = Array.from(
      document.querySelectorAll('span.text-overline.uppercase'),
    ).filter((el) => {
      const own = getComputedStyle(el).backgroundColor
      const painted = own && own !== 'rgba(0, 0, 0, 0)' && own !== 'transparent'
      return painted && (el.textContent ?? '').trim().length > 0
    })

    return badges.map((el) => {
      const fg = luminance(getComputedStyle(el).color)
      const bg = luminance(painted(el))
      const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
      return { label: (el.textContent ?? '').trim(), ratio }
    })
  })

  expect(ratios.length).toBeGreaterThan(0)
  for (const badge of ratios) {
    /* 4.5:1 — these are small uppercase text, so the AA floor for normal text. */
    expect(
      badge.ratio,
      `${badge.label} at ${badge.ratio.toFixed(2)}:1`,
    ).toBeGreaterThan(4.5)
  }
})

/**
 * Wait until nothing on the page is still changing colour.
 *
 * ⚠️ **A contrast scan is only meaningful on a settled page**, and every test
 * in this file used to scan the moment some text became visible. Two things
 * move after that on a settings screen:
 *
 * 1. Every editable control is disabled until `AuthProvider` resolves
 *    `GET /admin/auth/me`, which lands *after* the record query — and a
 *    disabled control is painted in different colours than an enabled one.
 * 2. The platform and app switches carry `transition-colors`. A scan landing
 *    mid-transition reads an **interpolated** background belonging to neither
 *    state, and axe computes a ratio against a colour the design system never
 *    defines.
 *
 * `getAnimations()` covers CSS transitions as well as animations, so waiting
 * for all of them to stop is the precise condition rather than a sleep.
 *
 * ⚠️ Added 2026-10-08 after this test failed **once** at mobile-360 in a
 * three-spec, three-viewport run, and then refused to reproduce — it passes
 * alone, and a rerun of the identical command came back 244/244. So this is a
 * **precaution against a real raciness**, not a verified fix for that failure:
 * I could not capture the violation body, and the cause is unproven. What is
 * certain is that scanning an unsettled page is wrong, and that `AppTypeSwitch`
 * made it likelier by introducing the largest colour jump on the screen
 * (transparent to `bg-primary`) next to the toggle that was already there.
 */
async function settled(page: Page, gatedControl?: Locator): Promise<void> {
  /*
   * ⚠️ `gatedControl` is opt-in, and deliberately not a built-in lookup.
   *
   * My first version always waited for a "Save changes" button. That is the
   * right signal on a settings screen — `SettingsCard` only renders the save
   * row once `canEdit` is true — but those buttons do not exist on the
   * verification queue, the announcements editor, or the feedback surfaces this
   * helper is now called from, so an unconditional wait fails everywhere else.
   * An `if (count())` guard would be worse than useless: a control that has not
   * rendered yet counts zero, so the wait would skip exactly when it is needed.
   *
   * So callers that know their screen is auth-gated pass the control; the rest
   * get the animation wait, which is universal.
   */
  if (gatedControl) await expect(gatedControl).toBeVisible()

  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  )
}

test('the bootstrap screen has no contrast violations beyond known token debt', async ({
  page,
}) => {
  /*
   * Phase B5. This module adds two danger-toned surfaces nothing had measured:
   * the **unsafe-URL warning** under a field — `text-danger-foreground` prose
   * on the card ground — and the flagged **version tag**, which is
   * `warning`-toned text on `warning-soft`. The F5 pass caught a real 2.9:1
   * failure in exactly this shape, so it is checked here rather than assumed.
   *
   * The seeded Android record carries both: a `javascript:` store URL and a
   * non-SemVer blocked version.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/settings/bootstrap')
  await expect(page.getByText('Release policy')).toBeVisible()
  await settled(page, page.getByRole('button', { name: 'Save changes' }).first())

  const unexpected = (await contrastViolations(page)).filter(
    (node) => node.color !== KNOWN_SUBTLE_TOKEN,
  )
  expect(unexpected).toEqual([])
})

test('the LIVE NOW banner is legible when the product is down', async ({ page }) => {
  /*
   * The one surface an operator reads during an incident, and the only place
   * this module paints a `destructive` alert.
   *
   * Driven through the UI rather than by calling the API and reloading: the
   * mock's bootstrap records are in-memory, so a reload re-seeds them and the
   * banner never appears. Turning the switch on the way an operator would is
   * also the only path that proves the banner follows the switch.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/settings/bootstrap')
  await expect(page.getByText('Release policy')).toBeVisible()

  await page.getByLabel('Maintenance mode').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/reason/i).fill('Contrast check, restored immediately.')
  await dialog.getByRole('button', { name: /Turn on maintenance mode/ }).click()

  await expect(page.getByText(/clients are affected right now/)).toBeVisible()

  await settled(page)
  const unexpected = (await contrastViolations(page)).filter(
    (node) => node.color !== KNOWN_SUBTLE_TOKEN,
  )
  expect(unexpected).toEqual([])

  /* Off again — one click, no dialog — so the next test inherits a healthy product. */
  await page.getByLabel('Maintenance mode').click()
  await expect(page.getByText(/clients are affected right now/)).toHaveCount(0)
})

test('the confirmation dialog for a dangerous switch is legible', async ({ page }) => {
  /*
   * A portal, so no page-level sweep has ever measured it — the same gap F5
   * found on the feedback module's status dialog.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/settings/bootstrap')
  await expect(page.getByText('Release policy')).toBeVisible()

  await page.getByLabel('Maintenance mode').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  /*
   * ⚠️ Wait for the open animation to finish before measuring.
   *
   * The dialog fades and scales in, and axe blends a partially transparent
   * element with whatever is behind it — which produced three failures that
   * all vanished once it settled. A contrast suite that reports phantom
   * defects is worse than one that reports none, because the next person
   * learns to disbelieve it.
   */
  await expect(dialog).toHaveCSS('opacity', '1')

  await settled(page)
  const unexpected = (await contrastViolations(page)).filter(
    (node) => node.color !== KNOWN_SUBTLE_TOKEN,
  )
  expect(unexpected).toEqual([])
})

test('the verification queue has no contrast violations beyond known token debt', async ({
  page,
}) => {
  /*
   * Phase V5. This module adds the `verification` badge domain — five values
   * across three tones — plus two surfaces nothing had measured: the
   * **zero-document warning badge** in the Documents column, which is
   * `warning`-toned text on `warning-soft`, and the **filter notice** strip,
   * which is muted prose on `surface-muted` with emphasised spans inside it.
   *
   * Opened at `?status=ALL` so every tone is painted at once; the default view
   * shows only the pending ones.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/verifications?status=ALL')
  await expect(page.getByText('DeliGo').first()).toBeVisible()

  await settled(page)
  const unexpected = (await contrastViolations(page)).filter(
    (node) => node.color !== KNOWN_SUBTLE_TOKEN,
  )
  expect(unexpected).toEqual([])
})

test('the application, with every warning painted, has no contrast violations', async ({
  page,
}) => {
  /*
   * The rejected identity record is the worst case this module renders: the
   * §3.6 "no explanation was recorded" warning, a reason code, the
   * zero-evidence notice and an audit disclosure, all `warning`- or
   * `danger`-toned on soft fills. The F5 pass caught a real 2.9:1 failure in
   * exactly this shape, so it is measured rather than assumed.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/verifications/cmulfjl62000301r33hha40xj')
  await expect(page.getByText(/No explanation was recorded/)).toBeVisible()

  await settled(page)
  const unexpected = (await contrastViolations(page)).filter(
    (node) => node.color !== KNOWN_SUBTLE_TOKEN,
  )
  expect(unexpected).toEqual([])
})

test('the open document viewer has no contrast violations', async ({ page }) => {
  /*
   * The viewer's own chrome — the header's audit line and the size/type caption
   * over `surface-sunken`, a fill no other dialog in the panel sits on.
   *
   * ⚠️ Opening a document is an audited act even here: the mock records the
   * view, and against the live service this would write a `VIEWED_DOCUMENT` row.
   * That is why the panel states it, and why this test opens exactly one.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/verifications/cmulfjl62000201r33hha40xi')
  await page.getByRole('button', { name: /^View/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await settled(page)
  const unexpected = (await contrastViolations(page)).filter(
    (node) => node.color !== KNOWN_SUBTLE_TOKEN,
  )
  expect(unexpected).toEqual([])
})

test('the reject dialog has no contrast violations, including its error state', async ({
  page,
}) => {
  /*
   * The richest form in the module, and the only place `text-danger` marks a
   * required field beside a `danger`-variant confirm button.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/verifications/cmu04s71l003701oi3wvzvbdp')
  await page.getByRole('button', { name: /^Reject/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  /* Confirm with nothing filled in, to paint the validation message. */
  await page.getByRole('button', { name: 'Reject', exact: true }).last().click()
  await expect(page.getByRole('alert')).toBeVisible()

  await settled(page)
  const unexpected = (await contrastViolations(page)).filter(
    (node) =>
      node.color !== KNOWN_SUBTLE_TOKEN && node.color !== KNOWN_DANGER_TEXT_TOKEN,
  )
  expect(unexpected).toEqual([])
})

test('every verification status tone is legible on its own background', async ({
  page,
}) => {
  /*
   * Measured per badge rather than through axe, so a regression names which tone
   * broke instead of reporting "a violation on the page".
   *
   * ⚠️ **Three of the five values are on screen, which covers all three tones.**
   * The live service holds no `REVOKED` or `PENDING_REVIEW` row, and the mock
   * deliberately mirrors the live distribution (plan.md §7, V2) rather than
   * inventing rows to make a test look thorough. Contrast is a property of the
   * tone, not the label: `PENDING` is the `warning` tone that `PENDING_REVIEW`
   * shares, and `REJECTED` is the `danger` tone that `REVOKED` shares. So every
   * colour pair this domain can paint IS measured here — but if a future value
   * introduces a fourth tone, this test will not know about it.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/verifications?status=ALL')
  await expect(page.getByText('DeliGo').first()).toBeVisible()

  const ratios = await page.evaluate(() => {
    function luminance(rgb: string): number {
      const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map(Number) as [
        number,
        number,
        number,
      ]
      const channel = (value: number) => {
        const c = value / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }

    function painted(el: Element): string {
      let node: Element | null = el
      while (node) {
        const bg = getComputedStyle(node).backgroundColor
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg
        node = node.parentElement
      }
      return 'rgb(255, 255, 255)'
    }

    const badges = Array.from(
      document.querySelectorAll('span.text-overline.uppercase'),
    ).filter((el) => {
      const own = getComputedStyle(el).backgroundColor
      const isPainted = own && own !== 'rgba(0, 0, 0, 0)' && own !== 'transparent'
      return isPainted && (el.textContent ?? '').trim().length > 0
    })

    return badges.map((el) => {
      const fg = luminance(getComputedStyle(el).color)
      const bg = luminance(painted(el))
      const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
      return { label: (el.textContent ?? '').trim(), ratio }
    })
  })

  expect(ratios.length).toBeGreaterThan(0)

  /* All three tones must actually be present, or this measured nothing. */
  const labels = ratios.map((badge) => badge.label.toLowerCase())
  expect(labels.some((label) => label.includes('pending'))).toBe(true)
  expect(labels.some((label) => label.includes('approved'))).toBe(true)
  expect(labels.some((label) => label.includes('rejected'))).toBe(true)

  for (const badge of ratios) {
    expect(
      badge.ratio,
      `${badge.label} at ${badge.ratio.toFixed(2)}:1`,
    ).toBeGreaterThan(4.5)
  }
})

test('the announcements queue has no contrast violations beyond known token debt', async ({
  page,
}) => {
  /*
   * Phase B5. This module introduced **two new tone maps at once** —
   * `announcement` (where `DRAFT` is the only `neutral` lifecycle state in the
   * panel, and `ARCHIVED` borrows `locked`) and `announcementPriority` (four
   * tones chosen to match what `broadcast.md` §5.2 renders on the phone). The
   * stats strip also uses `primary` for Pinned, which is not a status tone and
   * appears nowhere else as a tile.
   *
   * Nothing in the user, staff or verification passes covered any of that.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/announcements')
  await expect(page.getByRole('button', { name: /new announcement/i })).toBeVisible()
  /* A row, so the badges are actually painted rather than skeletons. */
  await expect(page.getByText('Important Security Update')).toBeVisible()

  await settled(page)
  const unexpected = (await contrastViolations(page)).filter(
    (node) => node.color !== KNOWN_SUBTLE_TOKEN,
  )
  expect(unexpected).toEqual([])
})

test('the announcement editor has no contrast violations beyond known token debt', async ({
  page,
}) => {
  /*
   * The richest form in the module: two text fields with live character counts,
   * two selects, two optional CTA inputs with their own hints, a file control
   * and a switch — all muted prose, which is where contrast debt hides.
   *
   * ⚠️ `KNOWN_DANGER_TEXT_TOKEN` is permitted here and nowhere else in this
   * file so far. The editor renders `FormField` errors in `text-danger`, which
   * is the same app-wide prose debt documented above (plan.md O16) — roughly
   * fifteen surfaces, `tokens.css` already flags the token, and fixing it
   * repaints every validation message in the product. Excluded by computed
   * colour, so a violation in any other colour still fails.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/announcements')
  await page.getByRole('button', { name: /new announcement/i }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel(/headline/i)).toBeVisible()

  const unexpected = (
    await contrastViolations(page, '[data-slot="dialog-content"]')
  ).filter(
    (node) =>
      node.color !== KNOWN_SUBTLE_TOKEN && node.color !== KNOWN_DANGER_TEXT_TOKEN,
  )
  expect(unexpected).toEqual([])
})

test('the publish confirmation is legible, since it is the last thing read before a broadcast', async ({
  page,
}) => {
  /*
   * ⚠️ Measured directly rather than through axe, because this one sentence is
   * the entire guard between an operator and an irreversible broadcast to every
   * user on the platform. If it is the one thing on screen that is hard to
   * read, the confirmation is theatre.
   *
   * The contrast ratio is computed rather than compared against a fixed string:
   * the tone may legitimately be retuned, and what must not change is that it
   * stays readable.
   */
  await signIn(page, ACCOUNTS.superAdmin)
  await page.goto('/announcements')
  await page.getByRole('button', { name: /new announcement/i }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/headline/i).fill('A perfectly ordinary headline')
  await dialog.getByLabel(/^body/i).fill('Ordinary body copy.')
  await dialog.getByRole('button', { name: /publish now/i }).click()

  const warning = dialog.getByText(/publish to every matching user now/i)
  await expect(warning).toBeVisible()

  const ratio = await warning.evaluate((node) => {
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
      for (let n: Element | null = element; n; n = n.parentElement) {
        const value = getComputedStyle(n).backgroundColor
        const alpha = value.match(/[\d.]+/g)?.[3]
        if (value !== 'transparent' && alpha !== '0') return parse(value)
      }
      return [255, 255, 255]
    }

    const element = node as HTMLElement
    const fg = luminance(parse(getComputedStyle(element).color))
    const bg = luminance(background(element))
    const [light, dark] = fg > bg ? [fg, bg] : [bg, fg]
    return (light! + 0.05) / (dark! + 0.05)
  })

  /* AA for normal-size text. */
  expect(ratio).toBeGreaterThanOrEqual(4.5)
})
