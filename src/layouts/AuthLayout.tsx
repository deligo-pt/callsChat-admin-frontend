import { Outlet } from 'react-router'

/**
 * Shell for unauthenticated routes.
 *
 * plan.md §1E: a centred card on a navy field. Deliberately minimal — no
 * navigation, no product surface, nothing that hints at internal structure
 * before the admin has authenticated.
 */
export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-h2 text-sidebar-foreground">
            CallChat<span className="font-normal text-sidebar-muted"> Admin</span>
          </p>
          <p className="text-caption text-sidebar-muted">Internal operations console</p>
        </div>

        <div className="rounded-xl bg-surface p-6 shadow-lg sm:p-8">
          <Outlet />
        </div>

        <p className="text-center text-caption text-sidebar-muted">
          Authorised personnel only. All activity is recorded.
        </p>
      </div>
    </div>
  )
}
