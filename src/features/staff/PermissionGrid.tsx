import { Lock } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/cn'
import { MODULE_PERMISSION_VALUES, type ModulePermission } from '@/types/staff'

import {
  MODULE_PERMISSION_GROUPS,
  MODULE_PERMISSIONS,
  hasGrantableKey,
  type ModulePermissionDescriptor,
} from './permissionMap'

/**
 * The module permission keys as an editable grid (staff_management_plan.md §5.5).
 *
 * Nine rows, of which **six are editable**: eight keys the API grants, plus one
 * it enforces and refuses to grant (see below).
 *
 * The module's most consequential control, shared by create and detail. Five
 * decisions are baked in, each answering something the API does not:
 *
 * - **Descriptions are on screen, not in tooltips.** `USER_MODERATE` nowhere
 *   states that it carries session revocation. This is where a Super Admin
 *   decides what a colleague may do to a real person's account, and the
 *   consequence belongs at the moment of the decision.
 * - **Three keys are shown, locked, with their reason.** Two are
 *   `verifySuperAdmin`-guarded, so granting them buys nothing; the third,
 *   `FEEDBACK_MANAGEMENT`, is enforced by `/admin/feedbacks/*` and then
 *   rejected by every write route, so nobody can hold it at all
 *   (feedback_management_plan.md §3.1). Hiding any of them would leave an
 *   operator comparing the doc's key list against a shorter grid, unable to
 *   tell whether the panel or the doc was stale.
 * - **Ungranted is the default.** Denied by default, plan.md §8.
 * - **The value is the whole array**, never a delta — `PATCH /permissions`
 *   replaces the set outright (§3.3), so the control that feeds it is the
 *   complete answer by construction.
 * - **`onChange` emits keys in canonical order**, so two equal sets are equal
 *   arrays and a dirty check cannot be fooled by click order.
 */

export interface PermissionGridProps {
  value: readonly ModulePermission[]
  onChange: (next: readonly ModulePermission[]) => void
  /** Whole-grid lock — a read-only viewer, or a save in flight. */
  disabled?: boolean
  /** Labels the group list for assistive tech. Required: it is a real control. */
  'aria-labelledby'?: string
  className?: string
}

function GridRow({
  entry,
  checked,
  disabled,
  onToggle,
}: {
  entry: ModulePermissionDescriptor
  checked: boolean
  disabled: boolean
  onToggle: (next: boolean) => void
}) {
  const id = `permission-${entry.key}`
  const descriptionId = `${id}-description`
  /*
   * Two different reasons a row is inert, and the row states which:
   *
   * - `superAdminOnly` — the API accepts the key, but the routes it names are
   *   `verifySuperAdmin`-guarded, so granting it buys nothing.
   * - `ungrantable` — the API *enforces* the key and then rejects it on every
   *   write, because it is missing from the permission enum
   *   (feedback_management_plan.md §3.1). Nobody can hold it at all.
   */
  const locked = entry.superAdminOnly || entry.ungrantable === true

  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-md border border-border p-3',
        locked ? 'bg-surface-muted' : 'bg-surface',
      )}
    >
      {locked ? (
        <Lock
          className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
          aria-hidden="true"
        />
      ) : (
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => onToggle(next === true)}
          aria-describedby={descriptionId}
          className="mt-0.5"
        />
      )}

      <div className="min-w-0 space-y-0.5">
        <label
          htmlFor={locked ? undefined : id}
          className={cn(
            'text-body-strong block',
            locked ? 'text-foreground-muted' : 'cursor-pointer',
          )}
        >
          {entry.label}
        </label>
        <p id={descriptionId} className="text-caption text-foreground-muted">
          {entry.description}
        </p>
        {/*
         * Stated per row, not just as a group heading: the row is inert and
         * an operator who reaches for it deserves the reason where they
         * reached, rather than having to look up at a header to find it.
         */}
        {entry.ungrantable === true ? (
          <p className="text-caption text-foreground-subtle">
            Not yet grantable. The backend enforces this permission but does not include
            it in the list it accepts, so only Super Administrators can reach Feedback
            &amp; support today.
          </p>
        ) : entry.superAdminOnly ? (
          <p className="text-caption text-foreground-subtle">
            Super Administrators hold this already. Granting it to an Admin or Moderator
            has no effect — the routes it names refuse anyone else.
          </p>
        ) : null}
      </div>
    </li>
  )
}

export function PermissionGrid({
  value,
  onChange,
  disabled = false,
  'aria-labelledby': labelledBy,
  className,
}: PermissionGridProps) {
  const granted = new Set(value)

  function toggle(key: ModulePermission, next: boolean) {
    const updated = new Set(granted)
    if (next) updated.add(key)
    else updated.delete(key)

    // Canonical order, so an equal set is always an equal array.
    onChange(MODULE_PERMISSION_VALUES.filter((candidate) => updated.has(candidate)))
  }

  return (
    <div
      className={cn('space-y-5', className)}
      role="group"
      {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}
    >
      {MODULE_PERMISSION_GROUPS.map((group) => {
        const entries = MODULE_PERMISSIONS.filter((entry) => entry.group === group)
        if (entries.length === 0) return null

        const restricted = entries.every((entry) => entry.superAdminOnly)

        return (
          /*
           * A `fieldset`, not a `section` with an `h3`.
           *
           * These labels were headings, which made the page jump from its `h1`
           * straight to `h3` — a real `heading-order` violation — and left a
           * screen-reader user navigating by heading on "Analytics" with no
           * indication it named a group of checkboxes. A `legend` names the
           * group for assistive tech without claiming a place in the document
           * outline, which is exactly what these are.
           */
          <fieldset key={group} className="min-w-0 space-y-2">
            <legend className="mb-2 flex w-full flex-wrap items-center justify-between gap-2">
              <span className="text-overline text-foreground-subtle uppercase">
                {group}
              </span>
              {restricted ? (
                <span className="text-caption text-foreground-subtle">
                  Super Admin only
                </span>
              ) : null}
            </legend>

            <ul className="space-y-2">
              {entries.map((entry) => (
                <GridRow
                  key={entry.key}
                  entry={entry}
                  /*
                   * `hasGrantableKey` is what stops an ungrantable key reaching
                   * a request body, and it does it in the type system rather
                   * than by convention — its row renders no checkbox, so the
                   * guard inside `onToggle` is unreachable, but the narrowing
                   * is what makes `toggle` accept the key at all.
                   */
                  checked={hasGrantableKey(entry) && granted.has(entry.key)}
                  disabled={disabled}
                  onToggle={(next) => {
                    if (hasGrantableKey(entry)) toggle(entry.key, next)
                  }}
                />
              ))}
            </ul>
          </fieldset>
        )
      })}
    </div>
  )
}
