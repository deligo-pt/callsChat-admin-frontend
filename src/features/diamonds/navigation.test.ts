import { describe, expect, it } from 'vitest'

import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { NAV_SECTIONS } from '@/layouts/navigation'

/**
 * Where the Diamonds module lives in the shell — phase W2.
 */

function section(id: string) {
  return NAV_SECTIONS.find((candidate) => candidate.id === id)
}

describe('the Diamonds section', () => {
  it('exists, between Compliance and Platform', () => {
    const ids = NAV_SECTIONS.map((s) => s.id)
    expect(ids).toContain('diamonds')
    expect(ids.indexOf('diamonds')).toBeGreaterThan(ids.indexOf('compliance'))
    expect(ids.indexOf('diamonds')).toBeLessThan(ids.indexOf('platform'))
  })

  it('uses the namespace that was reserved years before the module', () => {
    /*
     * ⚠️ `/diamonds/*` has been in `app/routes.ts` since the route map was
     * written, and `features/users/detail/panels.tsx` calls it "the Diamond
     * economy module" in copy already on screen. A second name for one thing
     * would have orphaned four reserved routes.
     */
    expect(ROUTES.topUps).toBe('/diamonds/top-ups')
    expect(section('diamonds')?.items[0]?.to).toBe(ROUTES.topUps)
  })

  it('is readable by ADMIN, not only Super Admin', () => {
    /*
     * ⚠️ `wallets.view` is granted to ADMIN; `diamonds.adjust` and
     * `diamond_packages.configure` are Super-Admin-only by RBAC policy. The
     * queue is operations work and must be reachable by the operations tier —
     * the writes inside gate themselves.
     */
    expect(section('diamonds')?.items[0]?.permission).toBe(PERMISSIONS.walletsView)
  })

  it('holds five places and no actions', () => {
    /*
     * ⚠️ **"Adjust a wallet" was here until 2026-10-27 and is deliberately
     * gone.** Adjusting a balance is an action *on a person*, not a place: the
     * page it had could not show whose account an opaque `userId` was, and had
     * to warn the operator it could not verify it. It now sits on the user
     * record beside suspend, ban and change-role. Both entries left are
     * places, and both are readable by the operations tier. The gift
     * ledger (G5) joined them on `ledger.view` — also granted to ADMIN. The
     * gift catalog (G2) was here too until it moved to Platform in T0.
     */
    const items = section('diamonds')?.items ?? []
    expect(items.map((item) => item.permission)).toEqual([
      PERMISSIONS.walletsView,
      PERMISSIONS.walletsView,
      PERMISSIONS.ledgerView,
      PERMISSIONS.ledgerView,
      // Host withdrawals (plan.md W0): ADMIN reads, Super Admin acts.
      PERMISSIONS.withdrawalsView,
    ])
  })

  it('does not offer a wallet-adjustment destination', () => {
    const labels = NAV_SECTIONS.flatMap((s) => s.items).map((item) => item.label)
    expect(labels).not.toContain('Adjust a wallet')
  })

  it('points every entry at its reserved route', () => {
    const items = section('diamonds')?.items ?? []
    expect(items.map((item) => item.to)).toEqual([
      ROUTES.topUps,
      ROUTES.diamondPackages,
      ROUTES.walletTransactions,
      ROUTES.diamondTransactions,
      ROUTES.withdrawals,
    ])
  })

  it('matches its own prefix and not the sibling routes', () => {
    /*
     * ⚠️ `/diamonds/top-ups`, never `/diamonds`. The reserved siblings
     * (`/diamonds/packages`, `/diamonds/wallets`, `/diamonds/transactions`)
     * are real paths in `routes.ts`, and a bare `/diamonds` prefix would light
     * this entry up on every one of them — the mistake `matchPrefix: '/host'`
     * would have made across `/host-applications` and `/hosts`.
     */
    const items = section('diamonds')?.items ?? []
    expect(items.map((item) => item.matchPrefix)).toEqual([
      '/diamonds/top-ups',
      '/diamonds/packages',
      '/diamonds/wallet-transactions',
      '/diamonds/transactions',
      '/withdrawals',
    ])
  })
})

describe('the gift catalog', () => {
  it('lives in Platform since T0, on the same read permission', () => {
    const entry = section('platform')?.items.find((item) => item.to === ROUTES.gifts)
    expect(ROUTES.gifts).toBe('/gift-catalog')
    expect(entry?.permission).toBe(PERMISSIONS.walletsView)
    expect(entry?.matchPrefix).toBe('/gift-catalog')
    expect(
      section('diamonds')?.items.some((item) => item.label === 'Gift catalog'),
    ).toBe(false)
  })
})
