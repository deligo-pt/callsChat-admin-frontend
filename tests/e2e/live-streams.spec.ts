import { expect, test, type Locator, type Page } from '@playwright/test'

import { ACCOUNTS, expectNoSidewaysScroll, seedLiveFixtures, signIn } from './fixtures'

/**
 * Live stream management, phase L7 (plan.md Live §6), in a real browser at
 * every width.
 *
 * ⚠️ **Mock state lives in the page.** `page.goto` reloads the app and resets
 * every room to its seed, so each action test signs in, opens the room once and
 * stays inside the app from then on. The opt-in seed flag (`seedLiveFixtures`)
 * is kept in `sessionStorage`, so a reload brings the three on-air rooms back.
 *
 * The seeded rooms (src/mocks/handlers/liveRooms.ts):
 * - `lr_live_stage`: LIVE, 10 seats with 9 and 10 locked, a WARN in its log
 * - `lr_live_talk`: LIVE, empty log
 * - `lr_paused_game`: PAUSED, host offline (what the stale sweep ends)
 * plus the ended rooms measured on staging (`liveRoomsSeed.ts`).
 */

const STAGE_ROOM = '/live-streams/lr_live_stage'
const STAGE_TITLE = 'Friday Night Acoustic Stage'
const TALK_TITLE = 'Morning Talk — Career Q&A'
const PAUSED_TITLE = 'Late-night gaming lobby'
/** A staging room that has gifts in the ledger (seeded wallet history). */
const LEDGER_ROOM = 'cmvph9tft00kp01p68mid7a91'

const REASON = 'Recorded by the L7 end-to-end suite.'

function main(page: Page): Locator {
  return page.getByRole('main')
}

function region(page: Page, name: string): Locator {
  return main(page).getByRole('region', { name, exact: true })
}

async function openStageRoom(page: Page, account: string = ACCOUNTS.superAdmin) {
  await seedLiveFixtures(page)
  await signIn(page, account)
  await page.goto(STAGE_ROOM)
  await expect(page.getByRole('heading', { name: STAGE_TITLE, level: 1 })).toBeVisible()
}

/** Fill the shared dialog's reason (when it has one) and press its confirm button. */
async function confirm(page: Page, button: string | RegExp, reason = true) {
  const dialog = page.getByRole('dialog')
  if (reason) await dialog.getByRole('textbox', { name: /^Reason/ }).fill(REASON)
  await dialog.getByRole('button', { name: button }).click()
  await expect(dialog).toHaveCount(0)
}

async function expectLogEntry(page: Page, label: string) {
  await expect(
    region(page, 'Moderation log').getByText(label, { exact: true }).first(),
  ).toBeVisible({ timeout: 10_000 })
}

/* ------------------------------------------------------------------ */

test.describe('layout', () => {
  test('the list fits at this width, with and without rooms on air', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto('/live-streams')
    await expect(main(page).getByText('No one is live right now')).toBeVisible()
    await expectNoSidewaysScroll(page)

    await seedLiveFixtures(page)
    await page.goto('/live-streams')
    await expect(main(page).getByText(STAGE_TITLE).first()).toBeVisible()
    await expect(main(page).getByText(TALK_TITLE).first()).toBeVisible()
    await expectNoSidewaysScroll(page)

    await page.goto('/live-streams?tab=past')
    await expect(main(page).getByText(/past streams found/)).toBeAttached()
    await expectNoSidewaysScroll(page)
  })

  test('a live room fits: header, actions, stage, audience, money, log', async ({
    page,
  }) => {
    await openStageRoom(page)
    for (const name of ['Stage', 'Audience', 'Status', 'Money', 'Moderation log']) {
      await expect(region(page, name)).toBeVisible()
    }
    await expect(
      main(page).getByRole('group', { name: 'Moderation actions' }),
    ).toBeVisible()
    await expect(region(page, 'Listen silently')).toBeVisible()
    await expectNoSidewaysScroll(page)
  })

  test('an ended room drops the stage, audience and actions, and says why', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto(`/live-streams/${LEDGER_ROOM}`)
    await expect(main(page).getByText(/This stream has ended/)).toBeVisible()
    await expect(region(page, 'Stage')).toHaveCount(0)
    await expect(region(page, 'Audience')).toHaveCount(0)
    await expect(
      main(page).getByRole('group', { name: 'Moderation actions' }),
    ).toHaveCount(0)
    await expect(region(page, 'Listen silently')).toHaveCount(0)
    await expect(region(page, 'Moderation log')).toBeVisible()
    await expectNoSidewaysScroll(page)
  })

  test('every action dialog fits at this width', async ({ page }) => {
    await openStageRoom(page)
    const actions = main(page).getByRole('group', { name: 'Moderation actions' })
    for (const [button, title] of [
      ['Warn', 'Warn the host'],
      ['Lockdown', 'Lock down the room'],
      ['Purge chat', 'Purge the chat'],
      ['Terminate', 'Terminate the stream'],
    ] as const) {
      await actions.getByRole('button', { name: button }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('heading', { name: title })).toBeVisible()
      const fits = await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
      expect(fits, `${title} scrolls sideways`).toBe(true)
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
    }
  })

  test('an unknown room says so instead of failing', async ({ page }) => {
    await signIn(page)
    await page.goto('/live-streams/no_such_room')
    await expect(main(page).getByText('Stream not found')).toBeVisible()
  })
})

/* ------------------------------------------------------------------ */

test.describe('tabs and filters live in the URL', () => {
  test('a filter and the Past tab survive a reload and the back button', async ({
    page,
  }) => {
    await seedLiveFixtures(page)
    await signIn(page)

    await page.goto('/live-streams?search=Morning')
    await expect(main(page).getByText(TALK_TITLE).first()).toBeVisible()
    await expect(main(page).getByText(STAGE_TITLE)).toHaveCount(0)
    await page.reload()
    await expect(main(page).getByText(TALK_TITLE).first()).toBeVisible()
    await expect(main(page).getByText(STAGE_TITLE)).toHaveCount(0)

    await page.goto('/live-streams?status=PAUSED')
    await expect(main(page).getByText(PAUSED_TITLE).first()).toBeVisible()
    await expect(main(page).getByText(TALK_TITLE)).toHaveCount(0)

    await main(page)
      .getByRole('tab', { name: /Past streams/ })
      .click()
    await expect(page).toHaveURL(/tab=past/)
    // The Past tab can't use the Live-only status filter, so it is dropped.
    await expect(page).not.toHaveURL(/status=PAUSED/)
    // Filters replace the history entry, so the URL is the state: reload keeps it.
    await page.reload()
    await expect(page).toHaveURL(/tab=past/)
    await main(page)
      .getByRole('tab', { name: /Live now/ })
      .click()
    await expect(page).not.toHaveURL(/tab=past/)
    await expect(main(page).getByText(STAGE_TITLE).first()).toBeVisible()
  })

  test('Past dates are whole Bangladesh days, not UTC days', async ({ page }) => {
    /*
     * The seed has two rooms started 2026-10-31 ~06:00 UTC (31 Oct in Dhaka)
     * and seven started 31 Oct 22:47–23:30 UTC — which is **1 Nov** in Dhaka.
     * A UTC-day filter would put all nine on 31 Oct.
     */
    const sent: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/admin/live/rooms/history')) sent.push(request.url())
    })
    await signIn(page)

    await page.goto('/live-streams?tab=past&fromDate=2026-10-31&toDate=2026-10-31')
    await expect(main(page).getByText('2 past streams found.')).toBeAttached()

    await page.goto('/live-streams?tab=past&fromDate=2026-11-01&toDate=2026-11-01')
    await expect(main(page).getByText('7 past streams found.')).toBeAttached()

    const last = new URL(sent.at(-1) ?? 'http://x')
    expect(last.searchParams.get('startDate')).toBe('2026-10-31T18:00:00.000Z')
    expect(last.searchParams.get('endDate')).toBe('2026-11-01T17:59:59.999Z')
  })

  test('a room opened from a filtered list goes back to that list', async ({
    page,
  }) => {
    await seedLiveFixtures(page)
    await signIn(page)
    await page.goto('/live-streams?search=Morning')
    await main(page).getByRole('link', { name: TALK_TITLE }).first().click()
    await expect(
      page.getByRole('heading', { name: TALK_TITLE, level: 1 }),
    ).toBeVisible()

    await main(page).getByRole('link', { name: 'Live streams' }).click()
    await expect(page).toHaveURL(/\/live-streams\?search=Morning$/)
  })
})

/* ------------------------------------------------------------------ */

test.describe('the room page', () => {
  test('stage, audience, status, money and log render from the room', async ({
    page,
  }) => {
    await openStageRoom(page)

    const stage = region(page, 'Stage')
    await expect(stage.getByText(/of 10 seats taken · 2 locked/)).toBeVisible()
    // The host's own seat has no ⋯ menu; every other filled seat does.
    await expect(
      stage.getByRole('button', { name: /^Actions for / }).first(),
    ).toBeVisible()

    await expect(
      region(page, 'Audience')
        .getByRole('button', { name: /^Actions for / })
        .first(),
    ).toBeVisible()
    await expect(region(page, 'Money')).toContainText(/gift/i)
    await expectLogEntry(page, 'Warning')
    await expect(main(page).getByText('Updates every 5 seconds')).toBeVisible()
  })
})

/* ------------------------------------------------------------------ */

test.describe('every moderation action, against the mock', () => {
  test('Warn records a warning in the log', async ({ page }) => {
    await openStageRoom(page)
    const before = await region(page, 'Moderation log')
      .getByText('Warning', { exact: true })
      .count()

    await main(page).getByRole('button', { name: 'Warn', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const send = dialog.getByRole('button', { name: 'Send the warning' })
    // Never disabled (ConfirmActionDialog): pressing it early keeps the dialog open.
    await send.click()
    await expect(dialog).toBeVisible()
    await dialog
      .getByRole('textbox', { name: /Message the host sees/ })
      .fill('Please keep the stream within the guidelines.')
    await confirm(page, 'Send the warning', false)

    await expect(
      page.getByText('Administrative warning dispatched successfully'),
    ).toBeVisible()
    await expect(
      region(page, 'Moderation log').getByText('Warning', { exact: true }),
    ).toHaveCount(before + 1, { timeout: 10_000 })
  })

  test('Mute then Unmute a speaker on the stage', async ({ page }) => {
    await openStageRoom(page)
    const stage = region(page, 'Stage')
    const menu = stage.getByRole('button', { name: /^Actions for / }).first()
    const name = (await menu.getAttribute('aria-label'))!.replace('Actions for ', '')

    await menu.click()
    const first = page.getByRole('menuitem', { name: /^(Mute|Unmute)$/ })
    const firstLabel = (await first.textContent())!.trim()
    await first.click()
    await confirm(page, firstLabel)
    await expectLogEntry(page, firstLabel === 'Mute' ? 'Muted' : 'Unmuted')

    // The seat's menu now offers the opposite.
    await stage.getByRole('button', { name: `Actions for ${name}` }).click()
    const second = firstLabel === 'Mute' ? 'Unmute' : 'Mute'
    await page.getByRole('menuitem', { name: second, exact: true }).click()
    await confirm(page, second)
    await expectLogEntry(page, second === 'Mute' ? 'Muted' : 'Unmuted')
  })

  test('Remove and Block take a person out of the audience', async ({ page }) => {
    await openStageRoom(page)
    const audience = region(page, 'Audience')
    const menus = audience.getByRole('button', { name: /^Actions for / })

    const removed = (await menus.first().getAttribute('aria-label'))!
    await menus.first().click()
    await page.getByRole('menuitem', { name: 'Remove from room' }).click()
    await confirm(page, 'Remove')
    await expectLogEntry(page, 'Kicked')
    await expect(
      audience.getByRole('button', { name: removed, exact: true }),
    ).toHaveCount(0, {
      timeout: 10_000,
    })

    const blocked = (await menus.first().getAttribute('aria-label'))!
    await menus.first().click()
    await page.getByRole('menuitem', { name: 'Block' }).click()
    await confirm(page, 'Block')
    await expectLogEntry(page, 'Blocked')
    await expect(
      audience.getByRole('button', { name: blocked, exact: true }),
    ).toHaveCount(0, {
      timeout: 10_000,
    })
  })

  test('Lockdown switches chat and gifts off and shows in the log', async ({
    page,
  }) => {
    await openStageRoom(page)
    await main(page).getByRole('button', { name: 'Lockdown' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('cannot be turned back on from the panel')
    await dialog.getByRole('checkbox', { name: 'Turn off chat' }).check()
    await dialog.getByRole('checkbox', { name: 'Turn off gifts' }).check()
    await confirm(page, 'Apply the lockdown')

    await expect(
      page.getByText('Emergency stage lockdown applied successfully'),
    ).toBeVisible()
    await expectLogEntry(page, 'Lockdown')
  })

  test('Purge chat shows in the log', async ({ page }) => {
    await openStageRoom(page)
    await main(page).getByRole('button', { name: 'Purge chat' }).click()
    await confirm(page, 'Purge the chat')
    await expect(
      page.getByText('Live room chat conversation purged successfully'),
    ).toBeVisible()
    await expectLogEntry(page, 'Chat purged')
  })

  test('Terminate needs the host name typed, then ends the room', async ({ page }) => {
    await openStageRoom(page)
    await main(page).getByRole('button', { name: 'Terminate' }).click()
    const dialog = page.getByRole('dialog')
    const host = (await dialog.locator('code').textContent())!.trim()

    await dialog.getByRole('textbox', { name: /^Reason/ }).fill(REASON)
    await dialog.getByRole('button', { name: 'End the stream' }).click()
    // Not typed yet: the dialog refuses and stays open.
    await expect(dialog).toBeVisible()

    await dialog.getByRole('textbox', { name: 'Type this to confirm' }).fill(host)
    await dialog.getByRole('button', { name: 'End the stream' }).click()
    await expect(dialog).toHaveCount(0)

    await expect(page.getByText('Live room terminated successfully')).toBeVisible()
    await expect(main(page).getByText(/This stream has ended/)).toBeVisible({
      timeout: 10_000,
    })
    await expect(region(page, 'Stage')).toHaveCount(0)
    await expect(
      main(page).getByRole('group', { name: 'Moderation actions' }),
    ).toHaveCount(0)
    await expectLogEntry(page, 'Terminated')
  })

  test('the stale sweep ends the paused room', async ({ page }) => {
    await seedLiveFixtures(page)
    await signIn(page)
    await page.goto('/live-streams?status=PAUSED')
    await expect(main(page).getByText(PAUSED_TITLE).first()).toBeVisible()

    await page.getByRole('button', { name: 'Run stale-stream sweep' }).click()
    const dialog = page.getByRole('dialog')
    const minutes = dialog.getByRole('textbox', { name: /Host away for at least/ })
    await minutes.fill('0')
    await expect(dialog.getByRole('alert')).toContainText('A whole number')
    await dialog.getByRole('button', { name: 'Run the sweep' }).click()
    await expect(dialog).toBeVisible()
    await minutes.fill('5')
    await dialog.getByRole('button', { name: 'Run the sweep' }).click()
    await expect(dialog).toHaveCount(0)

    await expect(page.getByText(/1 stale streams swept/)).toBeVisible()
    await expect(main(page).getByText(PAUSED_TITLE)).toHaveCount(0, { timeout: 15_000 })
  })
})

/* ------------------------------------------------------------------ */

test.describe('connections', () => {
  test('gift ledger → room → back to Gift transactions', async ({ page }) => {
    await signIn(page)
    await page.goto(`/diamonds/transactions?contextId=${LEDGER_ROOM}`)
    await main(page)
      .getByRole('link', { name: "App Developer's Audio Room" })
      .first()
      .click()
    await expect(page).toHaveURL(new RegExp(`/live-streams/${LEDGER_ROOM}$`))

    await main(page).getByRole('link', { name: 'Gift transactions' }).click()
    await expect(page).toHaveURL(
      new RegExp(`/diamonds/transactions\\?contextId=${LEDGER_ROOM}`),
    )
  })

  test('room → "Gifts in this room" opens the ledger filtered to it', async ({
    page,
  }) => {
    await signIn(page)
    await page.goto(`/live-streams/${LEDGER_ROOM}`)
    await region(page, 'Money')
      .getByRole('link', { name: /Gifts in this room/ })
      .click()
    await expect(page).toHaveURL(new RegExp(`contextId=${LEDGER_ROOM}`))
    await expect(main(page).getByText('Room:')).toBeVisible()
  })

  test('Live hosts → Open room → back to Live hosts', async ({ page }) => {
    await seedLiveFixtures(page)
    await signIn(page)
    await page.goto('/hosts')
    await main(page).getByRole('link', { name: 'Open room' }).first().click()
    await expect(page).toHaveURL(/\/live-streams\/lr_/)

    await main(page).getByRole('link', { name: 'Live hosts' }).first().click()
    await expect(page).toHaveURL(/\/hosts$/)
  })

  test("the room's host → their account → Live now · Open room", async ({ page }) => {
    await openStageRoom(page)
    const header = main(page).getByRole('region', { name: 'Stream' })
    await header.getByRole('link').first().click()
    await expect(page).toHaveURL(/\/users\//)

    await main(page).getByRole('link', { name: 'Live now · Open room' }).click()
    await expect(
      page.getByRole('heading', { name: STAGE_TITLE, level: 1 }),
    ).toBeVisible()
    await main(page).getByRole('link', { name: 'Back to the account' }).click()
    await expect(page).toHaveURL(/\/users\//)
  })
})

/* ------------------------------------------------------------------ */

test.describe('who sees what', () => {
  test('Super Admin: moderation, the sweep and Listen', async ({ page }) => {
    await openStageRoom(page)
    await expect(
      main(page).getByRole('group', { name: 'Moderation actions' }),
    ).toBeVisible()
    await expect(region(page, 'Listen silently')).toBeVisible()
    await page.goto('/live-streams')
    await expect(
      page.getByRole('button', { name: 'Run stale-stream sweep' }),
    ).toBeVisible()
  })

  test('Admin: moderation and the sweep, but no Listen', async ({ page }) => {
    await openStageRoom(page, ACCOUNTS.admin)
    await expect(
      main(page).getByRole('group', { name: 'Moderation actions' }),
    ).toBeVisible()
    await expect(
      region(page, 'Stage')
        .getByRole('button', { name: /^Actions for / })
        .first(),
    ).toBeVisible()
    await expect(region(page, 'Listen silently')).toHaveCount(0)
    await page.goto('/live-streams')
    await expect(
      page.getByRole('button', { name: 'Run stale-stream sweep' }),
    ).toBeVisible()
  })

  test('Moderator: the route is barred, not blank', async ({ page }) => {
    await seedLiveFixtures(page)
    await signIn(page, ACCOUNTS.moderator)
    await page.goto(STAGE_ROOM)
    await expect(page.getByText(/do not have access/i)).toBeVisible()
    await page.goto('/live-streams')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
  })
})

/* ------------------------------------------------------------------ */

test.describe('Listen silently', () => {
  test('confirm first; a failed connection says so and leaves Listen ready', async ({
    page,
  }) => {
    await openStageRoom(page)
    const panel = region(page, 'Listen silently')
    await panel.getByRole('button', { name: 'Listen' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Nothing is recorded or saved')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)

    await panel.getByRole('button', { name: 'Listen' }).click()
    await confirm(page, 'Start listening', false)
    // The mock's LiveKit address does not exist.
    await expect(panel.getByRole('alert')).toBeVisible({ timeout: 20_000 })
    await expect(panel.getByRole('button', { name: 'Listen' })).toBeEnabled()
    await expect(page.locator('audio')).toHaveCount(0)
  })

  test('a paused room offers no listening', async ({ page }) => {
    await seedLiveFixtures(page)
    await signIn(page)
    await page.goto('/live-streams/lr_paused_game')
    await expect(
      page.getByRole('heading', { name: PAUSED_TITLE, level: 1 }),
    ).toBeVisible()
    await expect(region(page, 'Listen silently')).toHaveCount(0)
  })
})
