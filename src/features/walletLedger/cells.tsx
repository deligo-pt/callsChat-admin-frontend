import { Link, useLocation } from 'react-router'

import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import { DateTime } from '@/components/display'
import { EntryAmount, EntrySource, STOP_ROW_CLICK } from '@/components/wallet'
import { formatDiamonds } from '@/lib/format'
import { LEDGER_TIME_ZONE, typeLabel } from '@/lib/walletLabels'
import type { WalletTransaction } from '@/types/walletTransactions'

/**
 * How one wallet-ledger row is drawn (plan.md T2).
 */

/**
 * The time, as a real link to the entry — so it can be opened in a new tab
 * as well as by clicking the row. Carries the list's query so "back" on the
 * entry returns to this exact view.
 */
export function WhenCell({ row }: { row: WalletTransaction }) {
  const { search } = useLocation()
  return (
    <Link
      to={ROUTES.walletTransaction(row.id)}
      state={{ from: search }}
      className="whitespace-nowrap hover:underline"
      {...STOP_ROW_CLICK}
    >
      <DateTime value={row.createdAt} timeZone={LEDGER_TIME_ZONE} />
    </Link>
  )
}

/** The account, linked to its record when the operator may read it. */
export function AccountCell({ row }: { row: WalletTransaction }) {
  const canOpen = useCan(PERMISSIONS.usersView)
  const name = row.user?.displayName?.trim()
  const username = row.user?.username?.trim()

  const label = name ? (
    <span className="wrap-anywhere">{name}</span>
  ) : (
    <span className="font-mono text-caption">{row.userId}</span>
  )

  return (
    <span className="flex min-w-0 flex-col gap-0.5 lg:min-w-[10rem]">
      {canOpen ? (
        <Link
          to={ROUTES.user(row.userId)}
          className="font-medium text-primary hover:underline"
          {...STOP_ROW_CLICK}
        >
          {label}
        </Link>
      ) : (
        <span className="font-medium">{label}</span>
      )}
      {username ? (
        <span className="text-caption wrap-anywhere text-foreground-muted">
          @{username}
        </span>
      ) : null}
    </span>
  )
}

export function TypeCell({ row }: { row: WalletTransaction }) {
  return <span className="whitespace-nowrap">{typeLabel(row.type)}</span>
}

export function AmountCell({ row }: { row: WalletTransaction }) {
  return <EntryAmount amount={row.amount} />
}

export function BalanceCell({ row }: { row: WalletTransaction }) {
  if (typeof row.balanceAfter !== 'number') {
    return <span className="text-foreground-subtle">—</span>
  }
  return (
    <span className="tabular whitespace-nowrap">
      {formatDiamonds(row.balanceAfter)}
    </span>
  )
}

/**
 * Plain text only: a note is written by an admin, or by the system for a
 * gift or top-up, and is never interpreted as markup or a link.
 */
export function NoteCell({ row }: { row: WalletTransaction }) {
  const note = row.note?.trim()
  if (!note) return <span className="text-foreground-subtle">—</span>
  return (
    <span className="line-clamp-2 max-w-[18rem] wrap-anywhere" title={note}>
      {note}
    </span>
  )
}

/** Where the movement came from, in words — see `EntrySource`. */
export function SourceCell({ row }: { row: WalletTransaction }) {
  return <EntrySource row={row} />
}
