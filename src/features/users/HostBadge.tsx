import { Radio, User } from 'lucide-react'
import { Link } from 'react-router'

import { ROUTES } from '@/app/routes'
import { cn } from '@/lib/cn'
import { humaniseEnum } from '@/lib/status'

import { useHostStatus } from './useHostRoster'

/**
 * Host or User, on every account — plan.md §3, phase T0.
 *
 * Every user gets one of the two, so "no badge" never has to be read as "not
 * a host": an operator scanning the list sees the answer either way.
 *
 * ⚠️ Host comes from `isHost` **or** the host roster, because `isHost` is
 * false for every user live (H1) — see `useHostRoster`. A host whose profile
 * is not `ACTIVE` says so ("Host · Suspended"), since a suspended host is
 * still a host but should not read as one in good standing.
 *
 * `link`: on the user record the Host badge opens the Live hosts roster. In the
 * list it stays plain — the whole row already links to the record.
 */
export function HostBadge({
  user,
  size = 'sm',
  link = false,
}: {
  user: { id: string; isHost: boolean }
  size?: 'sm' | 'md'
  link?: boolean
}) {
  const host = useHostStatus(user)
  const base = cn(
    'inline-flex items-center gap-1 rounded-sm text-overline whitespace-nowrap',
    size === 'md' ? 'px-2 py-1 uppercase' : 'px-1.5 py-0.5',
  )

  if (!host) {
    return (
      <span
        className={cn(base, 'bg-neutral-soft text-neutral-foreground')}
        title="Not a host"
      >
        <User className="size-3" aria-hidden="true" />
        User
      </span>
    )
  }

  const standing = host.status && host.status !== 'ACTIVE' ? host.status : null
  const label = standing ? `Host · ${humaniseEnum(standing)}` : 'Host'
  const className = cn(
    base,
    standing
      ? 'bg-warning-soft text-warning-foreground'
      : 'bg-info-soft text-info-foreground',
  )
  const content = (
    <>
      <Radio className="size-3" aria-hidden="true" />
      {label}
    </>
  )

  return link ? (
    <Link
      to={ROUTES.hosts}
      className={cn(className, 'hover:underline')}
      title="Open the Live hosts roster"
    >
      {content}
    </Link>
  ) : (
    <span
      className={className}
      title={standing ? `Host, ${standing}` : 'Approved Host'}
    >
      {content}
    </span>
  )
}
