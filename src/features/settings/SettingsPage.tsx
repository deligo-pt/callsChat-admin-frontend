import { Outlet, useLocation } from 'react-router'

import { ROUTES } from '@/app/routes'
import { visibleSettingsSections } from '@/app/settingsSections'
import { useAuth } from '@/auth/useAuth'
import { PageHeader } from '@/components/display'
import { cn } from '@/lib/cn'

/**
 * The System Settings shell.
 *
 * The sections are **not** tabs here. They are second-level entries in the
 * main sidebar, rendered by `layouts/Sidebar.tsx` from the shared list in
 * `app/settingsSections.ts`. A row of tabs plus a sidebar group would be two
 * navigation systems for one set of pages, and the sidebar is where an
 * operator already looks to move around the panel.
 *
 * What stays here is the frame every section shares: a breadcrumb naming the
 * current section, and its title and description. The section itself renders
 * through `<Outlet/>`.
 *
 * No environment badge here. It was repeated from the top bar on the argument
 * that *which environment am I editing* must never require looking elsewhere —
 * but the top bar is on the same screen, and two identical badges a few
 * hundred pixels apart read as a rendering bug rather than as emphasis.
 */
export function SettingsPage() {
  const { can } = useAuth()
  const { pathname } = useLocation()

  const sections = visibleSettingsSections(can)
  const current = sections.find((section) => pathname.startsWith(section.to))

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: ROUTES.dashboard },
          { label: 'System settings', to: ROUTES.settings },
          /*
           * With the tab row gone, the breadcrumb is the only thing on the
           * page that says which of the sections is open.
           */
          ...(current ? [{ label: current.label }] : []),
        ]}
        title={current?.label ?? 'System settings'}
        description={
          current?.description ??
          'Configuration that applies to every CallsChat client — the mobile app, the web client, and this panel.'
        }
      />

      {/*
       * `max-w-3xl` matches AccountSecurityPage — one column of cards, which is
       * the right measure for forms. Sections holding a table opt out, or their
       * right-hand columns fall off the edge of the reading column.
       */}
      <div className={cn('space-y-6', !current?.wide && 'max-w-3xl')}>
        <Outlet />
      </div>
    </div>
  )
}
