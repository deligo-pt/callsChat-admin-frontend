import { expect, test, type Page } from '@playwright/test'

import {
  ACCOUNTS,
  expectFocusRingNotClipped,
  expectNoSidewaysScroll,
  seedHostFixtures,
  signIn,
} from './fixtures'

/**
 * The gift & emoji catalog and the gift ledger in a real browser — phase G6.
 *
 * G1–G5 shipped on jsdom. What only a real engine can answer:
 *
 *   - whether the **two-phase upload** works as a real `XMLHttpRequest` PUT
 *     to a different origin, with the content type the `upload-url` request
 *     named — jsdom never sends a byte;
 *   - whether a **400-character gift name** and a 25-character room id keep
 *     each page inside its own width at 360px;
 *   - whether the editors' focus rings survive their scrolling bodies.
 *
 * ⚠️ **What this cannot prove.** The storage PUT is answered by the mock
 * service worker, not by `media.callschat.com` — the real host has never
 * been reached from this machine (plan.md O13). And in local mock mode the
 * API base is `http://localhost`, so every stored asset is refused as not
 * `https:` and shows "Unsafe asset URL" by design; Lottie playback was
 * checked on staging instead.
 */

const FILES = 'tests/e2e/files'
const LOTTIE = `${FILES}/golden_rose.json`
const STORAGE = 'https://media.callschat.com/'

/** Every request sent to the storage host, with method and content type. */
function storageRequests(page: Page) {
  const seen: { method: string; contentType: string | undefined }[] = []
  page.on('request', (request) => {
    if (request.url().startsWith(STORAGE)) {
      seen.push({
        method: request.method(),
        contentType: request.headers()['content-type'],
      })
    }
  })
  return seen
}

test.describe('the gift catalog', () => {
  test('lays out the hostile gift name without sideways scroll', async ({ page }) => {
    await signIn(page)
    await page.goto('/diamonds/gifts')
    await expect(page.getByRole('heading', { name: 'Popular Gifts' })).toBeVisible()
    await expect(page.getByText('Love Guitar')).toBeVisible()
    await expectNoSidewaysScroll(page)
  })

  test('creates a gift, sending the bytes to storage before the record', async ({
    page,
  }) => {
    const storage = storageRequests(page)
    const order: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.endsWith('/admin/catalog/upload-url')) order.push('upload-url')
      else if (request.url().startsWith(STORAGE) && request.method() === 'PUT')
        order.push('storage')
      else if (url.pathname.endsWith('/admin/gifts') && request.method() === 'POST')
        order.push('create')
    })

    await signIn(page)
    await page.goto('/diamonds/gifts')
    const create = page.getByRole('button', { name: 'New gift' })
    await expect(create).toBeEnabled()
    await create.click()

    const dialog = page.getByRole('dialog', { name: 'New gift' })
    await dialog.getByLabel(/^Name/).fill('Golden Rose')
    await dialog.getByRole('combobox', { name: /Category/ }).click()
    await page.getByRole('option', { name: 'VIP Luxuries' }).click()
    await dialog.getByLabel(/^Price in diamonds/).fill('120')
    await dialog.getByLabel('Animation file').setInputFiles(LOTTIE)
    await expect(dialog.getByText('golden_rose.json')).toBeVisible()

    await dialog.getByRole('button', { name: 'Create gift' }).click()
    await expect(page.getByText('Gift created.')).toBeVisible()

    expect(order).toEqual(['upload-url', 'storage', 'create'])
    /*
     * PUTs only: once the record exists, its thumbnail is fetched from the
     * same host with a GET, and whether that has started yet is timing.
     */
    expect(storage.filter((request) => request.method === 'PUT')).toEqual([
      { method: 'PUT', contentType: 'application/json' },
    ])
    await expect(
      page
        .getByRole('list', { name: 'Gifts in VIP Luxuries' })
        .getByText('Golden Rose'),
    ).toBeVisible()
  })

  test('keeps the price field’s focus ring inside the editor', async ({ page }) => {
    await signIn(page)
    await page.goto('/diamonds/gifts')
    await page.getByRole('button', { name: 'Actions for Heart Icon' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    const price = page
      .getByRole('dialog', { name: 'Edit gift' })
      .getByLabel(/^Price in diamonds/)
    await price.focus()
    await expectFocusRingNotClipped(
      page,
      '[role="dialog"] input:focus-visible, [role="dialog"] input:focus',
    )
  })
})

test.describe('emoji packs', () => {
  test('renders the packs without sideways scroll', async ({ page }) => {
    await signIn(page)
    await page.goto('/emoji-packs')
    await expect(page.getByRole('heading', { name: 'Official Emojis' })).toBeVisible()
    await expect(page.getByText(':heart_eyes:')).toBeVisible()
    await expectNoSidewaysScroll(page)
  })

  test('adds two emojis in one batch, each file uploaded once', async ({ page }) => {
    const storage = storageRequests(page)
    await signIn(page)
    await page.goto('/emoji-packs')

    await page.getByRole('button', { name: 'Actions for Official Emojis' }).click()
    await page.getByRole('menuitem', { name: 'Add several' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add several emojis' })

    await dialog
      .getByLabel('Emoji files')
      .setInputFiles([`${FILES}/party_face.json`, `${FILES}/sleepy.json`])
    await expect(dialog.getByLabel('Shortcode for sleepy.json')).toHaveValue(':sleepy:')
    await dialog.getByRole('button', { name: 'Add 2 emojis' }).click()

    await expect(page.getByText('2 emojis added.')).toBeVisible()
    expect(storage.filter((request) => request.method === 'PUT')).toHaveLength(2)
    await expect(page.getByText(':party_face:')).toBeVisible()
  })

  test('names who holds a taken shortcode, before uploading anything', async ({
    page,
  }) => {
    const storage = storageRequests(page)
    await signIn(page)
    await page.goto('/emoji-packs')

    await page.getByRole('button', { name: 'Actions for [TEST] Premium Empty' }).click()
    await page.getByRole('menuitem', { name: 'Add an emoji' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add an emoji' })
    await dialog.getByLabel('Emoji file').setInputFiles(`${FILES}/blushing.json`)
    await expect(dialog.getByLabel(/^Shortcode/)).toHaveValue(':blushing:')
    await dialog.getByRole('button', { name: 'Add emoji' }).click()

    await expect(
      dialog.getByText(/Already used by Blushing in Official Emojis/),
    ).toBeVisible()
    expect(storage).toEqual([])
  })
})

test.describe('the gift ledger', () => {
  test('keeps rows inside their width, room id included', async ({ page }) => {
    await signIn(page)
    await page.goto('/diamonds/transactions')
    await expect(page.getByText('Chocolate Box (as sent)').first()).toBeVisible()
    await expectNoSidewaysScroll(page)
  })

  test('opens from a user record, filtered to that person', async ({ page }) => {
    await signIn(page)
    await page.goto('/users/usr_000001')
    await page.getByRole('tab', { name: 'Finance' }).click()
    const link = page.getByRole('link', { name: 'See gifts received' })
    const href = await link.getAttribute('href')
    expect(href).toBe('/diamonds/transactions?receiverId=usr_000001')
    await link.click()

    await expect(page).toHaveURL(/\/diamonds\/transactions\?receiverId=usr_000001$/)
    /* Nobody in the seeded directory has sent a mock gift: an honest empty set. */
    await expect(page.getByText('No gifts match this view')).toBeVisible()
    await expect(page.getByText('Received by:')).toBeVisible()
  })

  test('opens from the host roster, filtered to that host', async ({ page }) => {
    await seedHostFixtures(page)
    await signIn(page)
    await page.goto('/hosts')
    await page.getByRole('link', { name: 'Gifts received' }).first().click()
    await expect(page).toHaveURL(/\/diamonds\/transactions\?receiverId=/)
    await expect(page.getByText('Received by:')).toBeVisible()
  })
})

test.describe('who may open what', () => {
  /*
   * Asserted on the guarded PAGES, not the sidebar: below `lg` the nav is a
   * closed drawer, so link absence would describe the viewport.
   */
  test('an Admin reads the gift catalog and the ledger, and never edits', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.admin)

    await page.goto('/diamonds/gifts')
    await expect(page.getByRole('heading', { name: 'Popular Gifts' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New gift' })).toHaveCount(0)

    await page.goto('/diamonds/transactions')
    await expect(page.getByText('Chocolate Box (as sent)').first()).toBeVisible()

    await page.goto('/emoji-packs')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
    await expect(page.getByText('Official Emojis')).toHaveCount(0)
  })

  test('a Moderator is refused all three', async ({ page }) => {
    await signIn(page, ACCOUNTS.moderator)
    for (const route of ['/diamonds/gifts', '/diamonds/transactions', '/emoji-packs']) {
      await page.goto(route)
      await expect(page.getByText(/do not have access/i)).toBeVisible()
    }
    await expect(page.getByText('Chocolate Box (as sent)')).toHaveCount(0)
  })
})
