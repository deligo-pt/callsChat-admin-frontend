import { ShieldAlert, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/cn'
import { TONE_CLASSES } from '@/lib/status'

import { isSafeBootstrapUrl } from './safeUrl'
import { isValidSemver } from './semver'

/**
 * The read-only display pieces this module's cards share (plan.md §5.7).
 *
 * Separated from the cards so those files export components only — a module
 * mixing a component and a plain function breaks React Fast Refresh, which is
 * the same rule that split `cells.tsx` out of `feedbackColumns.tsx`.
 */

/** One labelled value in a card. Label muted, value in body colour. */
export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-x-4 gap-y-1 sm:flex-row">
      <span className="shrink-0 text-caption text-foreground-muted sm:w-44 sm:pt-0.5">
        {label}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-body wrap-anywhere">{children}</div>
        {hint ? <div className="text-caption text-foreground-muted">{hint}</div> : null}
      </div>
    </div>
  )
}

/** A value the record does not carry. Stated, never left blank. */
export function NotSet({ children = 'Not set' }: { children?: React.ReactNode }) {
  return <span className="text-foreground-subtle">{children}</span>
}

/** A boolean, as words rather than a tick an operator has to interpret. */
export function BooleanValue({
  value,
  on = 'On',
  off = 'Off',
  danger = false,
}: {
  value: boolean
  on?: string
  off?: string
  danger?: boolean
}) {
  if (!value) return <span className="text-foreground-muted">{off}</span>

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-2 py-1 text-overline uppercase',
        danger ? TONE_CLASSES.danger : TONE_CLASSES.info,
      )}
    >
      {on}
    </span>
  )
}

/**
 * A warning that the value **currently stored on the server** is not a secure
 * web address (plan.md §3.2).
 *
 * Since B2 these fields are inputs, so there is no anchor to withhold — but
 * the danger did not go away with the link. `storeUrl`, `privacyPolicyUrl` and
 * `termsUrl` are unvalidated server-side and served to every mobile client
 * from a public endpoint, and a poisoned one is live *right now*, not on save.
 *
 * So the notice is about the record, not about the field's current text: it
 * appears the moment the page opens and stays until the stored value is
 * repaired. Form validation catches what an operator is about to send; this
 * catches what was already sent.
 */
export function UnsafeStoredUrlNotice({ stored }: { stored: string }) {
  if (isSafeBootstrapUrl(stored)) return null

  return (
    <p className="flex items-start gap-1.5 text-caption text-danger-foreground">
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        The saved value is not a secure web address, and mobile clients are being given
        it now. Replace it with an https:// link.
      </span>
    </p>
  )
}

/**
 * A version string, flagged when it is not one.
 *
 * ⚠️ `blockedVersions` accepts entries that are not versions (plan.md §3.4).
 * Such an entry matches no client, so an operator believes a bad build is
 * barred when it is not — the whole reason this component exists.
 */
export function VersionTag({ value }: { value: string }) {
  const valid = isValidSemver(value)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-caption',
        valid ? 'bg-surface-muted text-foreground' : TONE_CLASSES.warning,
      )}
      title={valid ? undefined : 'Not a version number — this matches no client'}
    >
      {!valid ? (
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      ) : null}
      {value}
      {!valid ? <span className="sr-only"> — matches no client</span> : null}
    </span>
  )
}
