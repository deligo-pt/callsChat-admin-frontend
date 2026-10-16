import { DateTime } from '@/components/display'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import type { HostApplication, LiveHost } from '@/types/hosts'

/**
 * How one application row is drawn (plan.md §4.4, phase H4).
 */

/**
 * Who applied.
 *
 * ⚠️ **Three fallbacks deep, and every one of them is reachable.** The doc
 * shows `user.profile.displayName` populated on every row, but nothing has ever
 * been seen on the wire (plan.md O1), and an applicant who never set a display
 * name is an ordinary account state on any consumer platform. The schema makes
 * the whole `user` object optional for that reason, so this cell has to mean
 * something when it is absent — otherwise one incomplete account renders a
 * blank line in a queue an operator is supposed to triage.
 *
 * Order: display name, then username, then the applicant's own id, which is the
 * last thing that is still traceable.
 */
export function ApplicantCell({ record }: { record: HostApplication }) {
  const profile = record.user?.profile
  const name = profile?.displayName?.trim()
  const username = profile?.username?.trim()

  const primary = name || username || null

  return (
    <span className="flex min-w-[11rem] flex-col gap-0.5">
      {primary ? (
        <span
          className="line-clamp-2 min-w-0 font-medium wrap-anywhere"
          title={primary}
        >
          {primary}
        </span>
      ) : (
        /*
         * ⚠️ Not an em-dash. "No display name" is a fact about the account the
         * operator is about to judge, and a blank cell reads as a rendering
         * bug rather than as information.
         */
        <span className="font-medium text-foreground-muted italic">
          No display name
        </span>
      )}

      {username && name ? (
        <span className="truncate text-caption text-foreground-muted">@{username}</span>
      ) : null}

      {!primary ? (
        <span className="truncate font-mono text-caption text-foreground-muted">
          {record.userId ?? record.id}
        </span>
      ) : null}
    </span>
  )
}

const STATUS_TONE: Readonly<Record<string, string>> = {
  PENDING: 'bg-warning-soft text-warning-foreground',
  APPROVED: 'bg-success-soft text-success-foreground',
  REJECTED: 'bg-danger-soft text-danger-foreground',
}

/**
 * ⚠️ An unknown status renders as itself, not as "Unknown" and not as nothing.
 *
 * The row schema accepts any string because the live table is empty and nothing
 * confirms the three documented values are all there are. If a fourth appears,
 * an operator should see what it actually says.
 */
export function StatusCell({ record }: { record: HostApplication }) {
  const status = record.status?.trim()
  if (!status) return <span className="text-foreground-muted">—</span>

  return (
    <Badge
      className={cn(
        'font-medium',
        STATUS_TONE[status] ?? 'bg-neutral-soft text-neutral-foreground',
      )}
    >
      {status}
    </Badge>
  )
}

/**
 * Category and weekly commitment, which the doc pairs as one line.
 *
 * ⚠️ `niche` is not server-validated (plan.md §3.2), so this may be any string.
 * It is rendered verbatim for the same reason as the status above.
 */
export function NicheCell({ record }: { record: HostApplication }) {
  const niche = record.niche?.trim()
  const hours = record.expectedHostingHoursPerWeek

  return (
    <span className="flex flex-col gap-0.5">
      <span className="truncate">{niche || '—'}</span>
      <span className="truncate text-caption text-foreground-muted">
        {typeof hours === 'number' ? `${hours} hrs/week` : 'No commitment given'}
      </span>
    </span>
  )
}

/** Submitted date. Falls back to an em-dash rather than rendering `Invalid Date`. */
export function SubmittedCell({ record }: { record: HostApplication }) {
  if (!record.createdAt) return <span className="text-foreground-muted">—</span>

  return <DateTime value={record.createdAt} />
}

/* ------------------------------------------------------------------ *
 * Roster cells (phase H6)
 * ------------------------------------------------------------------ */

export function HostCell({ record }: { record: LiveHost }) {
  const profile = record.user?.profile
  const name = profile?.displayName?.trim()
  const username = profile?.username?.trim()

  return (
    <span className="flex min-w-[11rem] flex-col gap-0.5">
      {name || username ? (
        <span
          className="line-clamp-2 min-w-0 font-medium wrap-anywhere"
          title={name || username}
        >
          {name || username}
        </span>
      ) : (
        <span className="font-medium text-foreground-muted italic">
          No display name
        </span>
      )}

      {username && name ? (
        <span className="truncate text-caption text-foreground-muted">@{username}</span>
      ) : null}

      {/*
       * ⚠️ The `userId`, shown deliberately — it is the key every status write
       * uses, and the one an operator needs when reporting that a suspension
       * did not take. The profile `id` is NOT interchangeable with it.
       */}
      <span className="truncate font-mono text-caption text-foreground-muted">
        {record.userId ?? record.id}
      </span>
    </span>
  )
}

const HOST_STATUS_TONE: Readonly<Record<string, string>> = {
  ACTIVE: 'bg-success-soft text-success-foreground',
  SUSPENDED: 'bg-warning-soft text-warning-foreground',
  BANNED: 'bg-danger-soft text-danger-foreground',
}

export function HostStatusCell({ record }: { record: LiveHost }) {
  const status = record.status?.trim()
  if (!status) return <span className="text-foreground-muted">—</span>

  return (
    <Badge
      className={cn(
        'font-medium',
        HOST_STATUS_TONE[status] ?? 'bg-neutral-soft text-neutral-foreground',
      )}
    >
      {status}
    </Badge>
  )
}

/**
 * Live hours, diamonds and followers.
 *
 * ⚠️ `totalLiveHours` is a **float** in the contract (`48.5`), so it is
 * formatted rather than passed through `formatCount`, which would read it as a
 * whole number and report 48 hours for someone who streamed 48 and a half.
 */
export function HostActivityCell({ record }: { record: LiveHost }) {
  const hours = record.totalLiveHours
  const diamonds = record.totalDiamondsEarned
  const followers = record.followersCount

  return (
    <span className="flex flex-col gap-0.5">
      <span className="truncate tabular">
        {typeof hours === 'number' ? `${hours} live hrs` : 'No live hours'}
      </span>
      <span className="truncate tabular text-caption text-foreground-muted">
        {typeof diamonds === 'number' ? `${formatCount(diamonds)} diamonds` : '—'}
        {typeof followers === 'number' ? ` · ${formatCount(followers)} followers` : ''}
      </span>
    </span>
  )
}

/** Why a host is off the platform, when the record says. */
export function SuspensionReasonCell({ record }: { record: LiveHost }) {
  const reason = record.suspendedReason?.trim()
  if (!reason) return <span className="text-foreground-muted">—</span>

  return (
    <span className="line-clamp-2 wrap-anywhere" title={reason}>
      {reason}
    </span>
  )
}
