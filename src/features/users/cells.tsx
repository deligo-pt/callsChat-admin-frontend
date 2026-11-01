import { MaskedValue, StatusBadge } from '@/components/display'
import { formatDate } from '@/lib/datetime'
import { resolveStatus } from '@/lib/status'
import { restrictionOf, type UserSummary } from '@/types/identity'

import { HostBadge } from './HostBadge'

/**
 * Cell renderers for the user directory.
 *
 * Separated from `userColumns.tsx` so that file exports only its column
 * configuration — a module mixing component and non-component exports breaks
 * React Fast Refresh, and the lint rule enforcing that is worth respecting.
 */

/**
 * Restriction badges.
 *
 * plan.md Phase 3, "Rules enforced": an account status and a capability
 * restriction are structurally different things and are never merged into one
 * indicator. A gifting block is a restriction badge; it is not a status.
 */
export function RestrictionCell({ user }: { user: UserSummary }) {
  const restrictions = user.activeRestrictions.map(restrictionOf)

  if (restrictions.length === 0) {
    return <span className="text-caption text-foreground-subtle">None</span>
  }

  // Two badges keep the row height stable; the rest collapse into a counter.
  const shown = restrictions.slice(0, 2)
  const remaining = restrictions.length - shown.length

  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((restriction) => (
        <span key={restriction.capability} title={describe(restriction)}>
          <StatusBadge domain="restriction" value={restriction.capability} />
        </span>
      ))}
      {remaining > 0 ? (
        <span
          className="text-caption text-foreground-muted"
          title={restrictions.slice(2).map(describe).join('\n')}
        >
          +{remaining}
        </span>
      ) : null}
    </span>
  )
}

/**
 * "Messaging — <reason> · until 5 Nov 2026", from whatever the row carries.
 * The list sends the reason and expiry since 2026-11-01 (`restrictionOf`).
 */
function describe(restriction: ReturnType<typeof restrictionOf>): string {
  const parts = [resolveStatus('restriction', restriction.capability).label]
  if (restriction.reason) parts.push(restriction.reason)
  parts.push(
    restriction.expiresAt ? `until ${formatDate(restriction.expiresAt)}` : 'no expiry',
  )
  return parts.join(' — ')
}

export function IdentityCell({ user }: { user: UserSummary }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1.5">
        <span className="truncate font-medium">{user.displayName}</span>
        <HostBadge user={user} />
      </span>
      {user.username ? (
        <span className="truncate text-caption text-foreground-muted">
          @{user.username}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Contact details.
 *
 * plan.md §3.9: sensitive values render masked by default. The API returns
 * both `phone` and `phoneMasked`; we display the masked form and never place
 * the raw value in the DOM, so a screen-share or screenshot of a list cannot
 * leak a directory of phone numbers.
 *
 * `canReveal` stays false here deliberately — revealing is a per-record
 * decision that belongs on the detail screen with an audit event behind it
 * (Phase 3B), not a bulk affordance on a list of 100 rows.
 */
export function ContactCell({ user }: { user: UserSummary }) {
  if (user.phoneMasked) {
    // Masked numbers contain spaces; without this they wrap and unbalance the row.
    return <span className="tabular whitespace-nowrap">{user.phoneMasked}</span>
  }
  if (user.email) {
    return <MaskedValue value={user.email} kind="email" />
  }
  return <span className="text-caption text-foreground-subtle">—</span>
}
