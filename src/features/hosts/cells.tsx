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

/* ------------------------------------------------------------------ *
 * Creator Studio — phase W6
 * ------------------------------------------------------------------ */

/** Whole diamonds, defensively — a float must not take the table down. */
function diamonds(amount: number | null | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—'
  return formatCount(amount)
}

/**
 * What the host can actually cash out, and what is already in flight.
 *
 * ⚠️ **`withdrawableDiamonds` is not a spending balance and must never be
 * presented as one.** The platform runs a deliberate dual-balance economy: a
 * user's `diamondBalance` is spending money that can never become fiat, while
 * a host's `withdrawableDiamonds` is gift revenue that can. The whole point is
 * to stop promotional diamonds being laundered into cash-outs. A column that
 * showed one number, or summed the two, would teach an operator the opposite
 * of the rule the backend enforces — so both figures are labelled, every time,
 * and they are never added.
 *
 * ⚠️ **`pendingWithdrawal` is readable and not actionable.** No admin payout
 * endpoint exists (plan.md O3): `/admin/wallet/withdrawals` and
 * `/admin/withdrawals` are both `ROUTE_NOT_FOUND`. An operator can see that
 * money is in flight and can do nothing about it from here, so the cell says
 * "in flight" rather than implying a queue they can work.
 */
export function EarningsCell({ record }: { record: LiveHost }) {
  const pending = record.pendingWithdrawal

  return (
    <span className="flex min-w-[8rem] flex-col gap-0.5">
      {/*
       * ⚠️ The figure and its label are separate elements, not one text node.
       * Run together they read as `12,189withdrawable` to anything parsing
       * text content — a screen reader, a copy-paste, or a test — and the
       * label is the entire reason this number is safe to show.
       */}
      <span className="flex flex-wrap items-baseline gap-1">
        <span className="tabular font-medium">
          {diamonds(record.withdrawableDiamonds)}
        </span>
        <span className="text-caption text-foreground-muted">withdrawable</span>
      </span>

      {typeof pending === 'number' && pending > 0 ? (
        <span className="truncate tabular text-caption text-warning-foreground">
          {diamonds(pending)} in flight
        </span>
      ) : null}
    </span>
  )
}

/**
 * Lifetime gift revenue and the split it was earned under.
 *
 * ⚠️ `totalDiamondsEarned` is gross, before the platform's share, and
 * `revenueSharePercent` is what the host keeps. Showing the percentage beside
 * the total is the only thing that stops the gross number reading as take-home
 * pay — and the split is per host, not a global setting (plan.md O9).
 */
export function LifetimeEarningsCell({ record }: { record: LiveHost }) {
  const share = record.revenueSharePercent

  return (
    <span className="flex min-w-[8rem] flex-col gap-0.5">
      <span className="tabular">{diamonds(record.totalDiamondsEarned)}</span>
      <span className="truncate text-caption text-foreground-muted">
        {typeof record.totalGiftsReceived === 'number'
          ? `${formatCount(record.totalGiftsReceived)} gifts`
          : 'gifts unknown'}
        {typeof share === 'number' ? ` · ${share}% share` : ''}
      </span>
    </span>
  )
}

/**
 * Whether they are broadcasting right now.
 *
 * ⚠️ **This is the one field that changes what a suspension does.** Doc §5.2:
 * suspending a live host ends their broadcast and evicts the room. An operator
 * about to suspend somebody needs to know whether they are about to cut a
 * stream off mid-sentence, and the roster is the only place that can tell them
 * — the panel cannot see rooms at all (plan.md O6).
 */
export function LiveNowCell({ record }: { record: LiveHost }) {
  if (record.isLive !== true) {
    return (
      <span className="text-caption text-foreground-muted">
        {record.lastLiveAt ? <DateTime value={record.lastLiveAt} relative /> : '—'}
      </span>
    )
  }

  return (
    <Badge className="w-fit bg-danger-soft text-danger-foreground">
      <span
        className="mr-1.5 inline-block size-1.5 rounded-full bg-danger"
        aria-hidden="true"
      />
      Live now
    </Badge>
  )
}
