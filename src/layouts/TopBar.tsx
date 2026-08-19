import { Bell, LogOut, Menu, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/cn'
import { env } from '@/env'

import { GlobalSearch } from './GlobalSearch'

export interface TopBarProps {
  onOpenNav: () => void
  adminName: string
  adminRole: string
  onSignOut?: () => void
  /** Unread operational alerts. */
  notificationCount?: number
  className?: string
}

const ENV_BADGE: Readonly<Record<string, string>> = {
  local: 'bg-neutral-soft text-neutral-foreground',
  development: 'bg-info-soft text-info-foreground',
  // Loud on staging so it is never mistaken for production (plan.md §1E).
  staging: 'bg-warning text-foreground',
  production: 'bg-danger-soft text-danger-foreground',
}

export function TopBar({
  onOpenNav,
  adminName,
  adminRole,
  onSignOut,
  notificationCount = 0,
  className,
}: TopBarProps) {
  const label = env.VITE_ENV_LABEL

  return (
    <header
      className={cn(
        'sticky top-0 z-50 flex h-topbar shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:px-6',
        className,
      )}
    >
      {/* Drawer trigger — below lg only */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="lg:hidden"
      >
        <Menu />
      </Button>

      <GlobalSearch className="min-w-0 flex-1 md:max-w-md" />

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {label !== 'production' ? (
          <span
            className={cn(
              'hidden rounded-sm px-2 py-1 text-overline uppercase sm:inline-flex',
              ENV_BADGE[label] ?? ENV_BADGE['local'],
            )}
          >
            {label}
          </span>
        ) : null}

        <Button variant="ghost" size="icon" aria-label="Alerts" className="relative">
          <Bell />
          {notificationCount > 0 ? (
            <span
              className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-danger text-overline text-foreground-inverse"
              aria-label={`${notificationCount} unread alerts`}
            >
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          ) : null}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Account menu">
              <User />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block truncate font-medium">{adminName}</span>
              <span className="block text-caption text-foreground-muted">
                {adminRole}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem {...(onSignOut ? { onSelect: onSignOut } : {})}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
