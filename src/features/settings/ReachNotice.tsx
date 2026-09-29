import { Info } from 'lucide-react'
import { Link } from 'react-router'

import { ROUTES } from '@/app/routes'

/**
 * Which clients a settings record actually reaches (plan.md §3.1, §4.2).
 *
 * ⚠️ **There are two app-version systems and two maintenance flags**, and they
 * do not move together. Verified live 2026-09-28: setting
 * `bootstrap.latestVersion` to `9.9.9` changed `GET /admin/bootstrap` and the
 * public `GET /bootstrap`, while
 * `GET /admin/settings → appVersionPolicies.android.latestVersion` stayed at
 * `1.0.0`. The same split exists for `maintenanceMode`.
 *
 * That is the module's defining problem. An operator who sets a force update
 * in Releases and sees nothing happen on a phone has been lied to by this
 * panel — and the lie is silent, because both screens save successfully.
 *
 * Neither older editor is deleted. Nothing proves the `/admin/settings` fields
 * are dead: they may serve the web client, or a surface not built yet (§8 O2).
 * Stating what each one reaches is honest; removing one on a guess is not.
 *
 * One component rather than the sentence written twice, because two copies of
 * the same claim drift — and a stale one here would be worse than none.
 */

export type SettingsReach = 'versions' | 'maintenance'

const COPY: Readonly<Record<SettingsReach, string>> = {
  versions:
    'Mobile clients read their update policy from Mobile bootstrap, not from here. Changing these values does not change what a phone is told on launch.',
  maintenance:
    'This does not black out the mobile app. Mobile clients read their maintenance state from Mobile bootstrap, and only that switch puts them behind the full-screen notice.',
}

export function ReachNotice({ reach }: { reach: SettingsReach }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {COPY[reach]}{' '}
        <Link
          to={ROUTES.settingsBootstrap}
          className="font-medium text-primary hover:underline"
        >
          Open Mobile bootstrap
        </Link>
        .
      </span>
    </p>
  )
}
