import { Info } from 'lucide-react'
import { Link } from 'react-router'

import { ROUTES } from '@/app/routes'

/**
 * Which clients a settings record actually reaches (plan.md §3.1, §4.2).
 *
 * ⚠️ **There are two maintenance flags**, and they do not move together.
 * Verified live 2026-09-28: setting `bootstrap.maintenanceMode` changed
 * `GET /admin/bootstrap` and the public `GET /bootstrap`, while
 * `GET /admin/settings → maintenanceMode` stayed where it was.
 *
 * That is the module's defining problem. An operator who starts maintenance
 * here and sees nothing happen on a phone has been lied to by this panel — and
 * the lie is silent, because both screens save successfully.
 *
 * The older editor is not deleted. Nothing proves the `/admin/settings` field
 * is dead: it may serve the web client, or a surface not built yet (§8 O2).
 * Stating what it reaches is honest; removing it on a guess is not.
 *
 * ⚠️ **The same split existed for the app-version policies**, and there the
 * question was settled: the Releases section was removed on 2026-10-06, since
 * Mobile bootstrap holds a strict superset of its fields and is the record
 * phones actually read. Only `releaseNotes` had no counterpart, and it had no
 * reader. `reach` is therefore a one-value union today — kept as a union
 * because `maintenance` is not the last record that will need this sentence.
 */

export type SettingsReach = 'maintenance'

const COPY: Readonly<Record<SettingsReach, string>> = {
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
