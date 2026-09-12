import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'

import { MaintenanceBanner } from '@/components/feedback/MaintenanceBanner'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ROUTES } from '@/app/routes'
import { useAuth } from '@/auth/useAuth'
import { adminDisplayName, ADMIN_ROLE_LABELS } from '@/types/identity'
import { cn } from '@/lib/cn'

import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const COLLAPSE_STORAGE_KEY = 'callschat.admin.sidebarCollapsed'

/**
 * The authenticated application shell.
 *
 * plan.md §1E / §6.3: sidebar + top bar + a single scrollable outlet. The page
 * itself never scrolls horizontally — only designated containers do.
 *
 * Navigation is filtered by the acting admin's effective permissions, which
 * only removes confusing options — the backend still authorizes every request.
 */
export function AdminLayout() {
  const { admin, can, signOut } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  /*
   * Sign-out navigates deliberately rather than waiting for the auth state to
   * cascade into a redirect. It is an explicit action with an explicit
   * destination, and unlike an expired session there is no attempted location
   * worth preserving — `replace` also keeps the signed-in page out of the back
   * history.
   */
  async function handleSignOut() {
    await signOut()
    await navigate(ROUTES.login, { replace: true })
  }
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true'
  })

  // Persist the rail/expanded choice across sessions (plan.md §1E).
  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(collapsed))
  }, [collapsed])

  /*
   * The drawer must close on navigation rather than linger over the new page.
   * Adjusting state during render is React's sanctioned pattern for reacting
   * to a changed prop — it avoids the extra commit an effect would cause.
   */
  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setDrawerOpen(false)
  }

  return (
    /*
     * A fixed app frame: the shell is exactly one viewport tall and does not
     * scroll — only `<main>` does.
     *
     * This replaces a `sticky` sidebar and top bar, which silently did not
     * stick: `globals.css` sets `overflow-x: hidden` on `html`, and that makes
     * the root element a scroll container, which breaks `position: sticky` for
     * its descendants. The symptom was the top bar and brand scrolling away and
     * the sidebar stopping short of the bottom of a long page.
     *
     * An explicit frame is also the right shape for an operations console: the
     * navigation and account menu must be reachable at any scroll position.
     *
     * `h-full` measures against `#root` (sized in globals.css) rather than
     * `dvh`. The document is locked from scrolling there, so the frame cannot
     * be pushed off-screen by anything injected into `<body>`.
     */
    <div className="flex h-full overflow-hidden bg-surface-muted">
      {/* Fixed sidebar — lg and up. Rail at lg, expanded at xl. */}
      <aside className="hidden h-full shrink-0 lg:block">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
          can={can}
        />
      </aside>

      {/* Off-canvas drawer — below lg. Radix Sheet handles focus trap + Escape. */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-[17rem] bg-sidebar p-0 lg:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            variant="drawer"
            collapsed={false}
            onToggleCollapsed={() => {}}
            can={can}
            onNavigate={() => setDrawerOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          onOpenNav={() => setDrawerOpen(true)}
          adminName={admin ? adminDisplayName(admin) : 'Signed-in admin'}
          adminRole={admin ? ADMIN_ROLE_LABELS[admin.role] : ''}
          onSignOut={() => void handleSignOut()}
        />

        {/*
         * Above `<main>`, so it is present on every admin screen rather than
         * only on the page that owns the switch. An operator who turns
         * maintenance on and navigates away must not be able to forget.
         */}
        <MaintenanceBanner />

        {/* The only vertically scrolling region in the shell. */}
        <main
          className={cn(
            'min-w-0 flex-1 overflow-y-auto overscroll-contain py-6 lg:py-8',
          )}
        >
          <div className="page-container">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
