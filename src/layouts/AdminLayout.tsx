import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useAuth } from '@/auth/useAuth'
import { ADMIN_ROLE_LABELS } from '@/types/identity'
import { cn } from '@/lib/cn'

import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const COLLAPSE_STORAGE_KEY = 'callchat.admin.sidebarCollapsed'

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
    <div className="flex min-h-dvh bg-surface-muted">
      {/* Fixed sidebar — lg and up. Rail at lg, expanded at xl. */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 lg:block">
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

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenNav={() => setDrawerOpen(true)}
          adminName={admin?.name ?? 'Signed-in admin'}
          adminRole={admin ? ADMIN_ROLE_LABELS[admin.role] : ''}
          onSignOut={() => void signOut()}
        />

        <main className={cn('min-w-0 flex-1 py-6')}>
          <div className="page-container">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
