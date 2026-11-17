import { expect, test, type Locator, type Page } from '@playwright/test'
import axe from 'axe-core'

import {
  ACCOUNTS,
  expectFocusRingNotClipped,
  expectNoSidewaysScroll,
  signIn,
} from './fixtures'

/**
 * Legal & policies, phase LG6 (plan.md), in a real browser at every width.
 *
 * ⚠️ Mock state lives in the page: `page.goto` reloads the app and resets the
 * seed, so each test that writes does its writes after its last `goto`.
 *
 * The seed (src/mocks/handlers/legal.ts):
 * - Privacy Policy: 0.9.0 archived, 1.0.0 published (re-consent), 1.1.0 draft
 * - Terms of Service: 1.0.0 published
 * - Cookie Policy: 1.0.0 published, effective 2027-01-01 (upcoming)
 * - Community Guidelines: nothing
 */

const PRIVACY_090 = 'cmwlegalprivacy090000000001'
const PRIVACY_100 = 'cmwlegalprivacy100000000001'
const PRIVACY_DRAFT = 'cmwlegalprivacy110000000001'
const EDIT_DRAFT = `/legal/${PRIVACY_DRAFT}/edit`

function main(page: Page): Locator {
  return page.getByRole('main')
}

function card(page: Page, type: string): Locator {
  return main(page).locator(`[aria-labelledby="policy-${type.toLowerCase()}"]`)
}

function width(page: Page): number {
  return page.viewportSize()?.width ?? 0
}

async function open(page: Page, path: string, account: string = ACCOUNTS.superAdmin) {
  await signIn(page, account)
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

/** axe on `main`, contrast excluded: it has its own pass in contrast.spec.ts. */
async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: axe.source })
  return page.evaluate(async () => {
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
    const result = await run(document.querySelector('main') ?? document.body, {
      rules: { 'color-contrast': { enabled: false } },
      resultTypes: ['violations'],
    })
    return result.violations.map((v) => `${v.id} (${v.nodes.length})`)
  })
}

async function openEditor(page: Page, account: string = ACCOUNTS.superAdmin) {
  await open(page, EDIT_DRAFT, account)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Privacy Policy v1.1.0',
  )
  await expect(main(page).getByRole('textbox', { name: /Policy text/ })).toBeAttached()
}

function editor(page: Page): Locator {
  return main(page).getByRole('textbox', { name: /Policy text/ })
}

function preview(page: Page): Locator {
  return main(page).getByRole('article', { name: /^Preview of/ })
}

/** The split needs 1280px; below it the Content tab is Write or Preview. */
async function showPreview(page: Page) {
  if (width(page) < 1280)
    await main(page).getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(preview(page)).toBeVisible()
}

async function editorTab(page: Page, name: string) {
  await main(page).getByRole('tab', { name, exact: true }).click()
}

/** The app frame is fixed: the top bar must stay pinned to the top of the window. */
async function expectFrameInPlace(page: Page) {
  const shifted = await page.evaluate(() => {
    const topBar = document.querySelector('header')
    const offenders: string[] = []
    if (document.documentElement.scrollTop !== 0) offenders.push('html scrolled')
    if (document.body.scrollTop !== 0) offenders.push('body scrolled')
    const root = document.getElementById('root')
    if (root && root.scrollTop !== 0) offenders.push('#root scrolled')
    const frame = root?.firstElementChild
    if (frame && frame.scrollTop !== 0) offenders.push('app frame scrolled')
    if (topBar && Math.abs(topBar.getBoundingClientRect().top) > 0.5)
      offenders.push(`top bar at ${topBar.getBoundingClientRect().top}px`)
    return offenders
  })
  expect(shifted).toEqual([])
}

/* ------------------------------------------------------------------ */

test.describe('list', () => {
  test('four policy cards, drafts and history, fitting at this width', async ({
    page,
  }) => {
    await open(page, '/legal')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Legal & policies')

    await expect(card(page, 'PRIVACY_POLICY')).toContainText('v1.0.0')
    await expect(card(page, 'PRIVACY_POLICY')).toContainText('Users must accept again')
    await expect(card(page, 'PRIVACY_POLICY')).toContainText('Draft v1.1.0 in progress')
    await expect(card(page, 'COOKIE_POLICY')).toContainText('Upcoming')
    await expect(card(page, 'COMMUNITY_GUIDELINES')).toContainText('Not published yet')
    await expect(
      card(page, 'COMMUNITY_GUIDELINES').getByRole('link', {
        name: 'Write first version',
      }),
    ).toBeVisible()
    await expectNoSidewaysScroll(page)

    /*
     * plan.md LB1: the seed's Business Privacy draft (v1.0.0) belongs to the
     * other app, so the Personal drafts show only v1.1.0.
     */
    const drafts = main(page).getByRole('tabpanel')
    await expect(drafts).toContainText('1.1.0')
    await expect(drafts).not.toContainText('1.0.0')

    await main(page)
      .getByRole('tab', { name: /^History/ })
      .click()
    await expect(page).toHaveURL(/tab=history/)
    await expect(main(page).getByText('Archived').first()).toBeVisible()
    await expectNoSidewaysScroll(page)
  })

  test('the app switch scopes the cards and the tabs, and survives a reload', async ({
    page,
  }) => {
    /* plan.md LB2. The seed: Personal has 3 of 4 live; Business none, one draft. */
    await open(page, '/legal')
    const apps = main(page).getByRole('group', { name: 'App' })
    const personal = apps.getByRole('button', { name: /^Personal/ })
    const business = apps.getByRole('button', { name: /^Business/ })
    await expect(personal).toHaveAttribute('aria-pressed', 'true')
    await expect(personal).toHaveAccessibleName('Personal, 3 of 4 policies live')
    await expect(business).toHaveAccessibleName('Business, 0 of 4 policies live')

    await business.click()
    await expect(page).toHaveURL(/[?&]app=business/)
    await expect(business).toHaveAttribute('aria-pressed', 'true')
    await expect(card(page, 'PRIVACY_POLICY')).toContainText('Draft v1.0.0 in progress')
    await expect(card(page, 'PRIVACY_POLICY')).not.toContainText('v1.1.0')
    await expect(card(page, 'TERMS_OF_SERVICE')).toContainText(
      'Not written for Business yet',
    )
    const drafts = main(page).getByRole('tabpanel')
    await expect(drafts).toContainText('1.0.0')
    await expect(drafts).not.toContainText('1.1.0')
    await expectNoSidewaysScroll(page)

    /* Nothing of Business is published, and the empty state says whose. */
    await main(page)
      .getByRole('tab', { name: /^History/ })
      .click()
    await expect(
      main(page).getByText('Nothing published for Business yet'),
    ).toBeVisible()

    await page.reload()
    await expect(page).toHaveURL(/[?&]app=business/)
    await expect(business).toHaveAttribute('aria-pressed', 'true')
    await expect(
      main(page).getByText('Nothing published for Business yet'),
    ).toBeVisible()

    /* Back to Personal: the default, so the parameter goes. */
    await personal.click()
    await expect(page).not.toHaveURL(/app=/)
    await expect(card(page, 'PRIVACY_POLICY')).toContainText('v1.0.0')
    await expect(card(page, 'PRIVACY_POLICY')).toContainText('Draft v1.1.0 in progress')
  })

  test('a Business card starts a Business draft, numbered on its own', async ({
    page,
  }) => {
    /* Personal Terms is at 1.0.0, so a Personal draft would be offered 1.1.0. */
    await open(page, '/legal?app=business')
    await card(page, 'TERMS_OF_SERVICE')
      .getByRole('link', { name: 'Write first version' })
      .click()
    await expect(page).toHaveURL(/\/legal\/new\?app=business&type=TERMS_OF_SERVICE$/)
    await expect(main(page).getByRole('textbox', { name: /^Version/ })).toHaveValue(
      '1.0.0',
    )
  })

  test('a card’s History button filters the history to that policy', async ({
    page,
  }) => {
    await open(page, '/legal')
    await card(page, 'TERMS_OF_SERVICE')
      .getByRole('button', { name: 'History' })
      .click()
    await expect(page).toHaveURL(/tab=history&type=TERMS_OF_SERVICE/)
    const panel = main(page).getByRole('tabpanel')
    await expect(panel.getByText('Terms of Service').first()).toBeVisible()
    await expect(panel.getByText('Privacy Policy')).toHaveCount(0)
  })

  test('when the list fails, no card claims a policy is unpublished', async ({
    page,
  }) => {
    /*
     * plan.md LB0. The failure starts before the page's first load: a reload
     * would reset the mock, so the scenario is set on another page and /legal
     * is reached by client-side navigation.
     */
    await open(page, '/users')
    await page.evaluate(() => {
      ;(
        window as unknown as { __mockScenario: { set: (s: string) => void } }
      ).__mockScenario.set('error')
      window.history.pushState({}, '', '/legal')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    /* A 500 is retried twice with backoff before the error shows. */
    await expect(main(page).getByText('Something went wrong')).toBeVisible({
      timeout: 20_000,
    })
    for (const type of ['PRIVACY_POLICY', 'COMMUNITY_GUIDELINES']) {
      await expect(card(page, type)).toContainText('Couldn’t check what is published')
      await expect(card(page, type)).not.toContainText('Not published yet')
      await expect(card(page, type).getByRole('link', { name: /version/ })).toHaveCount(
        0,
      )
    }
    await expectNoSidewaysScroll(page)
  })

  test('a draft opens in the editor', async ({ page }) => {
    await open(page, '/legal')
    await card(page, 'PRIVACY_POLICY')
      .getByRole('link', { name: /Draft v1\.1\.0/ })
      .click()
    await expect(page).toHaveURL(new RegExp(`${EDIT_DRAFT}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Privacy Policy v1.1.0',
    )
  })
})

/* ------------------------------------------------------------------ */

test.describe('editor', () => {
  test('opens on Content: split from 1280px, Write / Preview below, fitting', async ({
    page,
  }) => {
    await openEditor(page)
    await expect(main(page).getByText(/Draft · Effective 1 Dec 2026/)).toBeVisible()
    await expect(main(page).getByText('All changes saved')).toBeVisible()

    if (width(page) >= 1280) {
      await expect(editor(page)).toBeVisible()
      await expect(preview(page)).toBeVisible()
      /* The two panes sit side by side, not stacked. */
      const a = await editor(page).boundingBox()
      const b = await preview(page).boundingBox()
      expect(Math.abs((a?.y ?? 0) - (b?.y ?? 0))).toBeLessThan(2)
      /* And the page itself does not scroll: each pane scrolls on its own. */
      const scrolls = await page.evaluate(() => {
        const m = document.querySelector('main')
        return m ? m.scrollHeight > m.clientHeight + 1 : true
      })
      expect(scrolls).toBe(false)
    } else {
      await expect(
        main(page).getByRole('button', { name: 'Split', exact: true }),
      ).toHaveCount(0)
      await expect(editor(page)).toBeVisible()
      await expect(preview(page)).toHaveCount(0)
      await showPreview(page)
      await expect(editor(page)).toBeHidden()
    }
    await expectNoSidewaysScroll(page)
  })

  test('Add section numbers the next heading and the preview follows', async ({
    page,
  }) => {
    await openEditor(page)
    await expect(main(page).getByText('4 sections')).toBeVisible()
    await main(page).getByRole('button', { name: 'Add section' }).click()
    await expect(main(page).getByText('5 sections')).toBeVisible()
    await expect(editor(page)).toHaveValue(
      /## 5\. New section\nWrite the section here\./,
    )
    await showPreview(page)
    await expect(preview(page)).toContainText('5. New section')
  })

  test('problems in the text are listed behind one chip', async ({ page }) => {
    await openEditor(page)
    await editor(page).fill('Intro.\n\n## Same\nOne.\n\n## Same\nTwo.')
    const chip = main(page).getByRole('button', { name: /1 thing to check/ })
    await chip.click()
    await expect(page.getByRole('dialog')).toContainText('Same')
  })

  test('save: unsaved edits hold Publish back until saved', async ({ page }) => {
    await openEditor(page)
    const save = main(page).getByRole('button', { name: 'Save draft' })
    const publish = main(page).getByRole('button', { name: /Publish/ })
    await expect(save).toBeDisabled()
    await expect(publish).toBeEnabled()

    await editorTab(page, 'Details')
    await main(page)
      .getByRole('textbox', { name: /^Title/ })
      .fill('Privacy Notice')
    await expect(main(page).getByText(/Unsaved changes/)).toBeVisible()
    await expect(publish).toBeDisabled()

    await save.click()
    await expect(page.getByText('Draft saved.')).toBeVisible()
    await expect(main(page).getByText('All changes saved')).toBeVisible()
    await expect(publish).toBeEnabled()
    await expect(main(page).getByRole('textbox', { name: /^Title/ })).toHaveValue(
      'Privacy Notice',
    )
  })

  test('an invalid save jumps to the tab with the problem and marks it', async ({
    page,
  }) => {
    await openEditor(page)
    await editorTab(page, 'Details')
    await main(page)
      .getByRole('textbox', { name: /^Title/ })
      .fill('')
    await editorTab(page, 'Changelog')
    await main(page).getByRole('button', { name: 'Save draft' }).click()
    await expect(main(page).getByRole('tab', { name: /^Details/ })).toHaveAttribute(
      'data-state',
      'active',
    )
    await expect(main(page).getByText('Add a title.')).toBeVisible()
    await expect(main(page).getByLabel('has a problem')).toBeAttached()
  })

  test('details and contact sit side by side from 1024px', async ({ page }) => {
    await openEditor(page)
    for (const [tab, left, right] of [
      ['Details', 'When it applies', 'Page header'],
      ['Contact & consent', 'Contact card', 'Consent line'],
    ] as const) {
      await editorTab(page, tab)
      const a = await main(page).getByRole('heading', { name: left }).boundingBox()
      const b = await main(page).getByRole('heading', { name: right }).boundingBox()
      if (width(page) >= 1024)
        expect(Math.abs((a?.y ?? 0) - (b?.y ?? 1))).toBeLessThan(2)
      else expect(b?.y ?? 0).toBeGreaterThan(a?.y ?? 0)
      await expectNoSidewaysScroll(page)
    }
  })

  test('leaving with unsaved edits asks first', async ({ page }) => {
    await openEditor(page)
    await editor(page).fill(`${await editor(page).inputValue()}\n\nMore.`)

    /* Every confirm in a phase gets the same answer (dev StrictMode may ask twice). */
    let answer: 'stay' | 'leave' = 'stay'
    page.on('dialog', (dialog) => {
      void (answer === 'leave' ? dialog.accept() : dialog.dismiss())
    })
    await main(page).getByRole('link', { name: 'Drafts' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Privacy Policy v1.1.0',
    )
    await expect(page).toHaveURL(new RegExp(`${EDIT_DRAFT}$`))

    answer = 'leave'
    await main(page).getByRole('link', { name: 'Drafts' }).click()
    await expect(page).toHaveURL(/\/legal\?tab=drafts/)
  })

  test('delete sits in the ⋯ menu and removes the draft', async ({ page }) => {
    await openEditor(page)
    await main(page).getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete draft' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Privacy Policy v1.1.0')
    await dialog.getByRole('button', { name: 'Delete draft' }).click()
    await expect(page).toHaveURL(/\/legal\?tab=drafts/)
    await expect(page.getByText('Draft v1.1.0 deleted.')).toBeVisible()
    await expect(main(page).getByText('No drafts in progress')).toBeVisible()
  })

  test('jumping to a section scrolls the preview, never the app frame', async ({
    page,
  }) => {
    /*
     * Regression, reported from a screenshot on 2026-11-08: `scrollIntoView`
     * scrolled the `overflow: hidden` app frame too, sliding the top bar off
     * the screen with nothing to scroll it back.
     */
    await openEditor(page)
    await showPreview(page)
    const sections = preview(page).locator('details button')
    const count = await sections.count()
    for (let index = 0; index < count; index += 1) {
      await preview(page)
        .locator('details')
        .evaluate((node) => {
          ;(node as HTMLDetailsElement).open = true
        })
      await sections.nth(index).click()
    }
    await main(page).getByRole('button', { name: 'Add section' }).click()
    await expectFrameInPlace(page)
  })

  test('the policy text keeps its whole focus ring', async ({ page }) => {
    await openEditor(page)
    await editor(page).focus()
    /*
     * On a short window the box is taller than what `main` shows, so its foot
     * is merely scrolled away, not clipped. Bring the bottom into view first:
     * `main`'s own padding must then leave room for the ring.
     */
    await page.evaluate(() => {
      const scroller = document.querySelector('main')
      if (scroller) scroller.scrollTop = scroller.scrollHeight
    })
    await expectFocusRingNotClipped(page, '#legal-content')
  })

  test('has no accessibility violations other than contrast', async ({ page }) => {
    await openEditor(page)
    expect(await axeViolations(page)).toEqual([])
  })
})

/* ------------------------------------------------------------------ */

test.describe('new draft', () => {
  test('New version: version first, a taken number is refused, the text is copied', async ({
    page,
  }) => {
    await open(page, '/legal')
    await card(page, 'PRIVACY_POLICY')
      .getByRole('link', { name: 'New version' })
      .click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'New version of the Privacy Policy',
    )
    const version = main(page).getByLabel('Version')
    await expect(version).toHaveValue('1.2.0')

    await version.fill('1.1.0')
    await main(page).getByRole('button', { name: 'Continue' }).click()
    await expect(
      main(page).getByText(/v1\.1\.0 of the Privacy Policy already exists/),
    ).toBeVisible()

    await main(page)
      .getByRole('button', { name: /^Major/ })
      .click()
    await expect(version).toHaveValue('2.0.0')
    await main(page).getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Privacy Policy v2.0.0',
    )
    await expect(editor(page)).toHaveValue(/## 3\. Your Rights/)
    await expect(main(page).getByText(/Copied from v1\.0\.0/)).toBeVisible()
    await expectNoSidewaysScroll(page)

    await main(page).getByRole('button', { name: 'Create draft' }).click()
    await expect(
      page.getByText('Draft v2.0.0 of the Privacy Policy saved.'),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/legal\/[^/]+\/edit$/)
    await expect(main(page).getByText('All changes saved')).toBeVisible()
  })

  test('Change version keeps what was written', async ({ page }) => {
    await open(page, '/legal')
    await card(page, 'COMMUNITY_GUIDELINES')
      .getByRole('link', { name: 'Write first version' })
      .click()
    await expect(main(page).getByLabel('Version')).toHaveValue('1.0.0')
    await main(page).getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Community Guidelines v1.0.0',
    )

    await editor(page).fill('Be kind.\n\n## 1. Respect\nNo harassment.')
    await main(page).getByRole('button', { name: 'Change version' }).click()
    await main(page).getByLabel('Version').fill('0.1.0')
    await main(page).getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Community Guidelines v0.1.0',
    )
    await expect(editor(page)).toHaveValue('Be kind.\n\n## 1. Respect\nNo harassment.')
  })

  test('the first Business version can start from the live Personal text', async ({
    page,
  }) => {
    /* plan.md LB3, decision 3. Personal Terms 1.0.0 is live; Business has none. */
    await open(page, '/legal?app=business')
    await card(page, 'TERMS_OF_SERVICE')
      .getByRole('link', { name: 'Write first version' })
      .click()
    await expect(main(page).getByRole('combobox', { name: /^App/ })).toHaveText(
      'Business',
    )
    const startFrom = main(page).getByRole('radiogroup', { name: 'Start from' })
    await expect(
      startFrom.getByRole('radio', { name: 'A blank template' }),
    ).toBeChecked()
    await startFrom
      .getByRole('radio', { name: /^Personal v1\.0\.0 \(active\)/ })
      .check()
    await expect(main(page).getByLabel('Version')).toHaveValue('1.0.0')
    await expectNoSidewaysScroll(page)
    await main(page).getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Business Terms of Service v1.0.0',
    )
    await expect(editor(page)).toHaveValue(/Diamonds have no cash value/)
    await expect(main(page).getByText(/Copied from Personal v1\.0\.0/)).toBeVisible()

    /* The same number as the live Personal Terms: each app numbers its own. */
    await main(page).getByRole('button', { name: 'Create draft' }).click()
    await expect(
      page.getByText('Draft v1.0.0 of the Business Terms of Service saved.'),
    ).toBeVisible()
    await main(page)
      .getByRole('navigation', { name: /breadcrumb/i })
      .getByRole('link', { name: 'Drafts' })
      .click()
    await expect(page).toHaveURL(/\/legal\?app=business&tab=drafts$/)
    await expect(card(page, 'TERMS_OF_SERVICE')).toContainText(
      'Draft v1.0.0 in progress',
    )
  })

  test('the Business overview and its setup card have no accessibility violations', async ({
    page,
  }) => {
    await open(page, '/legal?app=business')
    await expect(card(page, 'TERMS_OF_SERVICE')).toContainText(
      'Not written for Business',
    )
    expect(await axeViolations(page)).toEqual([])
    await open(page, '/legal/new?app=business&type=TERMS_OF_SERVICE')
    await expect(
      main(page).getByRole('radiogroup', { name: 'Start from' }),
    ).toBeVisible()
    expect(await axeViolations(page)).toEqual([])
  })

  test('a version taken in the same app is refused; no copy once one exists', async ({
    page,
  }) => {
    await open(page, '/legal/new?app=business&type=PRIVACY_POLICY')
    /* Business Privacy already has a 1.0.0 draft, so no "Start from" offer. */
    await expect(
      main(page).getByRole('radiogroup', { name: 'Start from' }),
    ).toHaveCount(0)
    const version = main(page).getByLabel('Version')
    await expect(version).toHaveValue('1.1.0')
    await version.fill('1.0.0')
    await main(page).getByRole('button', { name: 'Continue' }).click()
    await expect(
      main(page).getByText(/v1\.0\.0 of the Business Privacy Policy already exists/),
    ).toBeVisible()
  })

  test('the setup has a way back at the top, to the app it came from', async ({
    page,
  }) => {
    await open(page, '/legal/new?app=business&type=PRIVACY_POLICY')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New legal draft')
    const back = main(page).getByRole('link', { name: 'Legal & policies' })
    await expect(back).toBeInViewport()
    await back.click()
    await expect(page).toHaveURL(/\/legal\?app=business&tab=drafts$/)
    await expect(
      main(page).getByRole('button', { name: /^Business/, pressed: true }),
    ).toBeVisible()
  })

  test('on a desktop the whole setup fits the screen, Continue included', async ({
    page,
  }) => {
    /* User report 2026-11-17: two columns from lg, no scrolling to Continue. */
    test.skip(width(page) < 1024, 'Phones and tablets scroll a single column.')
    /* The tallest case: "Start from" is offered. */
    await open(page, '/legal/new?app=business&type=TERMS_OF_SERVICE')
    await expect(
      main(page).getByRole('radiogroup', { name: 'Start from' }),
    ).toBeVisible()
    await expect(main(page).getByRole('button', { name: 'Continue' })).toBeInViewport({
      ratio: 1,
    })
    await expect(main(page).getByRole('link', { name: 'Cancel' })).toBeInViewport({
      ratio: 1,
    })
    await expectNoSidewaysScroll(page)
  })

  test('changing the version offers a way back to the text at the top', async ({
    page,
  }) => {
    await open(page, '/legal/new?type=COMMUNITY_GUIDELINES')
    await main(page).getByRole('button', { name: 'Continue' }).click()
    await main(page).getByRole('button', { name: 'Change version' }).click()
    const back = main(page).getByRole('button', { name: 'Back to the text' }).first()
    await expect(back).toBeInViewport()
    await back.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Community Guidelines v1.0.0',
    )
  })

  test('the setup fields keep their whole focus ring', async ({ page }) => {
    await open(page, '/legal/new?type=TERMS_OF_SERVICE')
    await main(page).getByLabel('Version').focus()
    await expectFocusRingNotClipped(page, '#setup-version')
  })
})

/* ------------------------------------------------------------------ */

test.describe('publish', () => {
  test('typed confirmation, then History: the new version active, the old archived', async ({
    page,
  }) => {
    await openEditor(page)
    await main(page)
      .getByRole('button', { name: /Publish/ })
      .click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('v1.0.0 (active)')
    await expect(dialog).toContainText('v1.1.0 (new)')
    await dialog.getByLabel('Type this to confirm').fill('1.1.0')
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click()

    await expect(
      page.getByText('Privacy Policy v1.1.0 is now published.'),
    ).toBeVisible()
    /* Regression 2026-11-08: the refetch used to unmount the dialog first. */
    await expect(page).toHaveURL(/\/legal\?tab=history&type=PRIVACY_POLICY/)
    await expect(main(page).getByText("This version can't be edited")).toHaveCount(0)
    await expect(card(page, 'PRIVACY_POLICY')).toContainText('v1.1.0')
  })

  test('publishing for Business leaves Personal untouched', async ({ page }) => {
    /* plan.md LB3. Business Privacy 1.0.0 is a draft; Personal Privacy 1.0.0 is live. */
    await open(page, '/legal/cmwlegalbizprivacy10000001/edit')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Business Privacy Policy v1.0.0',
    )
    await main(page)
      .getByRole('button', { name: /Publish/ })
      .click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Nothing published')
    await expect(dialog).toContainText(
      'for the Business app. Personal is not affected.',
    )
    await dialog.getByLabel('Type this to confirm').fill('1.0.0')
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click()

    await expect(
      page.getByText('Business Privacy Policy v1.0.0 is now published.'),
    ).toBeVisible()
    await expect(page).toHaveURL(
      /\/legal\?app=business&tab=history&type=PRIVACY_POLICY/,
    )
    await expect(card(page, 'PRIVACY_POLICY')).toContainText('v1.0.0')

    const apps = main(page).getByRole('group', { name: 'App' })
    await expect(apps.getByRole('button', { name: /^Business/ })).toHaveAccessibleName(
      'Business, 1 of 4 policies live',
    )
    await apps.getByRole('button', { name: /^Personal/ }).click()
    await expect(card(page, 'PRIVACY_POLICY')).toContainText('v1.0.0')
    await expect(card(page, 'PRIVACY_POLICY')).toContainText('Draft v1.1.0 in progress')
    await expect(apps.getByRole('button', { name: /^Personal/ })).toHaveAccessibleName(
      'Personal, 3 of 4 policies live',
    )
  })

  test('closing the dialog returns focus to Publish', async ({ page }) => {
    await openEditor(page)
    const publish = main(page).getByRole('button', { name: /Publish/ })
    await publish.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(publish).toBeFocused()
  })
})

/* ------------------------------------------------------------------ */

test.describe('read-only version', () => {
  test('a published version: changes since the last one, and no editing', async ({
    page,
  }) => {
    await open(page, `/legal/${PRIVACY_100}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Privacy Policy v1.0.0',
    )
    await expect(main(page).getByText('Changes since v0.9.0')).toBeVisible()
    await expect(main(page).getByRole('link', { name: 'Open v0.9.0' })).toHaveAttribute(
      'href',
      `/legal/${PRIVACY_090}`,
    )
    await expect(main(page).getByRole('link', { name: /Edit draft/ })).toHaveCount(0)
    await expect(
      main(page).getByRole('link', { name: /New version from this/ }),
    ).toBeVisible()
    await expectNoSidewaysScroll(page)

    /* A side list from 1024px, a "Jump to section" disclosure below it. */
    const jump = main(page).getByText('Jump to section')
    if (await jump.isVisible()) await jump.click()
    await main(page)
      .locator('button:visible', { hasText: '3. Your Rights' })
      .first()
      .click()
    await expectFrameInPlace(page)
  })

  test('a Business version: its own website address and API slug, fitting', async ({
    page,
  }) => {
    /* plan.md LB4, decision 5: links follow the app; the slug is the server's. */
    await open(page, '/legal/cmwlegalbizprivacy10000001')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Business Privacy Policy v1.0.0',
    )
    await expect(main(page)).toContainText('callschat.com/privacy-policy/business')
    await expect(main(page)).toContainText('business-privacy-policy')
    await expectNoSidewaysScroll(page)
    expect(await axeViolations(page)).toEqual([])

    await open(page, '/legal/cmwlegalbizprivacy10000001/edit')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Business Privacy Policy v1.0.0',
    )
    await expectNoSidewaysScroll(page)
  })

  test('Business cards and rows say Business; an unknown address is not guessed', async ({
    page,
  }) => {
    await open(page, '/legal?app=business')
    await expect(card(page, 'PRIVACY_POLICY')).toContainText(
      'callschat.com/privacy-policy/business',
    )
    /* Only Business Privacy's address is given (plan.md B4). */
    await expect(card(page, 'TERMS_OF_SERVICE')).toContainText('No website address yet')
    await expect(card(page, 'TERMS_OF_SERVICE')).not.toContainText('callschat.com/')
    /* The draft row names the app too. */
    await expect(main(page).getByRole('tabpanel')).toContainText(
      'Business Privacy Policy',
    )
  })

  test('the edit URL of a published version says why not', async ({ page }) => {
    await open(page, `/legal/${PRIVACY_100}/edit`)
    await expect(main(page).getByText("This version can't be edited")).toBeVisible()
  })

  test('an unknown id says so', async ({ page }) => {
    await signIn(page)
    await page.goto('/legal/does-not-exist')
    await expect(main(page).getByText('Version not found')).toBeVisible()
  })
})

/* ------------------------------------------------------------------ */

test.describe('roles', () => {
  test('Admin: writes drafts, never publishes', async ({ page }) => {
    await openEditor(page, ACCOUNTS.admin)
    await expect(main(page).getByRole('button', { name: 'Save draft' })).toBeVisible()
    await expect(main(page).getByRole('button', { name: /Publish/ })).toHaveCount(0)

    await page.goto(`/legal/${PRIVACY_DRAFT}`)
    await expect(main(page).getByRole('link', { name: /Edit draft/ })).toBeVisible()
    await expect(main(page).getByRole('button', { name: /Publish/ })).toHaveCount(0)
  })

  test('Moderator: the route is barred, not blank', async ({ page }) => {
    await signIn(page, ACCOUNTS.moderator)
    await page.goto('/legal')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
    await page.goto(EDIT_DRAFT)
    await expect(page.getByText(/do not have access/i)).toBeVisible()
  })
})
