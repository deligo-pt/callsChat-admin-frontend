import { Link } from 'react-router'

import { ROUTES } from '@/app/routes'
import {
  CopyableId,
  DateTime,
  MaskedValue,
  RecordHeader,
  StatusBadge,
} from '@/components/display'
import type { Feedback } from '@/types/feedback'

import { describeFeedbackType } from '../labels'

/**
 * Who filed this, what it is, and where it stands
 * (feedback_management_plan.md §5.4).
 *
 * Two decisions worth stating:
 *
 * - **The reporter's name links to their account.** This is the one
 *   cross-module link in the plan, and the reason Feedback sits in the
 *   Community section rather than in one of its own (§4.2): moving between a
 *   ticket and the account that filed it is the expected path, not a detour.
 * - **The ticket id is `CopyableId`, not decoration.** "Take a look at this
 *   one" is the most common thing an operator says about a ticket, and the id
 *   is what they paste when the link is not to hand.
 */
export function TicketHeader({ ticket }: { ticket: Feedback }) {
  const type = describeFeedbackType(ticket.type)
  const TypeIcon = type.icon

  /*
   * `profile` is nullable on the wire — a reporter who never finished profile
   * setup has an email address and nothing else. That is not an edge case
   * here: those are disproportionately the people filing bugs about onboarding.
   */
  const displayName = ticket.user?.profile?.displayName
  const email = ticket.user?.email

  return (
    <RecordHeader
      // The page's only name for its subject, so it carries the h1.
      as="h1"
      title={ticket.subject}
      identifiers={
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <CopyableId value={ticket.id} />
          <span aria-hidden="true">·</span>

          {ticket.user ? (
            <Link
              to={ROUTES.user(ticket.user.id)}
              className="truncate font-medium text-primary hover:underline"
            >
              {displayName ?? 'View reporter'}
            </Link>
          ) : (
            <span className="text-foreground-subtle">Reporter unavailable</span>
          )}

          {email ? (
            <>
              <span aria-hidden="true">·</span>
              {/*
               * `min-w-0 wrap-anywhere`: a masked address is one unbroken run
               * of bullets and letters inside an `inline-flex`, and a flex item
               * does not shrink below its min-content width. `break-words`
               * cannot lower that; only `overflow-wrap: anywhere` can (§6).
               */}
              <MaskedValue
                value={email}
                kind="email"
                className="min-w-0 wrap-anywhere"
              />
            </>
          ) : null}

          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">
            Filed <DateTime value={ticket.createdAt} relative />
          </span>
        </span>
      }
      badges={
        <>
          <StatusBadge domain="feedback" value={ticket.status} />
          <StatusBadge domain="feedbackPriority" value={ticket.priority} />
          {/*
           * The type carries an icon and no tone, unlike the two badges above
           * it. Colouring a category would tell an operator that a bug
           * outranks a report, which is a priority question the badge beside
           * it already answers (§5.2).
           */}
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-surface-muted px-2 py-1 text-overline whitespace-nowrap text-foreground-muted uppercase">
            <TypeIcon className="size-3" aria-hidden="true" />
            {type.label}
          </span>
        </>
      }
    />
  )
}
