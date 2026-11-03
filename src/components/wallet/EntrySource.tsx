import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import { Skeleton } from '@/components/ui/skeleton'
import { giftName, methodOf, referenceSource } from '@/lib/walletLabels'
import { sourceOf, type WalletTransaction } from '@/types/walletTransactions'

import { STOP_ROW_CLICK } from './rowClick'
import { useUserName } from './useUserName'

/**
 * A source: what it is, then which one. A source with nothing more to say
 * (a conversion) is one line of body text, not a caption on its own.
 */
function Source({ kind, children }: { kind: string; children?: ReactNode }) {
  if (!children) return <span className="block lg:min-w-[9rem]">{kind}</span>
  return (
    <div className="flex min-w-0 flex-col gap-0.5 lg:min-w-[9rem]">
      <span className="text-caption text-foreground-muted">{kind}</span>
      <div className="wrap-anywhere">{children}</div>
    </div>
  )
}

/** The adjusting admin, by name — resolved from their user record. */
function AdjustedBy({ adminId }: { adminId: string }) {
  const canOpen = useCan(PERMISSIONS.usersView)
  const name = useUserName(adminId, canOpen)
  const label =
    name.data?.displayName ?? (name.data?.username ? `@${name.data.username}` : null)

  if (!canOpen) return <Source kind="Adjusted by">An admin</Source>
  return (
    <Source kind="Adjusted by">
      {name.isPending ? (
        <Skeleton className="h-4 w-24" />
      ) : (
        <Link
          to={ROUTES.user(adminId)}
          className="font-medium text-primary hover:underline"
          {...STOP_ROW_CLICK}
        >
          {/* Unreadable record: still a working link, without a raw id. */}
          {label ?? 'View admin'}
        </Link>
      )}
    </Source>
  )
}

/**
 * Where the movement came from, by type (`sourceOf`, measured) — in words,
 * never a raw id: an operator cannot read `cmvx1qb…lrpcjz`.
 *
 * The admin behind an adjustment is named from their record. A gift's
 * `refId` is its slug, read back as its name. Other references (a
 * conversion, a top-up request) have no name of their own, so the source is
 * named by what it is.
 */
export function EntrySource({ row }: { row: WalletTransaction }) {
  const source = sourceOf(row)

  switch (source.kind) {
    case 'topUpRequest':
      return <Source kind="Top-up request">{methodOf(row.note)}</Source>
    case 'adjustedBy':
      return <AdjustedBy adminId={source.adminId} />
    case 'gift':
      return <Source kind="Gift">{giftName(source.slug)}</Source>
    case 'reference':
      return <Source kind={referenceSource(row.type)} />
    case 'none':
      return <span className="text-foreground-subtle">—</span>
  }
}
