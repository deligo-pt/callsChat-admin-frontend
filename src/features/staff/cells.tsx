import { MaskedValue } from '@/components/display'
import { cn } from '@/lib/cn'
import { MODULE_PERMISSION_VALUES, type StaffMember } from '@/types/staff'

import { describeModulePermission, sortModulePermissions } from './permissionMap'

/**
 * Cell renderers for the staff directory.
 *
 * Separated from `staffColumns.tsx` so that file exports only its column
 * configuration — a module mixing component and non-component exports breaks
 * React Fast Refresh, and the lint rule enforcing that is worth respecting.
 */

export function StaffIdentityCell({ member }: { member: StaffMember }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-medium">{member.displayName}</span>
      {/*
       * `block`: `truncate-id` sets overflow and text-overflow, which an
       * inline span ignores. Without it a long generated username pushes the
       * status badge off the card on a phone — the S5 defect, not repeated.
       */}
      <span
        className="block truncate-id text-caption text-foreground-muted"
        title={member.username}
      >
        @{member.username}
      </span>
    </span>
  )
}

/**
 * Which modules this person can reach, as eight fixed dots.
 *
 * The alternatives were both worse. Eight checkboxes do not fit a table cell.
 * A count — *"3 modules"* — is unreadable when the question is *which* three,
 * and an operator comparing two colleagues would have to open both records.
 *
 * Fixed positions and a fixed width mean the column scans **vertically**: two
 * people with the same access have identical shapes, and a difference is
 * visible without reading. Granted dots are filled `primary`; ungranted are
 * hollow `border`.
 *
 * The dots are `aria-hidden` and the accessible text is the full list of
 * granted module names — a screen reader gets the answer, not eight
 * indistinguishable bullets.
 */
export function PermissionSummaryCell({ member }: { member: StaffMember }) {
  const granted = new Set(member.adminPermissions)
  const names = sortModulePermissions(member.adminPermissions).map(
    (key) => describeModulePermission(key).label,
  )

  const description =
    names.length === 0 ? 'No module access' : `Can reach: ${names.join(', ')}`

  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center gap-1" aria-hidden="true" title={description}>
        {MODULE_PERMISSION_VALUES.map((key) => (
          <span
            key={key}
            className={cn(
              'size-2 rounded-full',
              granted.has(key) ? 'bg-primary' : 'bg-border',
            )}
          />
        ))}
      </span>
      {/*
       * `None` is stated, not left blank. Eight hollow dots and a cell that
       * failed to load look identical, and "this person has no access" is a
       * real, deliberate state worth reading (denied by default, plan.md §8).
       */}
      {names.length === 0 ? (
        <span className="text-caption text-foreground-subtle">None</span>
      ) : null}
      <span className="sr-only">{description}</span>
    </span>
  )
}

/**
 * Contact.
 *
 * plan.md §3.9: sensitive values render masked by default. Unlike the consumer
 * directory the backend returns no `phoneMasked` for staff, so `MaskedValue`
 * does the masking client-side and the raw address never reaches the DOM in a
 * list of rows that might be screen-shared.
 */
export function StaffContactCell({ member }: { member: StaffMember }) {
  /*
   * `min-w-0 wrap-anywhere`: a masked address is one unbroken run of bullets
   * and letters, and `MaskedValue` puts it in an `inline-flex`, so its flex
   * item refuses to shrink below its min-content width and the text spills out
   * of the card's meta column at 360px. `break-words` cannot fix that — only
   * `overflow-wrap: anywhere` shrinks the min-content contribution itself.
   */
  return (
    <MaskedValue value={member.email} kind="email" className="min-w-0 wrap-anywhere" />
  )
}

/**
 * Live sessions.
 *
 * Zero is muted rather than absent: it is the answer to "is this person signed
 * in anywhere?", and after a suspension it is the field that confirms the
 * revocation actually happened.
 */
export function SessionsCell({ member }: { member: StaffMember }) {
  if (member.activeSessionsCount === 0) {
    return <span className="tabular text-foreground-subtle">0</span>
  }
  return <span className="tabular">{member.activeSessionsCount}</span>
}
