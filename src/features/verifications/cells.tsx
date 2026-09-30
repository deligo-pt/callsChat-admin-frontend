import { Building2, FileWarning, Files, UserRound } from 'lucide-react'

import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import { TONE_CLASSES } from '@/lib/status'
import type { Verification } from '@/types/verification'

import { resolveSubject, SUBJECT_UNKNOWN_LABEL } from './subject'

/**
 * Cell renderers for the verification queue.
 *
 * Separated from `verificationColumns.tsx` so that file exports only its column
 * configuration — a module mixing component and non-component exports breaks
 * React Fast Refresh.
 *
 * Two rules run through all three cells:
 *
 * 1. **Every string here is attacker-controlled.** A display name, a username
 *    and a company name are all typed by the applicant. They are rendered as
 *    text, truncated, and never turned into anything else.
 * 2. **A relation may be absent, or present and empty.** `applicant` arrives as
 *    an object of nulls on business rows (§3.4), which is a different failure
 *    from its being missing — and a `?.` check catches only the second.
 */

/**
 * Who the application is about.
 *
 * ⚠️ The fallback is a sentence, not an em dash. `resolveSubject` returns `null`
 * for three live applications, and a blank cell there reads as a broken
 * renderer — which sends an operator looking for a bug in the panel instead of
 * reporting one against the API (§3.4).
 */
export function SubjectCell({ record }: { record: Verification }) {
  const subject = resolveSubject(record)

  if (!subject.name) {
    return (
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-foreground-subtle italic">
          {SUBJECT_UNKNOWN_LABEL}
        </span>
        {/*
         * The id is the only handle an operator has on a row the service will
         * not name, so it is offered rather than withheld — it is what they
         * would quote when asking the backend team about it.
         */}
        <span className="block truncate-id text-caption text-foreground-muted">
          {record.id}
        </span>
      </span>
    )
  }

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-medium" title={subject.name}>
        {subject.name}
      </span>
      {subject.secondary ? (
        /*
         * `block`: `truncate-id` sets overflow and text-overflow, which an
         * inline span ignores — the S5 defect, not repeated.
         */
        <span
          className="block truncate-id text-caption text-foreground-muted"
          title={subject.secondary}
        >
          {subject.secondary}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Identity or business.
 *
 * ⚠️ **An icon and a label, with no tone.** Colouring this would tell an
 * operator that one kind of application outranks the other, and nothing in the
 * record supports that — unlike `status`, which carries real urgency (§5.2).
 */
export function TypeCell({ record }: { record: Verification }) {
  const isBusiness = record.targetType === 'BUSINESS_ENTITY'
  const Icon = isBusiness ? Building2 : UserRound

  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-foreground-muted">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {isBusiness ? 'Business' : 'Identity'}
    </span>
  )
}

/**
 * How much there is to review — and whether there is anything at all.
 *
 * ⚠️ **Zero is flagged, not rendered as a quiet `0`.** All three pending
 * business applications on the live service carry no documents, so this is a
 * common state rather than an edge case, and it is the one fact that decides
 * whether the application can be reviewed at all (§3.5). An operator scanning
 * the queue should be able to see it without opening the row.
 *
 * `documentCount` is a **list-route field**; the detail route omits it. This
 * cell renders an em dash rather than a confident `0` when it is absent, which
 * is the same rule `ActivityCell` follows in the feedback queue.
 */
export function DocumentsCell({ record }: { record: Verification }) {
  const count = record.documentCount ?? record.documents?.length

  if (count === undefined) {
    return <span className="text-caption text-foreground-subtle">—</span>
  }

  if (count === 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-overline whitespace-nowrap uppercase',
          TONE_CLASSES.warning,
        )}
      >
        <FileWarning className="size-3 shrink-0" aria-hidden="true" />
        None
        <span className="sr-only">— nothing was submitted to review</span>
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-foreground-muted">
      <Files className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="tabular">{formatCount(count)}</span>
      <span className="sr-only">{count === 1 ? 'document' : 'documents'}</span>
    </span>
  )
}
