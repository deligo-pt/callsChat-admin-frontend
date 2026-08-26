import { Radio } from 'lucide-react'

import { MaskedValue, StatusBadge } from '@/components/display'
import { resolveStatus } from '@/lib/status'
import type { UserSummary } from '@/types/identity'

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
  const restrictions = user.activeRestrictions

  if (restrictions.length === 0) {
    return <span className="text-caption text-foreground-subtle">None</span>
  }

  // Two badges keep the row height stable; the rest collapse into a counter.
  const shown = restrictions.slice(0, 2)
  const remaining = restrictions.length - shown.length

  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((capability) => (
        <StatusBadge key={capability} domain="restriction" value={capability} />
      ))}
      {remaining > 0 ? (
        <span
          className="text-caption text-foreground-muted"
          title={restrictions
            .slice(2)
            .map((capability) => resolveStatus('restriction', capability).label)
            .join(', ')}
        >
          +{remaining}
        </span>
      ) : null}
    </span>
  )
}

export function IdentityCell({ user }: { user: UserSummary }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1.5">
        <span className="truncate font-medium">{user.displayName}</span>
        {user.isHost ? (
          <span
            className="inline-flex items-center gap-1 rounded-sm bg-info-soft px-1.5 py-0.5 text-overline text-info-foreground"
            title="Approved Host"
          >
            <Radio className="size-3" aria-hidden="true" />
            Host
          </span>
        ) : null}
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
