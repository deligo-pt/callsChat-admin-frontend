import { Link, useLocation } from 'react-router'

import { ROUTES } from '@/app/routes'
import { useCan } from '@/auth/useAuth'
import { PERMISSIONS } from '@/auth/permissions'
import { DateTime, DiamondAmount } from '@/components/display'
import { useLiveRoomTitle } from '@/components/live'
import { CatalogAsset } from '@/components/media/CatalogAsset'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCount } from '@/lib/format'
import type { GiftTransaction } from '@/types/catalog'

/**
 * How one gift-ledger row is drawn (plan.md §3.2, phase G5).
 */

/**
 * What was sent.
 *
 * ⚠️ **The snapshot, never the live gift.** `snapshotName` and
 * `snapshotIconUrl` record the gift as it was at the moment it was sent;
 * `gift` is the catalog record as it is now. Rendering the live one would let
 * a rename in the catalog rewrite this audit trail. When the two names
 * differ, the current one is shown *beside* the snapshot as context, never in
 * place of it.
 *
 * Live on 2026-10-28 the two agree on all 22 rows — no gift with
 * transactions has been renamed yet — so the divergence is a rule here, not
 * an observation.
 */
export function GiftCell({ record }: { record: GiftTransaction }) {
  const name = record.snapshotName?.trim()
  const current = record.gift?.name?.trim()
  const quantity = record.quantity ?? 1

  return (
    <span className="flex min-w-[12rem] items-center gap-3">
      <CatalogAsset value={record.snapshotIconUrl} className="size-10" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium wrap-anywhere">
          {name || <span className="text-foreground-muted italic">Unnamed gift</span>}
          {quantity !== 1 ? (
            <span className="ml-1.5 tabular text-foreground-muted">
              × {formatCount(quantity)}
            </span>
          ) : null}
        </span>
        {name && current && current !== name ? (
          <span className="text-caption wrap-anywhere text-foreground-muted">
            Now named “{current}” in the catalog
          </span>
        ) : null}
      </span>
    </span>
  )
}

/**
 * A sender or receiver.
 *
 * Linked to the user record when the operator may read it. The name comes
 * from the row's joined party and the id is the fallback, so a row whose
 * party has no display name is still traceable.
 */
export function PartyCell({
  id,
  name,
}: {
  id: string | null | undefined
  name: string | null | undefined
}) {
  const canOpen = useCan(PERMISSIONS.usersView)
  const label = name?.trim()

  if (!id) return <span className="text-foreground-muted">—</span>

  const text = label ? (
    <span className="wrap-anywhere">{label}</span>
  ) : (
    <span className="font-mono text-caption">{id}</span>
  )

  return canOpen ? (
    <Link to={ROUTES.user(id)} className="font-medium text-primary hover:underline">
      {text}
    </Link>
  ) : (
    <span className="font-medium">{text}</span>
  )
}

/**
 * What it cost, and what the receiver earned.
 *
 * ⚠️ All 22 live rows are `0` / `0`: the catalog is free (plan.md O1, O2).
 * The page explains that once, above the list, rather than on every row.
 */
export function DiamondsCell({ record }: { record: GiftTransaction }) {
  const quantity = record.quantity ?? 1

  return (
    <span className="flex min-w-[8rem] flex-col gap-0.5">
      <DiamondAmount amount={record.totalPrice ?? 0} variant="neutral" />
      <span className="text-caption text-foreground-muted">
        {quantity !== 1 && typeof record.unitPrice === 'number'
          ? `${formatCount(quantity)} × ${formatCount(record.unitPrice)} · `
          : ''}
        Receiver earned {formatCount(record.hostEarnings ?? 0)}
      </span>
    </span>
  )
}

const CONTEXT_LABELS: Record<string, string> = {
  LIVE_ROOM: 'Live room',
}

/**
 * A live room by its title, linked to its page (plan.md Live L4) — never the
 * raw id. Without `live.view` it is just "Live room". A room the API no longer
 * has reads "A live room that no longer exists", unlinked.
 */
export function LiveRoomName({
  roomId,
  link = true,
}: {
  roomId: string
  link?: boolean
}) {
  const canView = useCan(PERMISSIONS.liveView)
  const { pathname, search } = useLocation()
  const title = useLiveRoomTitle(roomId, canView)

  if (!canView) return <span>Live room</span>
  if (title.isPending)
    return <Skeleton className="inline-block h-4 w-28 align-middle" />
  if (title.data === null) {
    return (
      <span className="text-foreground-muted">A live room that no longer exists</span>
    )
  }
  const name = title.data ?? 'Live room'
  if (!link) return <span className="wrap-anywhere">{name}</span>
  return (
    <Link
      to={ROUTES.liveStream(roomId)}
      state={{ backTo: `${pathname}${search}` }}
      className="line-clamp-2 font-medium wrap-anywhere text-primary hover:underline"
      title={name}
      onClick={(event) => event.stopPropagation()}
    >
      {name}
    </Link>
  )
}

/**
 * Where it was sent, with a way to see everything sent there.
 *
 * Only `LIVE_ROOM` has been seen live; there the room's title links to its
 * page. Any other value is shown as the server sent it rather than guessed at.
 */
export function ContextCell({
  record,
  onOnlyThis,
}: {
  record: GiftTransaction
  onOnlyThis: ((contextId: string) => void) | null
}) {
  const type = record.contextType?.trim()
  const id = record.contextId?.trim()
  const isRoom = type === 'LIVE_ROOM'
  const place = isRoom ? 'room' : 'context'

  return (
    <span className="flex w-full min-w-0 flex-col items-start gap-0.5 lg:min-w-[9rem]">
      <span className={isRoom && id ? 'text-caption text-foreground-muted' : undefined}>
        {type ? (CONTEXT_LABELS[type] ?? type) : '—'}
      </span>
      {id && isRoom ? (
        <span className="block w-full max-w-[14rem]">
          <LiveRoomName roomId={id} />
        </span>
      ) : id ? (
        <span
          className="block w-full max-w-[12rem] truncate font-mono text-caption text-foreground-muted"
          title={id}
        >
          {id}
        </span>
      ) : null}
      {id && onOnlyThis ? (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-caption"
          onClick={() => onOnlyThis(id)}
          aria-label={`Only gifts sent in this ${place}`}
        >
          Only this {place}
        </Button>
      ) : null}
    </span>
  )
}

export function SentCell({ record }: { record: GiftTransaction }) {
  if (!record.createdAt) return <span className="text-foreground-muted">—</span>
  return (
    <span className="flex flex-col gap-0.5 whitespace-nowrap">
      <DateTime value={record.createdAt} />
      {record.status && record.status !== 'SUCCESS' ? (
        <span className="text-caption text-warning-foreground">{record.status}</span>
      ) : null}
    </span>
  )
}
