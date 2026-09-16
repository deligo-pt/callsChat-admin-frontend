import { Info } from 'lucide-react'

import { DateTime, StatusBadge } from '@/components/display'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { Feedback, FeedbackReply } from '@/types/feedback'

import { ReplyComposer } from './ReplyComposer'

/**
 * The conversation with the reporter (feedback_management_plan.md §5.5).
 *
 * The stream reads; `ReplyComposer` below it writes. They are one card on
 * purpose — the composer is where the conversation continues, and putting it in
 * a card of its own would separate an operator's reply from the thing they are
 * replying to.
 *
 * Two ordering decisions:
 *
 * - **Replies read downward, oldest first.** That is how a conversation is
 *   read, and it is the opposite of `statusHistory`, which is an audit log and
 *   reads newest first.
 * - **The order is computed, not assumed.** The stream sorts by `createdAt`
 *   rather than trusting or reversing the array, because §2 verified the
 *   ordering of `statusHistory` and never of `replies`. Sorting is correct
 *   whichever way the server sends them; a `reverse()` would be correct only
 *   for one of the two possibilities.
 */

function byOldestFirst(a: FeedbackReply, b: FeedbackReply): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt)
}

function ReplyEntry({ reply }: { reply: FeedbackReply }) {
  /*
   * `profile` is nullable, so the email is the fallback display name — and for
   * a staff sender there is always one.
   */
  const name = reply.sender.profile?.displayName ?? reply.sender.email

  return (
    <li className="space-y-1.5 rounded-md border border-border bg-surface-muted p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="truncate text-body-strong">{name}</span>
        {/*
         * There is no user-side reply route, so every sender here is staff.
         * A role this domain does not know degrades to a neutral badge with a
         * humanised label rather than being special-cased — if the backend ever
         * lets reporters reply, the badge will say so instead of lying.
         */}
        <StatusBadge domain="staffRole" value={reply.sender.role} />
        <span className="text-caption text-foreground-muted">
          <DateTime value={reply.createdAt} relative />
        </span>
      </div>
      {/*
       * `whitespace-pre-wrap` because a reply is written prose and its line
       * breaks are meaning; `wrap-anywhere` because a reply may quote the
       * reporter's unbroken stack trace back at them.
       */}
      <p className="max-w-prose text-body wrap-anywhere whitespace-pre-wrap">
        {reply.message}
      </p>
    </li>
  )
}

export function ReplyStream({ ticket }: { ticket: Feedback }) {
  const replies = [...(ticket.replies ?? [])].sort(byOldestFirst)
  const newest = replies.at(-1)

  /*
   * ⚠️ §3.3 — the single most destructive trap in this module, defused here.
   *
   * `POST /:id/reply` silently copies the reply's `message` into the ticket's
   * `adminResponse`. So in the normal case the field is a duplicate of the
   * newest reply and showing it would put the same sentence on screen twice,
   * one of them under a heading implying it was written separately.
   *
   * It carries real information in exactly one case: when it *differs*, which
   * means somebody set it out of band — through `PATCH /:id`, or before the
   * reply stream existed. Then it is shown, labelled as such.
   *
   * The panel never writes this field. The reply composer is its only writer,
   * and it writes it by accident.
   */
  const outOfBandResponse =
    ticket.adminResponse && ticket.adminResponse !== newest?.message
      ? ticket.adminResponse
      : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversation</CardTitle>
        <CardDescription>
          Everything sent to the reporter, oldest first. Replies cannot be edited or
          withdrawn once sent.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {outOfBandResponse ? (
          <div className="space-y-1.5 rounded-md border border-info-soft bg-info-soft/40 p-3">
            <p className="flex items-center gap-2 text-overline text-foreground-muted uppercase">
              <Info className="size-3.5 shrink-0" aria-hidden="true" />
              Set outside the reply stream
            </p>
            <p className="max-w-prose text-body wrap-anywhere whitespace-pre-wrap">
              {outOfBandResponse}
            </p>
            <p className="text-caption text-foreground-muted">
              This ticket carries an admin response that does not match any reply below,
              so it was written somewhere other than here. Sending a reply will
              overwrite it.
            </p>
          </div>
        ) : null}

        {replies.length === 0 ? (
          <p className="text-body text-foreground-muted">
            {/*
             * The second sentence is the point of the whole module, so it is
             * stated rather than implied by an empty box.
             */}
            No replies yet.{' '}
            <span className="text-foreground">The reporter has not heard back.</span>
          </p>
        ) : (
          <ul className="space-y-3">
            {replies.map((reply) => (
              <ReplyEntry key={reply.id} reply={reply} />
            ))}
          </ul>
        )}

        <Separator />

        <ReplyComposer ticket={ticket} />
      </CardContent>
    </Card>
  )
}
