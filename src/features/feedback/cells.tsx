import { MessageSquare, Paperclip } from 'lucide-react'

import { MaskedValue } from '@/components/display'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import { TONE_CLASSES } from '@/lib/status'
import type { Feedback, FeedbackActor } from '@/types/feedback'

import { describeFeedbackType } from './labels'

/**
 * Cell renderers for the feedback queue.
 *
 * Separated from `feedbackColumns.tsx` so that file exports only its column
 * configuration — a module mixing component and non-component exports breaks
 * React Fast Refresh, and the lint rule enforcing that is worth respecting.
 *
 * One rule runs through all four: **a relation may be absent.** `user`,
 * `assignedAdmin` and `_count` are optional in `feedbackSchema` because the
 * mutation responses omit them (§3.2), and `profile` is nullable on the wire
 * for any reporter who never finished profile setup. Every cell below renders
 * something honest when the data is not there, rather than assuming the list
 * route's completeness and crashing on a shape the contract permits.
 */

/**
 * The best name available for an actor, and whether it is a real one.
 *
 * Returned as a pair rather than a string because the two cases are rendered
 * differently: a display name is plain text, an email address is masked
 * (plan.md §3.9) and needs `wrap-anywhere` to survive a 328px card track.
 */
function actorName(
  actor: FeedbackActor | null | undefined,
): { kind: 'name'; value: string } | { kind: 'email'; value: string } | null {
  if (!actor) return null
  if (actor.profile?.displayName)
    return { kind: 'name', value: actor.profile.displayName }
  if (actor.email) return { kind: 'email', value: actor.email }
  return null
}

/**
 * What the ticket is about, over what kind of thing it is.
 *
 * `subject` is truncated to one line with the full text in a `title`. Support
 * subjects are written by users on a phone keyboard and run long; a wrapping
 * subject would make row heights unpredictable and destroy the queue's
 * scannability, which is the one thing this column is for.
 */
export function SubjectCell({ ticket }: { ticket: Feedback }) {
  const type = describeFeedbackType(ticket.type)
  const Icon = type.icon

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-medium" title={ticket.subject}>
        {ticket.subject}
      </span>
      {/*
       * The type carries an icon and no colour. Colouring a category would
       * tell an operator that a bug outranks a report, which is a priority
       * question the row already answers in its own column (§5.2).
       */}
      <span className="flex items-center gap-1 text-caption text-foreground-muted">
        <Icon className="size-3 shrink-0" aria-hidden="true" />
        {type.label}
      </span>
    </span>
  )
}

/**
 * Who filed it.
 *
 * ⚠️ `profile` is nullable and this is the cell that meets that fact first. A
 * reporter who signed up and never set a display name has an email address and
 * nothing else — and they are disproportionately likely to be the ones filing
 * bugs about onboarding.
 */
export function ReporterCell({ ticket }: { ticket: Feedback }) {
  const name = actorName(ticket.user)

  if (!name) {
    return <span className="text-caption text-foreground-subtle">Unknown</span>
  }

  if (name.kind === 'email') {
    /*
     * `min-w-0 wrap-anywhere`: a masked address is one unbroken run of bullets
     * and letters inside an `inline-flex`, so the flex item refuses to shrink
     * below its min-content width and spills out of the card's meta column at
     * 360px. `break-words` cannot fix that — only `overflow-wrap: anywhere`
     * lowers the min-content contribution itself (§6, the A1 defect).
     */
    return (
      <MaskedValue value={name.value} kind="email" className="min-w-0 wrap-anywhere" />
    )
  }

  const username = ticket.user?.profile?.username

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate">{name.value}</span>
      {username ? (
        /*
         * `block`: `truncate-id` sets overflow and text-overflow, which an
         * inline span ignores — the S5 defect, not repeated.
         */
        <span
          className="block truncate-id text-caption text-foreground-muted"
          title={username}
        >
          @{username}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Who is working it, or that nobody is.
 *
 * "Unassigned" is a **rendered state, not a filter**. There is no query value
 * that means unassigned — `assignedAdminId=null` is compared as the literal
 * string and matches nothing (§3.6) — so an operator can see the gap in the
 * column but cannot ask the server for it. The queue does not pretend
 * otherwise by offering a filter that would return an empty page.
 */
export function AssigneeCell({ ticket }: { ticket: Feedback }) {
  const name = actorName(ticket.assignedAdmin)

  if (!name) {
    /*
     * Built from `TONE_CLASSES` rather than hand-picked colours, and
     * deliberately not a `StatusBadge`: "Unassigned" is the *absence* of a
     * value, not a member of any backend enum, and giving it a status domain
     * would invite someone to filter on it — which this API cannot do (§3.6).
     * `warning` because an unworked ticket is a debt to a waiting user, the
     * same reason `PENDING` carries that tone.
     */
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-sm px-2 py-1 text-overline whitespace-nowrap uppercase',
          TONE_CLASSES.warning,
        )}
      >
        Unassigned
      </span>
    )
  }

  if (name.kind === 'email') {
    return (
      <MaskedValue value={name.value} kind="email" className="min-w-0 wrap-anywhere" />
    )
  }

  return <span className="truncate">{name.value}</span>
}

/**
 * How much conversation and evidence the ticket carries.
 *
 * Two numbers rather than one, because they answer different questions: a
 * reply count says whether anyone has responded, and an attachment count says
 * whether opening the ticket is worth doing on a phone.
 *
 * ⚠️ `_count` is a **list-route field**. The detail route omits it, and the
 * mutation responses omit it too, so this cell falls back to the arrays when
 * they are present and renders an em dash when neither is — never a
 * confident `0` it cannot support.
 */
export function ActivityCell({ ticket }: { ticket: Feedback }) {
  const replies = ticket._count?.replies ?? ticket.replies?.length
  const attachments = ticket._count?.attachments ?? ticket.attachments?.length

  if (replies === undefined && attachments === undefined) {
    return <span className="text-caption text-foreground-subtle">—</span>
  }

  return (
    <span className="flex items-center gap-3 whitespace-nowrap">
      <span
        className="flex items-center gap-1 text-caption text-foreground-muted"
        title={`${formatCount(replies ?? 0)} ${replies === 1 ? 'reply' : 'replies'}`}
      >
        <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="tabular">{formatCount(replies ?? 0)}</span>
      </span>
      <span
        className="flex items-center gap-1 text-caption text-foreground-muted"
        title={`${formatCount(attachments ?? 0)} ${
          attachments === 1 ? 'attachment' : 'attachments'
        }`}
      >
        <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="tabular">{formatCount(attachments ?? 0)}</span>
      </span>
      <span className="sr-only">
        {formatCount(replies ?? 0)} {replies === 1 ? 'reply' : 'replies'},{' '}
        {formatCount(attachments ?? 0)}{' '}
        {attachments === 1 ? 'attachment' : 'attachments'}
      </span>
    </span>
  )
}
