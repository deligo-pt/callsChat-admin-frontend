import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import type { PermissionCheck } from '@/auth/permissions'
import { isProduction } from '@/env'

import {
  DESIGN_NAV_ITEM,
  NAV_SECTIONS,
  type NavChild,
  type NavItem,
} from './navigation'

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

function isChildActive(child: NavChild, pathname: string): boolean {
  return pathname === child.to || pathname.startsWith(`${child.to}/`)
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

  /**
   * Open/closed overrides for parents that have sub-items.
   *
   * The *default* is derived from the route — a group holding the page you are
   * looking at starts open, because leaving it shut would hide the very
   * section on screen. This map records only what the operator has explicitly
   * toggled, and their choice then wins until they toggle it back.
   *
   * Storing the open state outright would fight that: a group forced open
   * because it is active could never be collapsed.
   */
  const [openOverrides, setOpenOverrides] = useState<Readonly<Record<string, boolean>>>(
    {},
  )

  function setOpen(key: string, open: boolean) {
    setOpenOverrides((current) => ({ ...current, [key]: open }))
  }

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((section) => section.items.length > 0)

  function renderItem(item: NavItem) {
    const active = isItemActive(item, pathname)
    const Icon = item.icon
    const children = item.children?.filter(
      (child) => !child.permission || can(child.permission),
    )
    const hasChildren = Boolean(children && children.length > 0)
    // Route decides, unless the operator has said otherwise.
    const expanded = hasChildren && (openOverrides[item.to] ?? active)

    const link = (
      <NavLink
        to={item.to}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group flex items-center gap-3 rounded-md px-3 py-2 text-body transition-colors',
          showLabels ? 'w-full' : 'w-11 justify-center px-0',
          active
            ? 'bg-sidebar-active text-body-strong text-sidebar-active-foreground'
            : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
        )}
      >
        <Icon className="size-5 shrink-0" />
        {showLabels ? <span className="flex-1 truncate">{item.label}</span> : null}
        {!showLabels ? <span className="sr-only">{item.label}</span> : null}
      </NavLink>
    )

    /**
     * A parent with sub-items is a **toggle, not a link**.
     *
     * It opens the group on the first click and closes it on the next, which
     * is what the row visibly promises: nothing else on screen moves, so
     * navigating away from under the operator would be a surprise. The
     * sections beneath it are the navigation targets.
     *
     * That also removes the button-inside-anchor problem the previous split
     * row existed to work around — one control, one job.
     */
    const toggleClassName = cn(
      'group flex items-center gap-3 rounded-md px-3 py-2 text-body transition-colors',
      showLabels ? 'w-full' : 'w-11 justify-center px-0',
      active
        ? 'bg-sidebar-active text-body-strong text-sidebar-active-foreground'
        : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
    )

    const toggleBody = (
      <>
        <Icon className="size-5 shrink-0" />
        {showLabels ? (
          <>
            <span className="flex-1 truncate text-left">{item.label}</span>
            <ChevronDown
              className={cn(
                // Same 160ms as the panel, so the two move as one gesture.
                'size-4 shrink-0 transition-transform duration-[160ms]',
                expanded ? 'rotate-0' : '-rotate-90',
              )}
              aria-hidden="true"
            />
          </>
        ) : (
          <span className="sr-only">{item.label}</span>
        )}
      </>
    )

    /*
     * The rail is 72px wide and cannot show a sub-menu. Rather than hiding the
     * sections behind a hover flyout, opening a parent that has them expands
     * the sidebar — asking for the sub-menu is a clear enough signal that the
     * operator wants to see it.
     */
    const railToggle = (
      <button
        type="button"
        onClick={() => {
          onToggleCollapsed()
          setOpen(item.to, true)
        }}
        className={toggleClassName}
      >
        {toggleBody}
      </button>
    )

    if (showLabels) {
      if (!hasChildren) return <li key={item.to}>{link}</li>

      return (
        <li key={item.to}>
          {/*
           * Radix owns the open state here so it can measure the panel and
           * expose `--radix-collapsible-content-height` — `height: auto` is
           * not animatable, and without that measurement the list would have
           * to pop in and out. It also keeps the content mounted while it
           * collapses, so the closing animation actually plays, and wires
           * `aria-expanded` / `aria-controls` onto the trigger for free.
           */}
          <Collapsible open={expanded} onOpenChange={(next) => setOpen(item.to, next)}>
            <CollapsibleTrigger className={toggleClassName}>
              {toggleBody}
            </CollapsibleTrigger>

            <CollapsibleContent className="collapsible-panel">
              <ul className="mt-1 ml-5 space-y-0.5 border-l border-sidebar-border pl-3">
                {children?.map((child) => {
                  const childActive = isChildActive(child, pathname)
                  return (
                    <li key={child.to}>
                      <NavLink
                        to={child.to}
                        onClick={onNavigate}
                        aria-current={childActive ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-caption transition-colors',
                          childActive
                            ? 'font-medium text-sidebar-foreground'
                            : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
                        )}
                      >
                        {/*
                         * A filled dot marks the current section. It is not the
                         * only cue — the label also brightens and gains weight —
                         * because a colour difference alone is not an accessible
                         * way to say "you are here".
                         */}
                        <span
                          className={cn(
                            'size-1.5 shrink-0 rounded-full ring-1 transition-colors',
                            childActive
                              ? 'bg-sidebar-active ring-sidebar-active'
                              : 'bg-transparent ring-sidebar-muted',
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate">{child.label}</span>
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </li>
      )
    }

    // Icon rail — the label lives in a tooltip so the rail stays navigable.
    return (
      <li key={item.to}>
        <Tooltip>
          <TooltipTrigger asChild>{hasChildren ? railToggle : link}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      </li>
    )
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden',
        // Vertical deepening + inner right-edge hairline — see globals.css.
        'sidebar-surface',
        /*
         * The rail/expanded swap slides rather than jumping. Width is a layout
         * property, so this reflows on every frame — acceptable for one
         * element on a deliberate click, and the alternative (a transform)
         * would leave the page content behind at the old width.
         *
         * `overflow-hidden` is part of the same fix, not decoration: expanding
         * renders the labels at full size while the container is still 72px
         * wide, and without clipping they wrap and reflow for the whole
         * animation. Clipped, they are simply revealed as the width grows.
         *
         * Not applied in drawer mode: there the Sheet owns the entry
         * animation, and a width transition on top of it would fight the slide.
         */
        !isDrawer && 'transition-[width] duration-[200ms] ease-out',
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
          <span className="flex min-w-0 items-center gap-2">
            {/*
             * Decorative — the wordmark beside it already names the product.
             *
             * `logo-mark.png`, not `logo.png`: the supplied asset has a solid
             * white background, which renders as a white tile on the navy
             * sidebar. The mark is the same artwork with the surround made
             * transparent and the margin trimmed; the white speech bubble
             * inside it is deliberately kept.
             */}
            <img
              src="/logo-mark.png"
              alt=""
              aria-hidden="true"
              width={28}
              height={28}
              className="size-7 shrink-0 object-contain"
            />
            <span className="truncate text-h4 text-sidebar-foreground">
              CallsChat<span className="font-normal text-sidebar-muted"> Admin</span>
            </span>
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
