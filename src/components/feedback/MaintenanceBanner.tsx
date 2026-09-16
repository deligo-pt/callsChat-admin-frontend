import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router'

import { queryKeys } from '@/api/queryKeys'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { fetchSettings } from '@/api/systemSettings'

/**
 * Persistent notice, on every admin screen, while the product is down.
 *
 * The maintenance switch lives on one tab of one page, but its effect is
 * global — and an operator who turns it on, walks away to review a user
 * report, and forgets has taken CallsChat offline indefinitely with nothing on
 * screen to remind them. The banner exists so that state is impossible to
 * lose track of, not to decorate the shell.
 *
 * It reads the same query key as the settings page, so the two can never
 * disagree, and it is rendered by `AdminLayout` above `<main>`. It lives in
 * `components/` rather than in the settings feature because lint forbids a
 * layout from importing one — see `api/systemSettings.ts`.
 */
export function MaintenanceBanner() {
  const { can } = useAuth()
  const canSee = can(PERMISSIONS.configurationView)

  const { data } = useQuery({
    queryKey: queryKeys.configuration.settings,
    queryFn: ({ signal }) => fetchSettings(signal),
    /*
     * Polled, because the switch may be thrown by a different admin in another
     * session. A minute is a compromise: fast enough that nobody stares at a
     * stale banner for long, slow enough to be invisible against normal admin
     * traffic.
     */
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    enabled: canSee,
    /*
     * A failed poll must never render the banner. "Cannot tell" is not
     * "everything is fine", but a false alarm on every network blip would
     * train operators to ignore the one that matters.
     */
    retry: 1,
  })

  if (!canSee || !data?.settings.maintenanceMode) return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-danger px-4 py-2 text-center text-body-strong text-white"
    >
      <span className="inline-flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        CallsChat is in maintenance mode — users are blocked.
      </span>
      <Link
        to={ROUTES.settingsMaintenance}
        className="rounded-sm underline underline-offset-2 hover:no-underline focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      >
        End maintenance
      </Link>
    </div>
  )
}
