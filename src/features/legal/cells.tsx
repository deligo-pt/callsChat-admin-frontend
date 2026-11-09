import { PERMISSIONS } from '@/auth/permissions'
import { useAuth, useCan } from '@/auth/useAuth'
import { DateTime, StatusBadge } from '@/components/display'
import { useUserName } from '@/components/wallet'
import type { LegalDocument } from '@/types/legal'

import { isUpcoming, typeLabel } from './labels'

/**
 * How a legal document is drawn in lists and cards (plan.md LG1).
 *
 * Effective dates are calendar days stored as UTC midnight, so they are shown
 * in UTC — a Bangladesh rendering would move 1 Dec to "1 Dec, 06:00".
 */

export function TitleCell({ doc }: { doc: LegalDocument }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 lg:min-w-[12rem]">
      <span className="font-medium wrap-anywhere text-foreground">
        {typeLabel(doc.documentType)}
      </span>
      {doc.title !== typeLabel(doc.documentType) ? (
        <span className="text-caption wrap-anywhere text-foreground-muted">
          {doc.title}
        </span>
      ) : null}
    </span>
  )
}

export function VersionCell({ doc }: { doc: LegalDocument }) {
  return <span className="font-mono tabular text-body">v{doc.version}</span>
}

export function LegalStatusCell({ doc }: { doc: LegalDocument }) {
  return <StatusBadge domain="legal" value={doc.status} />
}

export function EffectiveCell({ doc }: { doc: LegalDocument }) {
  return (
    <span className="flex flex-col gap-0.5 whitespace-nowrap">
      <DateTime value={doc.effectiveDate} variant="date" />
      {doc.status !== 'ARCHIVED' && isUpcoming(doc) ? (
        <span className="text-caption text-warning-foreground">Not in effect yet</span>
      ) : null}
    </span>
  )
}

/**
 * An admin id as a name. `publishedBy` and `createdByAdminId` are bare user
 * ids; the user lookup needs `users.view`, so without it the id is the name.
 */
export function AdminName({ id }: { id: string | null | undefined }) {
  const { admin } = useAuth()
  const canReadUsers = useCan(PERMISSIONS.usersView)
  const isMe = Boolean(id && admin?.id === id)
  const lookup = useUserName(id ?? '', canReadUsers && Boolean(id) && !isMe)
  if (!id) return <span className="text-foreground-subtle">—</span>
  if (isMe) return <span>You</span>
  const name = lookup.data?.displayName
  return name ? (
    <span className="wrap-anywhere">{name}</span>
  ) : (
    <span className="font-mono text-caption text-foreground-muted" title={id}>
      {id.slice(0, 10)}…
    </span>
  )
}

export function PublishedCell({ doc }: { doc: LegalDocument }) {
  if (!doc.publishedAt) return <span className="text-foreground-subtle">—</span>
  return (
    <span className="flex flex-col gap-0.5">
      <DateTime value={doc.publishedAt} />
      <span className="text-caption text-foreground-muted">
        by <AdminName id={doc.publishedBy} />
      </span>
    </span>
  )
}

export function EditedCell({ doc }: { doc: LegalDocument }) {
  return (
    <span className="flex flex-col gap-0.5">
      <DateTime value={doc.updatedAt} relative />
      <span className="text-caption text-foreground-muted">
        by <AdminName id={doc.createdByAdminId} />
      </span>
    </span>
  )
}
