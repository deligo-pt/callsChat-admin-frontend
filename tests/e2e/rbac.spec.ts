import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, signIn } from './fixtures'

/**
 * Phase 3D — RBAC gating.
 *
 * The gate: **no action button leaks to a role lacking permission.** These
 * assert the whole matrix rather than spot-checking, because a leak is silent
 * — the button simply works until the backend refuses, and by then the
 * operator believes they were entitled to use it.
 *
 * Permissions come from the interim role map (`auth/permissions.ts`) until the
 * API supplies `permissions[]` (plan.md 3A′ #1). When it does, these tests keep
 * their meaning: they describe the RULES, not the mechanism.
 */

const USER = '/users/usr_000001'

/** Every gated control on the user module, by accessible name. */
const CONTROLS = {
  suspend: 'Suspend',
  ban: 'Ban',
  lift: 'Lift suspension',
  restore: 'Restore account',
  changeRole: 'Change role',
  addRestriction: 'Add restriction',
  revokeAll: 'Revoke all sessions',
} as const

async function visible(page: Page, name: string): Promise<boolean> {
  return (await page.getByRole('button', { name, exact: true }).count()) > 0
}

async function openUser(page: Page) {
  await page.goto(USER)
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
}

test.describe('Super Admin', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)
    await openUser(page)
  })

  test('holds every user-management action', async ({ page }) => {
    // Status actions depend on the record's state; at least one must be offered.
    const anyStatusAction =
      (await visible(page, CONTROLS.suspend)) ||
      (await visible(page, CONTROLS.lift)) ||
      (await visible(page, CONTROLS.restore))
    expect(anyStatusAction).toBe(true)

    expect(await visible(page, CONTROLS.changeRole)).toBe(true)

    await page.getByRole('tab', { name: 'Access & restrictions' }).click()
    expect(await visible(page, CONTROLS.addRestriction)).toBe(true)
  })

  test('reaches every module route the backend serves', async ({ page }) => {
    for (const route of ['/users', '/dashboard', '/account']) {
      await page.goto(route)
      await expect(page.getByText(/do not have access/i)).toHaveCount(0)
    }
  })
})

test.describe('Admin', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await openUser(page)
  })

  test('may suspend and ban but may NOT change a platform role', async ({ page }) => {
    /*
     * Promoting an account to ADMIN grants admin-panel access. That is
     * privilege escalation, which `doc/RBAC, Security, and Privacy.md:52`
     * reserves for Super Admin — so this control must not appear.
     */
    expect(await visible(page, CONTROLS.changeRole)).toBe(false)

    const canActOnStatus =
      (await visible(page, CONTROLS.suspend)) ||
      (await visible(page, CONTROLS.lift)) ||
      (await visible(page, CONTROLS.restore))
    expect(canActOnStatus).toBe(true)
  })

  test('may restrict a capability', async ({ page }) => {
    await page.getByRole('tab', { name: 'Access & restrictions' }).click()
    expect(await visible(page, CONTROLS.addRestriction)).toBe(true)
  })
})

test.describe('Moderator', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.moderator)
    await openUser(page)
  })

  test('may NOT suspend, ban, restore or change a role', async ({ page }) => {
    for (const name of [
      CONTROLS.suspend,
      CONTROLS.ban,
      CONTROLS.lift,
      CONTROLS.restore,
      CONTROLS.changeRole,
    ]) {
      expect(await visible(page, name), `${name} leaked to Moderator`).toBe(false)
    }
  })

  test('may restrict a capability and revoke sessions', async ({ page }) => {
    // The Moderator tier exists to act on safety without touching account state.
    await page.getByRole('tab', { name: 'Access & restrictions' }).click()
    expect(await visible(page, CONTROLS.addRestriction)).toBe(true)
  })

  test('still sees the record, because users.view is granted to every tier', async ({
    page,
  }) => {
    await expect(page.getByRole('tab', { name: 'Finance' })).toBeVisible()
  })

  test('gets ForbiddenState — not a crash, not a blank page — on a barred route', async ({
    page,
  }) => {
    /*
     * plan.md §3.4: forcing the URL yields a safe access-denied state that
     * leaks nothing about what is behind it. A Moderator holds no
     * `analytics.view`, so the dashboard is barred.
     */
    await page.goto('/dashboard')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
    await expect(page.getByText('Something went wrong')).toHaveCount(0)
  })

  test('can always manage their OWN credentials', async ({ page }) => {
    // Gating this would lock a Moderator out of changing their own password.
    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible()
  })
})

test.describe('the access-denied state', () => {
  test('reveals nothing about the resource behind it', async ({ page }) => {
    await signIn(page, ACCOUNTS.moderator)
    await page.goto('/dashboard')

    const body = (await page.locator('main').textContent()) ?? ''
    /*
     * A 403 must not disclose whether data exists or what it contains —
     * otherwise the error itself becomes an information leak.
     */
    expect(body).not.toMatch(/\d{2,}/)
    expect(body).not.toMatch(/usr_|adm_/)
  })
})

test.describe('permission bootstrap', () => {
  /*
   * Phase A5's two acceptance criteria for the permission bridge — pinned now,
   * while the bridge is still inert, because they are the checks that decide
   * whether it can ever be switched on.
   *
   * `POST /admin/auth/login` returns a real `adminPermissions` array;
   * `GET /admin/auth/me` returns `[]` for the same token
   * (staff_management_plan.md §3.2). `LoginPage` seeds the session cache from
   * the login response, and a reload reads `/me` — so consuming those keys
   * today gives correct navigation on login and an empty panel on F5.
   *
   * These tests fail the moment that divergence appears in the UI, whoever
   * introduces it.
   */

  /**
   * The sidebar's links, at any viewport.
   *
   * ⚠️ Rewritten on 2026-09-29, when this returned **zero links at 360 and
   * 768** and the test failed on its first assertion, before any reload. Two
   * separate faults, both of which had to be fixed for it to mean anything:
   *
   * 1. `getByRole('navigation').first()` is ambiguous. There are two
   *    `<nav>` landmarks on an admin page — the sidebar (`aria-label="Modules"`)
   *    and the breadcrumb (`aria-label="Breadcrumb"`) — and which one comes
   *    first in the DOM depends on whether the sidebar is rendered at all.
   *    Below `lg` it is not, so `.first()` matched the breadcrumb and read its
   *    zero links. Now named explicitly.
   * 2. Below `lg` the sidebar lives behind an "Open navigation" toggle and is
   *    not in the DOM until it is opened. Reading links without opening it is a
   *    statement about the viewport, not about permissions — which is exactly
   *    what the sibling test below already says in its own comment. So the
   *    drawer is opened when the toggle is present.
   */
  async function navLabels(page: Page): Promise<string[]> {
    /*
     * Driven by the viewport, not by probing the DOM. `isVisible()` does NOT
     * auto-wait — it answers about this instant — so asking it right after a
     * sign-in returned `false` before the top bar had painted, the drawer was
     * never opened, and the wait below then timed out against a sidebar that
     * was never going to appear.
     */
    const belowLg = (page.viewportSize()?.width ?? 0) < 1024

    if (belowLg) {
      // `click()` auto-waits for the toggle, which removes the race entirely.
      await page.getByRole('button', { name: 'Open navigation' }).click()
    }

    /*
     * ⚠️ Scoped to the drawer below `lg`, because the desktop `<aside>` is
     * rendered at every width and merely hidden with `lg:block`. Once the
     * drawer opens there are TWO `aria-label="Modules"` landmarks in the DOM —
     * one hidden, one visible — and an unscoped locator is a strict-mode
     * violation rather than an honest read.
     */
    const nav = belowLg
      ? page.getByRole('dialog').getByRole('navigation', { name: 'Modules' })
      : page.getByRole('navigation', { name: 'Modules' })

    await nav.waitFor()
    return (await nav.getByRole('link').allInnerTexts()).map((text) => text.trim())
  }

  test('an Admin sees the same navigation after a reload as on login', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.admin)
    const onLogin = await navLabels(page)
    expect(onLogin.length).toBeGreaterThan(0)

    await page.reload()
    expect(await navLabels(page)).toEqual(onLogin)
  })

  test('a Super Admin keeps full access across a reload', async ({ page }) => {
    /*
     * §3.1, the module's most dangerous line: `/me` returns
     * `adminPermissions: []` for a Super Admin too, and an empty array there
     * means *unlimited*, not *none*. Any check that reads the array before the
     * role locks the Super Administrator out of their own panel.
     */
    await signIn(page, ACCOUNTS.superAdmin)
    /*
     * Asserted on the guarded PAGE, not the sidebar link: below `lg` the nav
     * collapses into a drawer, so link visibility is a statement about the
     * viewport rather than about permissions.
     */
    await page.goto('/staff')
    await expect(page.getByRole('heading', { name: 'Staff', level: 1 })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Staff', level: 1 })).toBeVisible()
    await expect(page.getByText(/do not have access/i)).toHaveCount(0)
  })
})

test.describe('feedback.manage', () => {
  /*
   * Phase F5. Pinned separately from `staff.manage` because the two are
   * Super-Admin-only for **different reasons**, and only one of them can ever
   * change:
   *
   * - `staff.manage` is withheld because all eight `/admin/staff/*` routes are
   *   `verifySuperAdmin`-guarded. That is a deliberate backend rule.
   * - `feedback.manage` is withheld because `FEEDBACK_MANAGEMENT` is **absent
   *   from the enum the staff write routes validate against**, so nobody can
   *   be granted it (feedback_management_plan.md §3.1). The module is reachable
   *   only through the SUPER_ADMIN wildcard bypass.
   *
   * The day backend ask #1 lands, this describe block is what has to change —
   * and it will fail loudly rather than silently start over-granting.
   */

  test('a Super Admin reaches the queue and the ticket, on login and on reload', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.superAdmin)

    await page.goto('/feedback')
    await expect(
      page.getByRole('heading', { name: 'Feedback', level: 1 }),
    ).toBeVisible()

    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Feedback', level: 1 }),
    ).toBeVisible()
    await expect(page.getByText(/do not have access/i)).toHaveCount(0)

    /* The ticket route is guarded independently of the queue. */
    await page.goto('/feedback/fb_pending')
    await expect(
      page.getByRole('heading', { level: 1, name: /Audio cuts out/ }),
    ).toBeVisible()
  })

  test('an Admin is refused both routes, identically on login and on reload', async ({
    page,
  }) => {
    /*
     * Asserted on the guarded PAGES rather than the sidebar: below `lg` the nav
     * is a closed drawer, so link absence would be a statement about the
     * viewport rather than about permissions — the mistake this module's own
     * spec made and corrected in F1.
     */
    await signIn(page, ACCOUNTS.admin)

    await page.goto('/feedback')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
    /* No ticket data leaks into the forbidden state. */
    await expect(page.getByText('Audio cuts out during group call')).toHaveCount(0)

    await page.reload()
    await expect(page.getByText(/do not have access/i)).toBeVisible()

    await page.goto('/feedback/fb_pending')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
    await expect(page.getByText(/Audio cuts out/)).toHaveCount(0)
  })

  test('a Moderator is refused, exactly as an Admin is', async ({ page }) => {
    await signIn(page, ACCOUNTS.moderator)

    await page.goto('/feedback')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
    await expect(page.getByText('Audio cuts out during group call')).toHaveCount(0)
  })
})

test.describe('mobile bootstrap', () => {
  /*
   * Phase B5. Pinned separately from the feedback module's key because the
   * reason differs: this section introduces **no new permission**. It reuses
   * `configuration.view` to read and `configuration.configure` to write, which
   * the API's own `SYSTEM_SETTINGS_EDIT` bridges to.
   *
   * ⚠️ The gate is asserted here at the ROLE level only. Whether an `ADMIN`
   * holding `SYSTEM_SETTINGS_EDIT` is actually admitted by the API is
   * unverified (plan.md §2.6, §8 R5) — the only credential available is a
   * Super Admin, which bypasses module permissions. If that assumption is
   * wrong, this section needs a Super-Admin-only flag and these tests change
   * with it.
   */

  test('a Super Admin reaches it, and can edit, across a reload', async ({ page }) => {
    await signIn(page, ACCOUNTS.superAdmin)

    await page.goto('/settings/bootstrap')
    await expect(page.getByText('Release policy')).toBeVisible()
    /* Editing, not just reading — the write permission resolves too. */
    await expect(page.getByLabel('Maintenance mode')).toBeEnabled()

    await page.reload()
    await expect(page.getByLabel('Maintenance mode')).toBeEnabled()
    await expect(page.getByText(/do not have access/i)).toHaveCount(0)
  })

  test('a Moderator is refused, and no configuration leaks into the 403', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.moderator)

    await page.goto('/settings/bootstrap')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
    /* Nothing about the live configuration appears on the forbidden page. */
    await expect(page.getByText('Release policy')).toHaveCount(0)
    await expect(page.getByText(/javascript:/)).toHaveCount(0)
  })

  test('an Admin reaches the section, because settings are not Super-Admin-only', async ({
    page,
  }) => {
    /*
     * Unlike Staff and the feedback queue, System Settings is granted to
     * ADMIN by role. Asserted so that narrowing this section later is a
     * decision someone makes, not a side effect.
     */
    await signIn(page, ACCOUNTS.admin)

    await page.goto('/settings/bootstrap')
    await expect(page.getByText('Release policy')).toBeVisible()
  })
})

test.describe('verifications.review', () => {
  /*
   * Phase V5. Pinned separately again, because this permission is
   * Super-Admin-only for a **third** distinct reason — and unlike the other two,
   * this one is expected to change.
   *
   * - `staff.manage` is withheld because all eight `/admin/staff/*` routes are
   *   `verifySuperAdmin`-guarded. A deliberate backend rule.
   * - `feedback.manage` is withheld because `FEEDBACK_MANAGEMENT` is absent from
   *   the enum the staff write routes validate against, so nobody can be granted
   *   it at all.
   * - `verifications.review` is **grantable**: `BUSINESS_VERIFY` is in that enum,
   *   and `features/staff/permissionMap.ts` bridges the two (plan.md §4.3). It is
   *   deliberately NOT granted to `ADMIN` by role, because the API requires the
   *   role *and* the per-account module permission — so a role grant would put a
   *   vault of identity documents in an Admin's sidebar that 403s on its first
   *   request. That is the same lie that retired the `configurationConfigure`
   *   role grant on 2026-09-03.
   *
   * ⚠️ So today only a Super Admin reaches this module, through the wildcard —
   * and that is a limitation, not a design goal (plan.md O8). The day
   * `GET /admin/auth/me` returns `adminPermissions`, a granted Admin is admitted
   * with **no change to this panel**, and these two refusal tests are what will
   * fail loudly rather than silently start over-granting.
   */

  test('a Super Admin reaches the queue and the application, across a reload', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.superAdmin)

    await page.goto('/verifications')
    await expect(
      page.getByRole('heading', { name: 'Verifications', level: 1 }),
    ).toBeVisible()

    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Verifications', level: 1 }),
    ).toBeVisible()
    await expect(page.getByText(/do not have access/i)).toHaveCount(0)

    /* The application route is guarded independently of the queue. */
    await page.goto('/verifications/cmulfjl62000201r33hha40xi')
    await expect(page.getByRole('button', { name: /^View/ })).toBeVisible()
  })

  test('an Admin is refused both routes, and no applicant data leaks', async ({
    page,
  }) => {
    /*
     * Asserted on the guarded PAGES rather than the sidebar: below `lg` the nav
     * is a closed drawer, so link absence would be a statement about the
     * viewport rather than about permissions.
     *
     * ⚠️ The leak assertions matter more here than anywhere else in this file.
     * A forbidden page that still rendered a file name or a company name would
     * expose which strangers have filed identity documents.
     */
    await signIn(page, ACCOUNTS.admin)

    await page.goto('/verifications')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
    await expect(page.getByText('DeliGo')).toHaveCount(0)

    await page.reload()
    await expect(page.getByText(/do not have access/i)).toBeVisible()

    await page.goto('/verifications/cmulfjl62000201r33hha40xi')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
    /* Not the document name, and not a View control that could fetch it. */
    await expect(page.getByText('_Weil_ Full.pdf')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^View/ })).toHaveCount(0)
  })

  test('a Moderator is refused, exactly as an Admin is', async ({ page }) => {
    await signIn(page, ACCOUNTS.moderator)

    await page.goto('/verifications')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
    await expect(page.getByText('DeliGo')).toHaveCount(0)

    await page.goto('/verifications/cmulfjl62000201r33hha40xi')
    await expect(page.getByText(/do not have access/i)).toBeVisible()
    await expect(page.getByText('_Weil_ Full.pdf')).toHaveCount(0)
  })
})
