import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import type { PermissionCheck } from '@/auth/permissions'
import { isProduction } from '@/env'

import { DESIGN_NAV_ITEM, NAV_SECTIONS, type NavItem } from './navigation'

export interface SidebarProps {
  /** Expanded (labels) vs rail (icons only). Ignored in drawer mode. */
  collapsed: boolean
  onToggleCollapsed: () => void
  can: PermissionCheck
  /** Drawer mode renders labels regardless of `collapsed`. */
  variant?: 'fixed' | 'drawer'
  /** Called after navigation so the mobile drawer closes itself. */
  onNavigate?: () => void
  className?: string
}

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.matchPrefix) return pathname.startsWith(item.matchPrefix)
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

/**
 * Module navigation.
 *
 * plan.md §6.2 — three responsive modes:
 *   base–md : off-canvas drawer (rendered by AdminLayout inside a Sheet)
 *   lg      : 72px icon rail with tooltips
 *   xl+     : 264px expanded sidebar with grouped section labels
 *
 * Items the acting admin lacks permission for are omitted, and a section with
 * no visible items disappears entirely rather than leaving an empty heading.
 */
export function Sidebar({
  collapsed,
  onToggleCollapsed,
  can,
  variant = 'fixed',
  onNavigate,
  className,
}: SidebarProps) {
  const { pathname } = useLocation()
  const isDrawer = variant === 'drawer'
  const showLabels = isDrawer || !collapsed

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((section) => section.items.length > 0)

  function renderItem(item: NavItem) {
    const active = isItemActive(item, pathname)
    const Icon = item.icon

    const link = (
      <NavLink
        to={item.to}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group flex items-center gap-3 rounded-md px-3 py-2 text-body transition-colors',
          'focus-visible:ring-2 focus-visible:ring-sidebar-active focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
          showLabels ? 'w-full' : 'w-11 justify-center px-0',
          active
            ? 'bg-sidebar-active font-medium text-sidebar-active-foreground'
            : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
        )}
      >
        <Icon className="size-4 shrink-0" />
        {showLabels ? <span className="truncate">{item.label}</span> : null}
        {!showLabels ? <span className="sr-only">{item.label}</span> : null}
      </NavLink>
    )

    if (showLabels) return <li key={item.to}>{link}</li>

    // Icon rail — the label lives in a tooltip so the rail stays navigable.
    return (
      <li key={item.to}>
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      </li>
    )
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-sidebar',
        isDrawer ? 'w-full' : showLabels ? 'w-sidebar' : 'w-sidebar-rail',
        className,
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex h-topbar shrink-0 items-center border-b border-sidebar-border',
          showLabels ? 'justify-between px-4' : 'justify-center px-2',
        )}
      >
        {showLabels ? (
          <span className="truncate text-h4 text-sidebar-foreground">
            CallChat<span className="font-normal text-sidebar-muted"> Admin</span>
          </span>
        ) : null}

        {!isDrawer ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        ) : null}
      </div>

      {/* Sections */}
      <nav aria-label="Modules" className="flex-1 scroll-x overflow-y-auto px-2 py-4">
        {sections.map((section) => (
          <div key={section.id} className="mb-4 last:mb-0">
            {showLabels ? (
              <p className="px-3 pb-1.5 text-overline text-sidebar-muted uppercase">
                {section.label}
              </p>
            ) : (
              <div
                className="mx-auto mb-2 h-px w-6 bg-sidebar-border"
                aria-hidden="true"
              />
            )}
            <ul
              className={cn('space-y-1', !showLabels && 'flex flex-col items-center')}
            >
              {section.items.map(renderItem)}
            </ul>
          </div>
        ))}

        {!isProduction ? (
          <div className="mt-4 border-t border-sidebar-border pt-4">
            <ul
              className={cn('space-y-1', !showLabels && 'flex flex-col items-center')}
            >
              {renderItem(DESIGN_NAV_ITEM)}
            </ul>
          </div>
        ) : null}
      </nav>
    </div>
  )
}
